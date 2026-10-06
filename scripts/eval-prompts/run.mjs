#!/usr/bin/env node
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { buildPrompt, cliVersion, PLAYWRIGHT } from '../../lib/snippet-prompt.mjs'
import { CASES } from './cases.mjs'
import { parseTranscript, cliRuns, gradeRun } from './grade.mjs'

// Evals of the Copy prompt: an agent in an empty directory, with no skills, MCP servers or settings,
// receives only the prompt of a snippet and the URL of a local page with a known result. The runner
// grades what it did (grade.mjs) and writes the transcripts and a summary to workspace/evals/.
//
//   npm run eval:prompts                       the CLI published on npm, 3 runs per case
//   npm run eval:prompts -- --local            the CLI of this workspace, packed as on publish
//   npm run eval:prompts -- --case inp-buttons-only --repeat 1 --model opus
//
// The summary measures each run in tokens. A subscription does not bill them, but they count toward
// its usage limits. `--max-cost` stops a run when the cost `claude -p` estimates at API prices goes
// over that amount in dollars, which works as a cap with a subscription too.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE_DIRS = [join(ROOT, 'scripts/eval-prompts/fixtures'), join(ROOT, 'cli/tests/fixtures')]
const TOOLS = 'Bash,Read,Write,Edit,WebFetch'
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

const { values: opts } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    case: { type: 'string', multiple: true },
    repeat: { type: 'string', default: '3' },
    model: { type: 'string', default: 'sonnet' },
    concurrency: { type: 'string', default: '2' },
    'max-cost': { type: 'string', default: '1' },
  },
})

