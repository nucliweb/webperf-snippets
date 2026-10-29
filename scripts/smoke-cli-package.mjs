#!/usr/bin/env node
// Installs the CLI the way a user gets it, and talks to its MCP server. It packs cli/ with the snippets,
// as the publish workflow does, installs the tarball in an empty folder (npm adds the peer playwright,
// at the version it resolves today), and then checks:
//   1. npm audit of that folder: no high or critical advisory in the tree a user installs today, which
//      floats with the ranges of the dependencies and does not have the overrides of the repository
//   2. without Chromium, through `webperf-snippets mcp`: list_snippets answers, and run_snippet says how
//      to install the browser
//   3. after `npx playwright install chromium` in that folder: run_snippet measures a local page
// It needs the network (npm and, the first time, the Chromium of that Playwright), so it runs by hand
// before a release of the CLI, not in CI.
//
//   npm run smoke:cli-package

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { listSnippets } from '../cli/src/snippet-names.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'webperf-cli-package-'))
const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const step = (text) => console.log(`\n▸ ${text}`)
const checks = []
const check = (ok, text) => {
  checks.push(ok)
  console.log(`  ${ok ? '✓' : '✗'} ${text}`)
}

async function withServer(env, run) {
  const client = new Client({ name: 'smoke', version: '1.0.0' })
  const command = join(work, 'app/node_modules/.bin/webperf-snippets')
  await client.connect(new StdioClientTransport({ command, args: ['mcp'], cwd: join(work, 'app'), env: { ...process.env, ...env } }))
  try {
    return await run(client)
  } finally {
    await client.close()
  }
}

const page = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<!DOCTYPE html><html><head><title>Smoke</title></head><body><h1>A page to measure</h1><p>Some text.</p></body></html>')
})

try {
  step('Pack the CLI with the snippets')
  const pkg = join(work, 'pkg')
  mkdirSync(pkg)
  for (const entry of ['src', 'package.json', 'README.md']) cpSync(join(ROOT, 'cli', entry), join(pkg, entry), { recursive: true })
  cpSync(join(ROOT, 'snippets'), join(pkg, 'snippets'), { recursive: true })
  const tarball = join(work, npm(['pack', '--silent', '--pack-destination', work], pkg).trim().split('\n').pop())
  console.log(`  ${tarball}`)

  step('Install it in an empty folder')
  const app = join(work, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), '{ "name": "smoke", "private": true }\n')
  npm(['install', '--no-audit', '--no-fund', '--silent', tarball], app)
  const installed = readdirSync(join(app, 'node_modules'))
  check(installed.includes('playwright'), 'npm installed the peer playwright')
  const playwrightVersion = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("playwright/package.json").version)'], { cwd: app, encoding: 'utf8' }))
  console.log(`  playwright ${playwrightVersion}`)

  step('npm audit of the installed tree')
  // npm audit exits with 1 when it finds anything, so its JSON is read from the error as well
  let report
  try {
    report = JSON.parse(npm(['audit', '--json'], app))
  } catch (error) {
    report = JSON.parse(error.stdout)
  }
  const counts = report.metadata.vulnerabilities
  const serious = Object.entries(report.vulnerabilities).filter(([, v]) => v.severity === 'high' || v.severity === 'critical')
  for (const [name, v] of serious) console.log(`  ${v.severity} ${name}: ${[v.via].flat().map((via) => via.title ?? via).join('; ')}`)
  check(serious.length === 0, `no high or critical advisory (${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low)`)

  await new Promise((done) => page.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${page.address().port}/`

  step('Without Chromium')
  const noBrowsers = join(work, 'no-browsers')
  mkdirSync(noBrowsers)
  await withServer({ PLAYWRIGHT_BROWSERS_PATH: noBrowsers }, async (client) => {
    const { structuredContent } = await client.callTool({ name: 'list_snippets', arguments: {} })
    const expected = listSnippets().length
    check(structuredContent.snippets.length === expected, `list_snippets lists ${structuredContent.snippets.length} snippets, as the repository (${expected})`)
    const run = await client.callTool({ name: 'run_snippet', arguments: { url, snippet: 'LCP', waitMs: 0 } })
    check(run.isError && run.content[0].text.includes('npx playwright install chromium'), `run_snippet: ${run.content[0].text}`)
  })

  step('After npx playwright install chromium')
  execFileSync('npx', ['playwright', 'install', 'chromium'], { cwd: app, stdio: 'inherit' })
  await withServer({}, async (client) => {
    const run = await client.callTool({ name: 'run_snippet', arguments: { url, snippet: 'LCP', waitMs: 500 } })
    const result = run.structuredContent?.result
    check(!run.isError && result?.status === 'ok', `run_snippet: LCP ${result?.value} ${result?.unit ?? ''} (${result?.status ?? run.content[0].text})`)
  })
} finally {
  page.close()
  rmSync(work, { recursive: true, force: true })
}

const failed = checks.filter((ok) => !ok).length
console.log(failed ? `\n${failed} check(s) failed` : '\nThe package works as installed')
process.exit(failed ? 1 : 0)
