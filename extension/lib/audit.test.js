import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, bySeverity, overview, report, reportFileName, fromReport, addToHistory, removeFromHistory, compare, previousOf } from './audit.js'

test('summarize counts the issues of a result by severity and names the worst one', () => {
  const s = summarize({
    script: 'X',
    status: 'ok',
    issues: [
      { severity: 'info', message: 'An info' },
      { severity: 'warning', message: 'A warning' },
      { severity: 'error', message: 'An error' },
      { severity: 'warning', message: 'Another warning' },
    ],
  })
  assert.deepEqual(s, { status: 'ok', errors: 1, warnings: 2, infos: 1, top: 'An error' })
})

test('a result that failed counts as an error, with its message', () => {
  assert.deepEqual(summarize({ script: 'X', status: 'error', error: 'No navigation entry' }), {
    status: 'error',
    errors: 1,
    warnings: 0,
    infos: 0,
    top: 'No navigation entry',
  })
  assert.equal(summarize(undefined).status, 'error')
})

test('a rating that is not good counts as a warning when the result has no issues, and the metric is kept', () => {
  assert.deepEqual(summarize({ script: 'TTFB', status: 'ok', value: 1900, unit: 'ms', rating: 'poor' }), {
    status: 'ok',
    errors: 0,
    warnings: 1,
    infos: 0,
    top: 'Rated poor',
    metric: '1,900 ms · poor',
  })
  const ni = summarize({ script: 'TTFB-Sub-Parts', status: 'ok', metric: 'TTFB', value: 996, unit: 'ms', rating: 'needs-improvement' })
  assert.equal(ni.warnings, 1)
  assert.equal(ni.top, 'Rated needs improvement')
  assert.equal(ni.metric, '996 ms · needs improvement')
  const good = summarize({ script: 'LCP', status: 'ok', value: 1200, unit: 'ms', rating: 'good' })
  assert.equal(good.warnings, 0)
  assert.equal(good.metric, '1,200 ms · good')
})

test('bySeverity puts errors first, then warnings, then the rest, keeping the order of the audit', () => {
  const rows = [
    { id: 'a', summary: { errors: 0, warnings: 0, infos: 1 } },
    { id: 'b', summary: { errors: 0, warnings: 2, infos: 0 } },
    { id: 'c', summary: { errors: 1, warnings: 0, infos: 0 } },
    { id: 'd', summary: { errors: 0, warnings: 2, infos: 0 } },
    { id: 'e', summary: { errors: 0, warnings: 0, infos: 0 } },
  ]
  assert.deepEqual([...rows].sort(bySeverity).map((r) => r.id), ['c', 'b', 'd', 'a', 'e'])
})

test('overview says how many snippets have errors, warnings or nothing to fix', () => {
  const rows = [{ errors: 1, warnings: 3 }, { errors: 0, warnings: 1 }, { errors: 0, warnings: 0 }, { errors: 0, warnings: 0 }].map((summary) => ({ summary }))
  assert.equal(overview(rows), '4 snippets: 1 with errors, 1 with warnings, 2 with nothing to fix')
})

test('report gives the audit as JSON in the shape of the CLI, with the overview and every issue by severity', () => {
  const step = (auditId, path, result) => ({ snippet: { auditId, path, title: path }, result, summary: summarize(result) })
  const rows = [
    step('ttfb', 'Loading/TTFB-Sub-Parts', { script: 'TTFB-Sub-Parts', status: 'ok', issues: [] }),
    step('render-blocking', 'Loading/Find-render-blocking-resources', {
      script: 'Find-render-blocking-resources',
      status: 'ok',
      issues: [{ severity: 'info', message: 'An info' }, { severity: 'error', message: '7 render-blocking resources' }],
    }),
    step('webfonts', 'Loading/Webfont-Usage-Analyzer', { script: 'Webfont-Usage-Analyzer', status: 'ok', issues: [{ severity: 'warning', message: 'A font for nothing' }] }),
    step('dom-size', 'Interaction/DOM-Size-and-Depth', { status: 'error', error: 'It failed' }),
  ]
  const r = report({ url: 'https://example.com/', date: '2026-10-13T10:00:00.000Z', rows })
  assert.equal(r.workflow, 'audit')
  assert.equal(r.url, 'https://example.com/')
  assert.equal(r.date, '2026-10-13T10:00:00.000Z')
  assert.deepEqual(r.overview, { snippets: 4, withErrors: 2, withWarnings: 1, withNothingToFix: 1 })
  assert.deepEqual(
    r.issues.map((i) => [i.severity, i.id, i.message]),
    [
      ['error', 'render-blocking', '7 render-blocking resources'],
      ['error', 'dom-size', 'It failed'],
      ['warning', 'webfonts', 'A font for nothing'],
      ['info', 'render-blocking', 'An info'],
    ]
  )
  // The results in the order of the audit, each with the id of its step, as the CLI gives them
  assert.deepEqual(r.results.map((x) => x.id), ['ttfb', 'render-blocking', 'webfonts', 'dom-size'])
  assert.equal(r.results[1].path, 'Loading/Find-render-blocking-resources')
  assert.equal(r.results[1].script, 'Find-render-blocking-resources')
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r)
})