function run(command, args, { cwd, input } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', fail)
    child.on('close', (code) => done({ code, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

// The CLI as `publish-cli.yml` publishes it: the package with the snippets copied in
async function packLocalCli(work) {
  const stage = join(work, 'package')
  for (const entry of ['src', 'package.json', 'README.md']) cpSync(join(ROOT, 'cli', entry), join(stage, entry), { recursive: true })
  cpSync(join(ROOT, 'snippets'), join(stage, 'snippets'), { recursive: true })
  const { code, stdout, stderr } = await run('npm', ['pack', '--silent', '--pack-destination', work], { cwd: stage })
  if (code !== 0) throw new Error(`npm pack failed: ${stderr}`)
  return join(work, stdout.trim().split('\n').at(-1))
}

function startServer() {
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '')
    const file = FIXTURE_DIRS.map((dir) => join(dir, name)).find((f) => !name.includes('..') && existsSync(f))
    if (!file || !name) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

async function reference(evalCase, url, pkg) {
  const args = ['-y', '-p', pkg, '-p', `playwright@${PLAYWRIGHT}`, 'webperf-snippets', url, '--snippet', evalCase.snippet, '--json']
  const { stdout } = await run('npx', args)
  const result = JSON.parse(stdout.slice(stdout.indexOf('{'))).results.find((r) => r.id === evalCase.snippet)
  if (result?.status !== 'ok') throw new Error(`Reference run of ${evalCase.id} failed: ${stdout}`)
  return result.value
}

// Selectors of the interactions file that match nothing on the page
async function missingSelectors(browser, url, interactions) {
  const page = await browser.newPage()
  try {
    await page.goto(url)
    const missing = []
    for (const step of interactions?.interactions ?? []) {
      if (step.selector && (await page.locator(step.selector).count().catch(() => 0)) === 0) missing.push(step.selector)
    }
    return missing
  } finally {
    await page.close()
  }
}

async function runAgent(prompt, workdir) {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--model', opts.model,
    '--tools', TOOLS, '--allowedTools', TOOLS,
    '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config', '--no-session-persistence',
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

const percent = (n, total) => `${Math.round((100 * n) / total)}%`
const thousands = (n) => `${(n / 1000).toFixed(1)}k`

async function main() {
  const cases = opts.case ? CASES.filter((c) => opts.case.includes(c.id)) : CASES
  if (cases.length === 0) throw new Error(`No case named ${opts.case.join(', ')}. Cases: ${CASES.map((c) => c.id).join(', ')}`)
  const repeat = Number(opts.repeat)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = join(ROOT, 'workspace/evals', stamp)
  mkdirSync(out, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'eval-prompts-'))

  const version = cliVersion()
  const pkg = opts.local ? await packLocalCli(work) : `webperf-snippets@${version}`
  console.log(`CLI: ${pkg}\nModel: ${opts.model}, ${repeat} runs per case\nOutput: ${out}\n`)

  const server = await startServer()
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch()

  try {
    const tasks = []
    for (const evalCase of cases) {
      const url = `${base}/${evalCase.fixture}`
      const source = readFileSync(join(ROOT, 'snippets', `${evalCase.path}.js`), 'utf8')
      const prompt =
        buildPrompt({ path: evalCase.path, source, docsPath: evalCase.docsPath, cliVersion: version }).replaceAll(`webperf-snippets@${version}`, pkg) +
        `\nPage to measure: ${url}\n`
      writeFileSync(join(out, `${evalCase.id}.prompt.md`), prompt)
      const expect = { ...evalCase.expect }
      if (expect.reference) expect.reference = { ...expect.reference, value: await reference(evalCase, url, pkg) }
      const graded = { ...evalCase, expect }

      for (let i = 1; i <= repeat; i++) {
        tasks.push(async () => {
          const workdir = mkdtempSync(join(work, `${evalCase.id}-${i}-`))
          const raw = await runAgent(prompt, workdir)
          writeFileSync(join(out, `${evalCase.id}.${i}.jsonl`), raw)
          const transcript = parseTranscript(raw)
          const file = join(workdir, 'interactions.json')
          let interactions = null
          try {
            interactions = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
          } catch {
            interactions = { interactions: [] }
          }
          const missing = evalCase.interactive ? await missingSelectors(browser, url, interactions) : []
          const checks = gradeRun(graded, transcript, { pkg, interactions, missingSelectors: missing })
          const failed = checks.filter((c) => !c.pass).map((c) => c.id)
          const { input, output } = transcript.tokens
          console.log(`${evalCase.id} #${i}: ${failed.length ? `FAIL ${failed.join(', ')}` : 'pass'} (${thousands(input)} in, ${thousands(output)} out, ${Math.round(transcript.durationMs / 1000)} s)`)
          return { case: evalCase.id, run: i, checks, tokens: transcript.tokens, apiCostUsd: transcript.apiCostUsd, durationMs: transcript.durationMs, turns: transcript.turns, cliRuns: cliRuns(transcript, evalCase.snippet).length, report: transcript.report }
        })
      }
    }

    const runs = await pool(tasks, Number(opts.concurrency))
    writeFileSync(join(out, 'summary.json'), JSON.stringify({ pkg, model: opts.model, repeat, runs }, null, 2))

    console.log('')
    for (const evalCase of cases) {
      const own = runs.filter((r) => r.case === evalCase.id)
      const average = (value) => own.reduce((s, r) => s + value(r), 0) / own.length
      const input = average((r) => r.tokens.input)
      const output = average((r) => r.tokens.output)
      const seconds = average((r) => r.durationMs) / 1000
      console.log(`${evalCase.id}  (average ${thousands(input)} tokens in, ${thousands(output)} out, ${Math.round(seconds)} s)`)
      for (const id of own[0].checks.map((c) => c.id)) {
        const results = own.map((r) => r.checks.find((c) => c.id === id))
        const passed = results.filter((c) => c?.pass).length
        const details = results.filter((c) => c && !c.pass && c.detail).map((c) => c.detail)
        console.log(`  ${id.padEnd(22)} ${String(passed).padStart(2)}/${own.length} ${percent(passed, own.length).padStart(4)}${details.length ? `  ${details.join(' | ')}` : ''}`)
      }
    }
  } finally {
    await browser.close()
    server.close()
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
