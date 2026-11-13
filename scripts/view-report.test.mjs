import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auditReport, describeOverview, issueList, issuesOf, overviewOf, summarizeIssues } from '../snippets/_view/index.js'

// What a set of results found, the same for the audit of the extension and the reports of the CLI: the
// issues of each result by severity, the overview of all of them and every issue in one list.

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/results/${name}.json`, import.meta.url), 'utf8'))

const renderBlocking = fixture('seeded-Find-render-blocking-resources') // one error
const compression = fixture('seeded-Compression-Audit') // a warning and an info
const contentVisibility = fixture('seeded-Content-Visibility') // an info
const failed = { script: 'DOM-Size-and-Depth', status: 'error', error: 'It failed' }

test('summarizeIssues counts the issues of a result by severity and names the worst one', () => {
  const [error] = renderBlocking.issues
  assert.deepEqual(summarizeIssues(renderBlocking), { status: 'ok', errors: 1, warnings: 0, infos: 0, top: error.message })
  const warning = compression.issues.find((i) => i.severity === 'warning')
  assert.deepEqual(summarizeIssues(compression), { status: 'ok', errors: 0, warnings: 1, infos: 1, top: warning.message })
})

test('summarizeIssues counts a result that failed, or that is missing, as an error with its message', () => {
  assert.deepEqual(summarizeIssues(failed), { status: 'error', errors: 1, warnings: 0, infos: 0, top: 'It failed' })
  assert.deepEqual(summarizeIssues(undefined), { status: 'error', errors: 1, warnings: 0, infos: 0, top: 'The snippet returned nothing' })
})

test('summarizeIssues counts a rating that is not good as a warning when no issue says more', () => {
  assert.deepEqual(summarizeIssues({ script: 'TTFB', status: 'ok', value: 1900, unit: 'ms', rating: 'poor' }), {
    status: 'ok',
    errors: 0,
    warnings: 1,
    infos: 0,
    top: 'Rated poor',
  })
  assert.equal(summarizeIssues({ script: 'TTFB', status: 'ok', value: 996, rating: 'needs-improvement' }).top, 'Rated needs improvement')
  assert.equal(summarizeIssues({ script: 'TTFB', status: 'ok', value: 300, rating: 'good' }).warnings, 0)
})

test('overviewOf counts the snippets with errors, with warnings only and with nothing to fix', () => {
  const summaries = [renderBlocking, compression, contentVisibility, failed].map(summarizeIssues)
  assert.deepEqual(overviewOf(summaries), { snippets: 4, withErrors: 2, withWarnings: 1, withNothingToFix: 1 })
  assert.deepEqual(overviewOf([]), { snippets: 0, withErrors: 0, withWarnings: 0, withNothingToFix: 0 })
})

test('describeOverview says the overview in one line', () => {
  assert.equal(describeOverview({ snippets: 22, withErrors: 2, withWarnings: 5, withNothingToFix: 15 }), '22 snippets: 2 with errors, 5 with warnings, 15 with nothing to fix')
  // One snippet, as with --snippet in the CLI
  assert.equal(describeOverview({ snippets: 1, withErrors: 1, withWarnings: 0, withNothingToFix: 0 }), '1 snippet: 1 with errors, 0 with warnings, 0 with nothing to fix')
})

test('issuesOf lists every issue of the results, in their order, with the id of its result', () => {
  const results = [
    { id: 'render-blocking', ...renderBlocking },
    { id: 'compression', ...compression },
    { id: 'dom-size', ...failed },
  ]
  const issues = issuesOf(results)
  assert.deepEqual(
    issues.map((i) => [i.id, i.severity]),
    [['render-blocking', 'error'], ['compression', 'warning'], ['compression', 'info'], ['dom-size', 'error']]
  )
  // The code and the target of an issue go with it; a result that failed gives its error, with no code
  assert.equal(issues[0].code, renderBlocking.issues[0].code)
  assert.deepEqual(issues[3], { severity: 'error', id: 'dom-size', message: 'It failed' })
})

test('issueList puts every issue by severity, with the path its result maps to, and keeps the order within a severity', () => {
  const results = [
    { id: 'compression', ...compression },
    { id: 'render-blocking', ...renderBlocking },
  ]
  const paths = { compression: 'Loading/Compression-Audit', 'render-blocking': 'Loading/Find-render-blocking-resources' }
  const issues = issueList(results, (result) => paths[result.id])
  assert.deepEqual(
    issues.map((i) => [i.severity, i.id, i.path]),
    [
      ['error', 'render-blocking', 'Loading/Find-render-blocking-resources'],
      ['warning', 'compression', 'Loading/Compression-Audit'],
      ['info', 'compression', 'Loading/Compression-Audit'],
    ]
  )
  assert.equal(issues[0].code, renderBlocking.issues[0].code)
  // Without a function, the path is the one each result carries
  assert.equal(issueList([{ id: 'x', path: 'A/B', ...renderBlocking }])[0].path, 'A/B')
})

test('auditReport gives the overview, every issue by severity with the path of its snippet, and the results as they are', () => {
  const results = [
    { id: 'content-visibility', path: 'Loading/Content-Visibility', ...contentVisibility },
    { id: 'compression', path: 'Loading/Compression-Audit', ...compression },
    { id: 'render-blocking', path: 'Loading/Find-render-blocking-resources', ...renderBlocking },
    { id: 'dom-size', path: 'Interaction/DOM-Size-and-Depth', ...failed },
  ]
  const report = auditReport({ url: 'https://example.com/', date: '2026-11-11T09:00:00.000Z', results })
  assert.equal(report.workflow, 'audit')
  assert.equal(report.url, 'https://example.com/')
  assert.equal(report.date, '2026-11-11T09:00:00.000Z')
  assert.deepEqual(report.overview, { snippets: 4, withErrors: 2, withWarnings: 1, withNothingToFix: 1 })
  // Errors first, then warnings, then info; within a severity, the order of the audit
  assert.deepEqual(
    report.issues.map((i) => [i.severity, i.id, i.path]),
    [
      ['error', 'render-blocking', 'Loading/Find-render-blocking-resources'],
      ['error', 'dom-size', 'Interaction/DOM-Size-and-Depth'],
      ['warning', 'compression', 'Loading/Compression-Audit'],
      ['info', 'content-visibility', 'Loading/Content-Visibility'],
      ['info', 'compression', 'Loading/Compression-Audit'],
    ]
  )
  assert.equal(report.results, results)
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report)
})

test('auditReport names no url when the page has none', () => {
  assert.equal(auditReport({ date: '2026-11-11T09:00:00.000Z', results: [] }).url, null)
})
