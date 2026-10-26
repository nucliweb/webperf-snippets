import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fixPrompt, hasIssuesToFix } from './fix-prompt.js'

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