test('the file name of the report has the host of the page and the date', () => {
  assert.equal(reportFileName('https://www.example.com/a/b?q=1', '2026-10-13T10:05:09.000Z'), 'webperf-audit-www.example.com-2026-10-13-1005.json')
  assert.equal(reportFileName(undefined, '2026-10-13T10:05:09.000Z'), 'webperf-audit-page-2026-10-13-1005.json')
})

test('the file name leaves out the port, since a colon is not valid in every file system', () => {
  assert.equal(reportFileName('http://localhost:3000/', '2026-10-13T10:05:09.000Z'), 'webperf-audit-localhost-2026-10-13-1005.json')
})

test('fromReport brings back an audit from its report, matching each result to its snippet', () => {
  const snippets = [
    { id: 'TTFB-Sub-Parts', path: 'Loading/TTFB-Sub-Parts', title: 'TTFB', audit: 0, auditId: 'ttfb' },
    { id: 'Webfont-Usage-Analyzer', path: 'Loading/Webfont-Usage-Analyzer', title: 'Fonts', audit: 1, auditId: 'webfonts' },
    { id: 'LCP', path: 'CoreWebVitals/LCP', title: 'LCP', audit: null, auditId: null },
  ]
  const result = { script: 'Webfont-Usage-Analyzer', status: 'ok', issues: [{ severity: 'warning', message: 'A font for nothing' }] }
  const saved = report({
    url: 'https://example.com/',
    date: '2026-10-13T10:00:00.000Z',
    rows: [
      { snippet: snippets[0], result: { script: 'TTFB-Sub-Parts', status: 'ok', issues: [] }, summary: summarize({ status: 'ok' }) },
      { snippet: snippets[1], result, summary: summarize(result) },
    ],
  })
  const audit = fromReport(JSON.parse(JSON.stringify(saved)), snippets)
  assert.equal(audit.done, true)
  assert.equal(audit.url, 'https://example.com/')
  assert.equal(audit.date, '2026-10-13T10:00:00.000Z')
  assert.deepEqual(audit.steps.map((s) => s.id), ['TTFB-Sub-Parts', 'Webfont-Usage-Analyzer'])
  assert.deepEqual(audit.rows[1].result, result)
  assert.equal(audit.rows[1].summary.warnings, 1)
  // An exported report gives the same audit again
  assert.deepEqual(report({ url: audit.url, date: audit.date, rows: audit.rows }), saved)
})

test('fromReport gives nothing for a missing or broken report, and leaves out results of snippets that are gone', () => {
  const snippets = [{ id: 'TTFB-Sub-Parts', path: 'Loading/TTFB-Sub-Parts', audit: 0, auditId: 'ttfb' }]
  assert.equal(fromReport(null, snippets), null)
  assert.equal(fromReport({ workflow: 'other' }, snippets), null)
  const audit = fromReport({ workflow: 'audit', url: 'u', date: 'd', results: [{ id: 'ttfb', status: 'ok' }, { id: 'gone', status: 'ok' }] }, snippets)
  assert.deepEqual(audit.rows.map((r) => r.snippet.id), ['TTFB-Sub-Parts'])
})

test('the history keeps the last audits, newest first, and drops the oldest past its limit', () => {
  const at = (n) => ({ workflow: 'audit', url: `https://example.com/${n}`, date: `2026-10-13T10:0${n}:00.000Z`, results: [] })
  let history = []
  for (let n = 0; n < 5; n++) history = addToHistory(history, at(n), 3)
  assert.deepEqual(history.map((r) => r.url), ['https://example.com/4', 'https://example.com/3', 'https://example.com/2'])
  assert.equal(addToHistory(undefined, at(1)).length, 1)
  // The default limit is 10
  for (let n = 0; n < 12; n++) history = addToHistory(history, { ...at(0), date: `2026-10-13T11:${String(n).padStart(2, '0')}:00.000Z` })
  assert.equal(history.length, 10)
})

test('an audit leaves the history by its date', () => {
  const a = { workflow: 'audit', url: 'a', date: '2026-10-13T10:00:00.000Z', results: [] }
  const b = { workflow: 'audit', url: 'b', date: '2026-10-13T11:00:00.000Z', results: [] }
  assert.deepEqual(removeFromHistory([b, a], a.date), [b])
  assert.deepEqual(removeFromHistory([b, a], 'unknown'), [b, a])
})

const saved = (date, url, results) => ({ workflow: 'audit', url, date, results })
const issue = (severity, message) => ({ severity, message })

