import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auditFixPrompt, fixPrompt, hasIssuesToFix } from './fix-prompt.js'

const snippets = JSON.parse(readFileSync(new URL('../snippets.json', import.meta.url), 'utf8'))
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../scripts/fixtures/results/${name}.json`, import.meta.url), 'utf8'))
const snippetOf = (result) => snippets.find((s) => s.path.endsWith(`/${result.script}`))
const PAGE = 'https://example.test/products?id=1'
const promptFor = (result) => fixPrompt({ snippet: snippetOf(result), result, url: PAGE, date: '2026-10-26T20:00:00.000Z', extensionVersion: '0.3.0' })

test('only a result with errors or warnings has issues to fix', () => {
  assert.equal(hasIssuesToFix(fixture('seeded-Oversized-Images')), true)
  // An info alone is not something to fix
  assert.equal(hasIssuesToFix(fixture('seeded-Content-Visibility')), false)
  assert.equal(hasIssuesToFix({ script: 'TTFB', status: 'ok', value: 57, rating: 'good' }), false)
  assert.equal(hasIssuesToFix({ script: 'TTFB', status: 'error', error: 'No navigation entry' }), false)
  assert.equal(promptFor(fixture('seeded-Content-Visibility')), null)
})

test('the prompt says what is wrong, where and with which values, for an agent in the repository of the site', () => {
  const prompt = promptFor(fixture('seeded-Oversized-Images'))
  assert.match(prompt, /^# Fix the issues WebPerf Snippets found on https:\/\/example\.test\/products\?id=1\n/)
  assert.match(prompt, /You are working in the repository of this site/)
  assert.match(prompt, /Snippet: `Media\/Oversized-Images`/)
  assert.match(prompt, /Measured: 2026-10-26T20:00:00\.000Z with the WebPerf Snippets extension 0\.3\.0/)
  // Each issue with its severity, code and target
  assert.match(prompt, /^- warning `undersized` \(http:\/\/127\.0\.0\.1:8000\/hero\.png\): hero\.png: 100x100 file for a 600x400 slot/m)
  // The details with the labels and units of the view
  assert.match(prompt, /^- Device pixel ratio: 1$/m)
  assert.match(prompt, /^- Wasted: 0 B$/m)
  // The rows the issues point to, with the whole URL, which an agent can open
  assert.match(prompt, /^\| Selector \| URL \|/m)
  assert.match(prompt, /^\| img#hero \| http:\/\/127\.0\.0\.1:8000\/hero\.png \|/m)
})

test('the prompt checks the fix with the CLI, before and after, on a URL where the change can be tested', () => {
  const prompt = promptFor(fixture('seeded-Oversized-Images'))
  assert.match(prompt, /Ask for the URL where you can test the change/)
  assert.match(prompt, /webperf-snippets@\d+\.\d+\.\d+ -p playwright@[\d.]+ webperf-snippets <url> --snippet Oversized-Images --json > before\.json/)
  assert.match(prompt, /webperf-snippets <url> --snippet Oversized-Images --baseline before\.json --json > after\.json/)
  assert.match(prompt, /compare the `issues` of both files by `code` and `target`/)
  // A run of a page with errors exits with 1, and still writes its JSON
  assert.match(prompt, /exits with `1` while the page has errors/)
})

test('a result with many issues and rows fits in a prompt, and says how many it left out', () => {
  const result = fixture('heavy-Image-Element-Audit')
  const prompt = promptFor(result)
  const issueLines = prompt.split('\n').filter((line) => /^- (error|warning) `/.test(line))
  assert.equal(issueLines.length, 30)
  // The errors first
  assert.match(issueLines[0], /^- error /)
  const toFix = result.issues.filter((i) => i.severity !== 'info').length
  assert.match(prompt, new RegExp(`And ${toFix - 30} more issues`))
  // The lines of the table, without its header and separator
  const rows = prompt.split('\n').filter((line) => line.startsWith('| ')).length - 2
  assert.ok(rows > 0 && rows <= 20, `${rows} rows`)
  assert.ok(prompt.length <= 16 * 1024, `${prompt.length} characters`)
})

