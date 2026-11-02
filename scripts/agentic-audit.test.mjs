import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { assertNothingAnswers, auditResults, failedAudits, markdownSummary, waitForServer } from './agentic-audit.mjs'

// A real report of the site (Lighthouse 13.6.0, Chromium with WebMCP), trimmed to the fields the summary reads.
const REPORT = JSON.parse(readFileSync(new URL('./fixtures/lighthouse/agentic-browsing.json', import.meta.url), 'utf8'))

const withAudit = (id, fields) => {
  const report = structuredClone(REPORT)
  Object.assign(report.audits[id], fields)
  return report
}

test('auditResults gives the status of every audit of the category, in the order of the category', () => {
  assert.deepEqual(
    auditResults(REPORT).map(({ id, status }) => [id, status]),
    [
      ['agent-accessibility-tree', 'pass'],
      ['webmcp-form-coverage', 'n/a'],
      ['webmcp-registered-tools', 'info'],
      ['webmcp-schema-validity', 'pass'],
      ['cumulative-layout-shift', 'pass'],
      ['llms-txt', 'pass'],
      ['ard-schema', 'n/a'],
    ]
  )
})

test('a numeric audit passes from a score of 0.9, as in the Lighthouse report', () => {
  assert.equal(auditResults(withAudit('cumulative-layout-shift', { score: 0.9 }))[4].status, 'pass')
  assert.equal(auditResults(withAudit('cumulative-layout-shift', { score: 0.89 }))[4].status, 'fail')
})

test('failedAudits lists the audits that fail or end in an error, and nothing when all pass', () => {
  assert.deepEqual(failedAudits(REPORT), [])

  const report = withAudit('llms-txt', { score: 0, displayValue: 'Failed with HTTP status 500' })
  report.audits['webmcp-schema-validity'] = { ...report.audits['webmcp-schema-validity'], score: null, scoreDisplayMode: 'error', errorMessage: 'Protocol error' }
  assert.deepEqual(
    failedAudits(report).map(({ id, status }) => [id, status]),
    [
      ['webmcp-schema-validity', 'error'],
      ['llms-txt', 'fail'],
    ]
  )
})

test('markdownSummary shows the score as Lighthouse does and one line per audit', () => {
  assert.equal(
    markdownSummary(REPORT),
    [
      '### Lighthouse: Agentic Browsing',
      '',
      '**4/4** audits pass (Lighthouse 13.6.0, http://localhost:3104/)',
      '',
      '- pass `agent-accessibility-tree`: Accessibility tree is well-formed (All audits passed)',
      '- n/a `webmcp-form-coverage`: WebMCP form coverage',
      '- info `webmcp-registered-tools`: WebMCP tools registered (list_snippets, search_snippets, get_snippet, get_snippet_prompt)',
      '- pass `webmcp-schema-validity`: WebMCP schemas are valid',
      '- pass `cumulative-layout-shift`: Cumulative Layout Shift (0)',
      '- pass `llms-txt`: llms.txt follows recommendations',
      '- n/a `ard-schema`: ARD manifest is valid',
      '',
    ].join('\n')
  )
})

test('without any WebMCP tool the summary says so, so a browser without the API does not go unnoticed', () => {
  const report = withAudit('webmcp-registered-tools', { score: null, scoreDisplayMode: 'notApplicable', details: undefined })
  assert.match(markdownSummary(report), /^- n\/a `webmcp-registered-tools`: WebMCP tools registered \(no tools seen\)$/m)
})

test('markdownSummary gives the reason of a failure and the warnings of the run', () => {
  const report = withAudit('llms-txt', { score: 0, title: 'llms.txt does not follow recommendations', explanation: 'Fetch of llms.txt failed: timeout' })
  report.runWarnings = ['The page loaded too slowly']
  const summary = markdownSummary(report)
  assert.match(summary, /\*\*3\/4\*\* audits pass/)
  assert.match(summary, /^- \*\*fail\*\* `llms-txt`: llms\.txt does not follow recommendations \(Fetch of llms\.txt failed: timeout\)$/m)
  assert.match(summary, /^> Warning: The page loaded too slowly$/m)
})

test('refuses a port where another server answers, so the audit cannot report on the wrong site', async () => {
  const other = createServer((request, response) => response.end('another site'))
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${other.address().port}/`
  try {
    await assert.rejects(assertNothingAnswers(url), /already answers/)
  } finally {
    await new Promise((resolve) => other.close(resolve))
  }
  await assertNothingAnswers(url)
})

test('waitForServer fails as soon as the server it started exits', async () => {
  const server = spawn(process.execPath, ['-e', 'process.exit(3)'])
  await assert.rejects(waitForServer('http://127.0.0.1:9/', server), /exited with 3/)
})