test('compare finds the issues that are new and the ones that are gone, reading the numbers as the same issue', () => {
  const before = saved('2026-10-13T10:00:00.000Z', 'https://example.com/', [
    { id: 'render-blocking', status: 'ok', issues: [issue('error', '7 render-blocking resource(s) delay rendering until 1543ms')] },
    { id: 'webfonts', status: 'ok', issues: [issue('warning', 'Loaded but not used by any rendered element: Example Sans 500 normal, 36.5 KB downloaded for nothing')] },
    { id: 'oversized-images', status: 'ok', issues: [issue('warning', 'icon.png: 1x1 file for a 56x54 slot at 2x'), issue('warning', 'icon.png: 1x1 file for a 52x60 slot at 2x'), issue('warning', 'icon.png: 1x1 file for a 50x46 slot at 2x')] },
    { id: 'ttfb', status: 'ok', value: 996, unit: 'ms', rating: 'needs-improvement', issues: [] },
  ])
  const after = saved('2026-10-13T11:00:00.000Z', 'https://example.com/', [
    // Same issue, other numbers
    { id: 'render-blocking', status: 'ok', issues: [issue('error', '6 render-blocking resource(s) delay rendering until 1210ms')] },
    // Fixed
    { id: 'webfonts', status: 'ok', issues: [] },
    // One of the three fixed
    { id: 'oversized-images', status: 'ok', issues: [issue('warning', 'icon.png: 1x1 file for a 56x54 slot at 2x'), issue('warning', 'icon.png: 1x1 file for a 52x60 slot at 2x')] },
    { id: 'ttfb', status: 'ok', value: 812, unit: 'ms', rating: 'needs-improvement', issues: [] },
    // New
    { id: 'dom-size', status: 'ok', issues: [issue('warning', '1266 nodes exceeds 800')] },
  ])
  const c = compare(after, before)
  assert.equal(c.since, '2026-10-13T10:00:00.000Z')
  assert.deepEqual(c.added.map((i) => [i.id, i.message]), [['dom-size', '1266 nodes exceeds 800']])
  assert.deepEqual(
    c.resolved.map((i) => i.id),
    ['webfonts', 'oversized-images']
  )
  assert.deepEqual(c.metrics, [{ id: 'ttfb', before: '996 ms · needs improvement', after: '812 ms · needs improvement' }])
  // Same issue with other numbers: changed, with the text before and after
  assert.deepEqual(c.changed, [
    {
      id: 'render-blocking',
      severity: 'error',
      before: '7 render-blocking resource(s) delay rendering until 1543ms',
      after: '6 render-blocking resource(s) delay rendering until 1210ms',
    },
  ])
  assert.equal(c.unchanged, 2)
})

test('a change of a time alone, in ms or s, is not a change, since timings move on every run', () => {
  const before = saved('a', 'u', [{ id: 'x', status: 'ok', issues: [issue('error', '7 resources delay rendering until 1543ms'), issue('info', 'Took 2.4 s to settle')] }])
  const after = saved('b', 'u', [{ id: 'x', status: 'ok', issues: [issue('error', '7 resources delay rendering until 1210 ms'), issue('info', 'Took 1.9 s to settle')] }])
  const c = compare(after, before)
  assert.deepEqual(c.changed, [])
  assert.equal(c.unchanged, 2)
  // A count that moves is a change, even next to a time
  const more = saved('c', 'u', [{ id: 'x', status: 'ok', issues: [issue('error', '8 resources delay rendering until 1210ms'), issue('info', 'Took 1.9 s to settle')] }])
  assert.equal(compare(more, before).changed.length, 1)
})

test('compare counts the errors, warnings and info of both audits', () => {
  const before = saved('a', 'u', [{ id: 'x', status: 'ok', issues: [issue('error', 'E1'), issue('warning', 'W1')] }])
  const after = saved('b', 'u', [{ id: 'x', status: 'ok', issues: [issue('warning', 'W1'), issue('info', 'I1')] }])
  assert.deepEqual(compare(after, before).counts, { errors: [1, 0], warnings: [1, 1], infos: [0, 1] })
})

test('previousOf finds the last audit of the same page before an audit', () => {
  const history = [
    saved('2026-10-13T12:00:00.000Z', 'https://example.com/', []),
    saved('2026-10-13T11:00:00.000Z', 'https://example.com/other', []),
    saved('2026-10-13T10:00:00.000Z', 'https://example.com/', []),
    saved('2026-10-13T09:00:00.000Z', 'https://example.com/', []),
  ]
  assert.equal(previousOf(history, history[0]).date, '2026-10-13T10:00:00.000Z')
  assert.equal(previousOf(history, history[2]).date, '2026-10-13T09:00:00.000Z')
  assert.equal(previousOf(history, history[3]), undefined)
  assert.equal(previousOf(history, history[1]), undefined)
})