test('a table cell keeps its pipes and line breaks from breaking the table', () => {
  const result = {
    script: 'Oversized-Images',
    status: 'ok',
    issues: [{ severity: 'warning', code: 'x', target: 'a|b', message: 'One' }],
    items: [{ selector: 'a|b', note: 'two\nlines' }],
  }
  const prompt = promptFor(result)
  assert.match(prompt, /^\| a\\\|b \| two lines \|$/m)
})

test('a page without an address the panel could read is named as the inspected page', () => {
  const result = fixture('seeded-Oversized-Images')
  const prompt = fixPrompt({ snippet: snippetOf(result), result, date: '2026-10-26T20:00:00.000Z', extensionVersion: '0.3.0' })
  assert.match(prompt, /^# Fix the issues WebPerf Snippets found on the inspected page\n/)
  assert.match(prompt, /^Page: the inspected page$/m)
})

// The rows of an audit, as the panel keeps them, from the results of the fixtures for each step
const auditRows = (prefix, change = (r) => r) =>
  snippets
    .filter((s) => typeof s.audit === 'number')
    .sort((a, b) => a.audit - b.audit)
    .map((snippet) => ({ snippet, result: change(fixture(`${prefix}-${snippet.path.split('/').pop()}`)) }))
const auditPromptFor = (rows) => auditFixPrompt({ rows, url: PAGE, date: '2026-10-26T20:00:00.000Z', extensionVersion: '0.3.0' })

test('the prompt to fix an audit lists the errors and warnings of each snippet under its title and step', () => {
  const rows = auditRows('seeded')
  const prompt = auditPromptFor(rows)
  assert.match(prompt, /^# Fix the issues WebPerf Snippets found on https:\/\/example\.test\/products\?id=1\n/)
  assert.match(prompt, /The WebPerf Snippets DevTools extension ran the structural audit/)
  // A snippet with an error, under its title, the id of its step and its documentation
  const blocking = rows.find((r) => r.snippet.auditId === 'render-blocking')
  assert.match(prompt, new RegExp(`^### ${blocking.snippet.title} \\(step \`render-blocking\`\\), https://webperf-snippets\\.net/`, 'm'))
  // Errors first, whatever their snippet
  const issueLines = prompt.split('\n').filter((line) => /^- (error|warning)/.test(line))
  const firstWarning = issueLines.findIndex((line) => line.startsWith('- warning'))
  assert.ok(issueLines.slice(firstWarning).every((line) => line.startsWith('- warning')), 'errors before warnings')
  // An info alone is not something to fix
  assert.doesNotMatch(prompt, /^- info/m)
})

test('the prompt to fix an audit checks the fix with the audit workflow of the CLI', () => {
  const prompt = auditPromptFor(auditRows('seeded'))
  assert.match(prompt, /webperf-snippets@\d+\.\d+\.\d+ -p playwright@[\d.]+ webperf-snippets <url> --workflow audit --json > before\.json/)
  assert.match(prompt, /webperf-snippets <url> --workflow audit --baseline before\.json --json > after\.json/)
  assert.match(prompt, /by the `id` of their step, `code` and `target`/)
  assert.match(prompt, /exits with `1` while the page has errors/)
})

test('an audit with many issues fits in a prompt, and one with nothing to fix has no prompt', () => {
  const prompt = auditPromptFor(auditRows('heavy'))
  assert.equal(prompt.split('\n').filter((line) => /^- (error|warning)/.test(line)).length, 30)
  assert.match(prompt, /^- And \d+ more issues/m)
  assert.ok(prompt.length <= 16 * 1024, `${prompt.length} characters`)
  const clean = auditRows('seeded', (r) => ({ ...r, issues: (r.issues ?? []).filter((i) => i.severity === 'info') }))
  assert.equal(auditPromptFor(clean), null)
  // A snippet that failed is not something to fix in the site
  assert.equal(auditPromptFor([{ snippet: clean[0].snippet, result: { status: 'error', error: 'Timed out' } }]), null)
})
