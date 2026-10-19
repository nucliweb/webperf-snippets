#!/usr/bin/env node
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { CASES } from './cases.mjs'
import { arms as allArms, DEVTOOLS_MCP } from './arms.mjs'
import { parseTranscript, gradeRun, snippetRuns } from './grade.mjs'
import { summarize, markdownSummary } from './summary.mjs'

// Evals of the MCP server: the same question about a local page with a known answer, asked to an agent
// with the webperf MCP server, with Chrome DevTools MCP and the webperf skills, and with Chrome DevTools
// MCP alone. Each run is graded on the diagnosis and measured in tokens, turns and time; transcripts and
// a summary go to workspace/evals-mcp/. Not part of CI: a full run takes a while and uses tokens.
//
//   npm run eval:mcp
//   npm run eval:mcp -- --arm webperf --case lcp-slow-image --repeat 1

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE_DIRS = [join(ROOT, 'scripts/eval-mcp/fixtures'), join(ROOT, 'cli/tests/fixtures')]
const TYPES = { '.html': 'text/html', '.png': 'image/png' }
const CATALOG = readdirSync(join(ROOT, 'snippets'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .flatMap((d) => readdirSync(join(ROOT, 'snippets', d.name)).filter((f) => f.endsWith('.js')).map((f) => `${d.name}/${f.slice(0, -3)}`))

const { values: opts } = parseArgs({
  options: {
    arm: { type: 'string', multiple: true },
    case: { type: 'string', multiple: true },
    repeat: { type: 'string', default: '3' },
    model: { type: 'string', default: 'sonnet' },
    concurrency: { type: 'string', default: '2' },
    'max-cost': { type: 'string', default: '2' },
  },
})

function run(command, args, { cwd, input } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', () => {})
    child.on('error', fail)
    child.on('close', (code) => done({ code, stdout }))
    child.stdin.end(input ?? '')
  })
}

// Serves the fixtures; `/slow/<ms>/<file>` serves a file after a delay
function startServer() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
    const [, delay = 0, name = path] = path.match(/^slow\/(\d+)\/(.+)$/) ?? []
    const file = FIXTURE_DIRS.map((dir) => join(dir, name)).find((f) => !name.includes('..') && existsSync(f))
    if (!file || !name) return res.writeHead(404).end()
    setTimeout(() => res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file)), Number(delay))
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

// The generated skills, as a plugin that loads only for the devtools-skill setup
function buildPlugin(work) {
  const dir = join(work, 'webperf-plugin')
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'webperf-skills', version: '0.0.0', description: 'WebPerf Snippets skills for the MCP evals' }))
  cpSync(join(ROOT, '.claude/skills'), join(dir, 'skills'), { recursive: true })
  return dir
}

// No settings, skills or MCP servers of the machine
const ISOLATED = ['--setting-sources', '', '--strict-mcp-config', '--no-session-persistence']

async function runAgent(arm, prompt, workdir) {
  const config = join(workdir, '.mcp-eval.json')
  writeFileSync(config, JSON.stringify({ mcpServers: arm.mcpServers }))
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--model', opts.model,
    '--tools', arm.tools, '--allowedTools', arm.allowedTools.join(','),
    '--mcp-config', config,
    ...(arm.pluginDir ? ['--plugin-dir', arm.pluginDir] : []),
    ...ISOLATED,
    '--max-budget-usd', opts['max-cost'],
  ]
  const { stdout } = await run('claude', args, { cwd: workdir, input: prompt })
  return stdout
}

async function pool(tasks, size) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

const thousands = (n) => `${(n / 1000).toFixed(1)}k`

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'eval-mcp-'))
  const arms = allArms({ root: ROOT, pluginDir: buildPlugin(work) }).filter((a) => !opts.arm || opts.arm.includes(a.id))
  const cases = CASES.filter((c) => !opts.case || opts.case.includes(c.id))
  if (!arms.length || !cases.length) throw new Error('No arm or case matches the filters')
  const repeat = Number(opts.repeat)
  const out = join(ROOT, 'workspace/evals-mcp', new Date().toISOString().replace(/[:.]/g, '-'))
  mkdirSync(out, { recursive: true })
  console.log(`Arms: ${arms.map((a) => a.id).join(', ')}\nModel: ${opts.model}, ${repeat} runs each, ${DEVTOOLS_MCP}\nOutput: ${out}\n`)

  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const tasks = []
    for (const evalCase of cases) {
      const prompt = evalCase.prompt(`${base}/${evalCase.fixture}`)
      writeFileSync(join(out, `${evalCase.id}.prompt.md`), prompt)
      for (const arm of arms) {
        for (let i = 1; i <= repeat; i++) {
          tasks.push(async () => {
            const workdir = mkdtempSync(join(work, `${arm.id}-${evalCase.id}-${i}-`))
            const raw = await runAgent(arm, prompt, workdir)
            writeFileSync(join(out, `${arm.id}.${evalCase.id}.${i}.jsonl`), raw)
            const transcript = parseTranscript(raw)
            const checks = gradeRun(evalCase, transcript, CATALOG)
            const runs = snippetRuns(transcript, CATALOG)
            const failed = checks.filter((c) => !c.pass).map((c) => c.id)
            const { input, output } = transcript.tokens
            console.log(`${arm.id} ${evalCase.id} #${i}: ${failed.length ? `FAIL ${failed.join(', ')}` : 'pass'} (${thousands(input)} in, ${thousands(output)} out, ${transcript.turns} turns, ${Math.round(transcript.durationMs / 1000)} s)`)
            return {
              arm: arm.id, case: evalCase.id, run: i, checks, tokens: transcript.tokens, durationMs: transcript.durationMs, turns: transcript.turns,
              tools: transcript.calls.map((c) => c.name), snippetRuns: runs, report: transcript.report,
            }
          })
        }
      }
    }
    const results = await pool(tasks, Number(opts.concurrency))
    writeFileSync(join(out, 'summary.json'), JSON.stringify({ model: opts.model, repeat, devtools: DEVTOOLS_MCP, runs: results }, null, 2))
    const markdown = markdownSummary(summarize(results), { model: opts.model, repeat, devtools: DEVTOOLS_MCP })
    writeFileSync(join(out, 'summary.md'), markdown)
    console.log(`\n${markdown}`)
  } finally {
    server.close()
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
