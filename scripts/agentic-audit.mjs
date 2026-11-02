// Audits the production build with the Agentic browsing category of Lighthouse (llms.txt, WebMCP, the
// accessibility tree that agents read) and writes the result to the job summary of CI.
//
// Run it after `npm run build`: it serves the build with `next start`, runs Lighthouse in the Chromium of
// Playwright and exits with 1 when an audit fails. CI runs it without blocking.

import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LIGHTHOUSE = 'lighthouse@13.6.0'
const CATEGORY = 'agentic-browsing'
const PORT = 3104
const URL_TO_AUDIT = `http://localhost:${PORT}/`
// WebMCPTesting exposes the WebMCP API of the page; without it the WebMCP audits are not applicable.
// DevToolsWebMCPSupport is the flag the Lighthouse CLI adds itself, repeated so that neither replaces
// the other. Ubuntu 24.04 restricts the user namespaces the sandbox of Chromium needs, and the page is
// our own build. In a container with the default 64 MB of /dev/shm the tab crashes without
// --disable-dev-shm-usage.
const CHROME_FLAGS = '--headless=new --no-sandbox --disable-dev-shm-usage --enable-features=WebMCPTesting,DevToolsWebMCPSupport'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Same rules as the Lighthouse report: a manual or N/A audit does not count, an informative one is shown
// but does not count either, and a scored audit passes from 0.9.
function statusOf(audit) {
  switch (audit.scoreDisplayMode) {
    case 'notApplicable':
      return 'n/a'
    case 'manual':
    case 'informative':
      return 'info'
    case 'error':
      return 'error'
    default:
      return Number(audit.score) >= 0.9 ? 'pass' : 'fail'
  }
}

// The audit is informative and N/A in a browser without WebMCP, so the score alone would hide that the
// tools of the site were never seen.
function toolsDetail(audit) {
  const tools = (audit.details?.items ?? []).flatMap((section) => section.value?.items ?? []).map(({ tool }) => tool)
  return tools.length > 0 ? tools.join(', ') : 'no tools seen'
}

function detailOf(id, audit) {
  return audit.errorMessage ?? audit.explanation ?? audit.displayValue ?? (id === 'webmcp-registered-tools' ? toolsDetail(audit) : undefined)
}

export function auditResults(report) {
  return report.categories[CATEGORY].auditRefs
    .filter((ref) => ref.group !== 'hidden')
    .map(({ id }) => {
      const audit = report.audits[id]
      return { id, title: audit.title, status: statusOf(audit), detail: detailOf(id, audit) }
    })
}

export function failedAudits(report) {
  return auditResults(report).filter(({ status }) => status === 'fail' || status === 'error')
}

export function markdownSummary(report) {
  const results = auditResults(report)
  const counted = results.filter(({ status }) => ['pass', 'fail', 'error'].includes(status))
  const passed = counted.filter(({ status }) => status === 'pass')
  const label = (status) => (status === 'fail' || status === 'error' ? `**${status}**` : status)
  return [
    `### Lighthouse: ${report.categories[CATEGORY].title}`,
    '',
    `**${passed.length}/${counted.length}** audits pass (Lighthouse ${report.lighthouseVersion}, ${report.finalDisplayedUrl})`,
    '',
    ...(report.runWarnings ?? []).flatMap((warning) => [`> Warning: ${warning}`, '']),
    ...results.map(({ id, title, status, detail }) => `- ${label(status)} \`${id}\`: ${title}${detail ? ` (${detail})` : ''}`),
    '',
  ].join('\n')
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.slice(0, 2).join(' ')} exited with ${code}`))))
  })
}

// `next start` cannot take a busy port, and the audit would then report on whatever answers there.
export async function assertNothingAnswers(url) {
  const answers = await fetch(url).then(
    () => true,
    () => false
  )
  if (answers) throw new Error(`${url} already answers, so the audit would not be of this build`)
}

export async function waitForServer(url, server, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const answers = await fetch(url).then(
      (response) => response.ok,
      () => false
    )
    if (server.exitCode !== null) throw new Error(`The server exited with ${server.exitCode}`)
    if (answers) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not answer in ${timeoutMs / 1000} s`)
}

async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const { chromium } = await import('playwright')
  return chromium.executablePath()
}

async function main() {
  await assertNothingAnswers(URL_TO_AUDIT)
  const server = spawn(join(ROOT, 'node_modules', '.bin', 'next'), ['start', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  try {
    await waitForServer(URL_TO_AUDIT, server)
    const outputPath = join(mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'agentic-')), 'report.json')
    await run(
      'npx',
      [
        '--yes',
        LIGHTHOUSE,
        URL_TO_AUDIT,
        `--only-categories=${CATEGORY}`,
        '--output=json',
        `--output-path=${outputPath}`,
        `--chrome-flags=${CHROME_FLAGS}`,
        '--no-enable-error-reporting',
        '--quiet',
      ],
      { cwd: ROOT, env: { ...process.env, CHROME_PATH: await chromePath() } }
    )

    const report = JSON.parse(readFileSync(outputPath, 'utf8'))
    const summary = markdownSummary(report)
    console.log(summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    const failed = failedAudits(report)
    if (failed.length > 0) {
      console.error(`Failing audits: ${failed.map(({ id }) => id).join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    server.kill()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse: Agentic Browsing\n\nThe audit did not run: ${error.message}\n`)
    }
    process.exit(1)
  })
}
