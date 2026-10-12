import test from 'node:test'
import assert from 'node:assert/strict'
import { formatValue, renderResult } from './render.js'

test('formatValue writes each unit of the contract', () => {
  assert.equal(formatValue(450, 'ms'), '450 ms')
  assert.equal(formatValue(2448, 'ms'), '2,448 ms')
  assert.equal(formatValue(0.7606, 'score'), '0.761')
  assert.equal(formatValue(12, 'count'), '12')
  assert.equal(formatValue(2048, 'bytes'), '2.0 KB')
  assert.equal(formatValue(3 * 1024 * 1024, 'bytes'), '3.0 MB')
  assert.equal(formatValue(0.0512, 'bpp'), '0.051 bpp')
  assert.equal(formatValue(58.4, 'fps'), '58 fps')
  assert.equal(formatValue(7, undefined), '7')
})

test('a metric shows its value, rating and thresholds', () => {
  const html = renderResult({
    script: 'LCP',
    status: 'ok',
    metric: 'LCP',
    value: 2448,
    unit: 'ms',
    rating: 'needs-improvement',
    thresholds: { good: 2500, needsImprovement: 4000 },
  })
  assert.match(html, /<span class="metric-name">LCP<\/span>/)
  assert.match(html, /<span class="metric-value">2,448 ms<\/span>/)
  assert.match(html, /<span class="rating rating-needs-improvement">Needs improvement<\/span>/)
  assert.match(html, /Good up to 2,500 ms, poor above 4,000 ms/)
})

test('issues are listed by severity', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    issues: [
      { severity: 'info', message: 'An info' },
      { severity: 'error', message: 'An error' },
      { severity: 'warning', message: 'A warning' },
    ],
  })
  const order = [...html.matchAll(/<li class="issue issue-(\w+)">/g)].map(([, s]) => s)
  assert.deepEqual(order, ['error', 'warning', 'info'])
})

test('items become a table with a column per field, and nested values as JSON', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    count: 3,
    items: [
      { url: 'https://a/x.js', size: 120 },
      { url: 'https://a/y.js', position: { top: 10 } },
    ],
  })
  assert.match(html, /<th>url<\/th><th>size<\/th><th>position<\/th>/)
  assert.match(html, /<td>https:\/\/a\/x\.js<\/td><td>120<\/td><td><\/td>/)
  assert.match(html, /<td>\{&quot;top&quot;:10\}<\/td>/)
  assert.match(html, /2 of 3 items/)
})

test('details become a list of fields', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { totalInteractions: 2, phases: { inputDelay: 7 } } })
  assert.match(html, /<dt>totalInteractions<\/dt><dd>2<\/dd>/)
  assert.match(html, /<dt>phases<\/dt><dd>\{&quot;inputDelay&quot;:7\}<\/dd>/)
})

test('an error or an unsupported result shows its message', () => {
  assert.match(renderResult({ script: 'X', status: 'error', error: 'No navigation entry' }), /class="status status-error".*No navigation entry/s)
  assert.match(renderResult({ script: 'X', status: 'unsupported', error: 'Not in this browser' }), /class="status status-unsupported".*Not in this browser/s)
})

test('a tracking result shows its message', () => {
  const html = renderResult({ script: 'INP', status: 'tracking', message: 'Interact with the page', getDataFn: 'getINP' })
  assert.match(html, /class="status status-tracking".*Interact with the page/s)
})

test('a result limited by CORS says that its sizes and timings are lower bounds', () => {
  assert.match(renderResult({ script: 'X', status: 'ok', corsLimitedAnalysis: true }), /lower bounds/)
})

test('the whole result is there as JSON', () => {
  assert.match(renderResult({ script: 'X', status: 'ok', value: 1 }), /<details class="raw"><summary>JSON<\/summary><pre>\{\n {2}&quot;script&quot;/)
})

test('values from the page are escaped', () => {
  const html = renderResult({ script: 'X', status: 'ok', items: [{ selector: '<img src=x onerror=alert(1)>' }], issues: [{ severity: 'error', message: '<b>x</b>' }] })
  assert.doesNotMatch(html, /<img|<b>/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('a value that is not a result object is shown as JSON', () => {
  assert.match(renderResult(42), /<pre>42<\/pre>/)
  assert.match(renderResult(undefined), /returned nothing/)
})
