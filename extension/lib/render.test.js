import test from 'node:test'
import assert from 'node:assert/strict'
import { formatValue, renderResult } from './render.js'

test('formatValue is the one of the view, which the audit summary uses too', () => {
  assert.equal(formatValue(2448, 'ms'), '2,448 ms')
  assert.equal(formatValue(0.0512, 'bpp'), '0.051 bpp')
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

test('items become a table with a labelled column per field, each value in its format', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    count: 3,
    items: [
      { url: 'https://a/x.js', size: 120 },
      { url: 'https://a/y.js', position: { top: 10 } },
    ],
  })
  assert.match(html, /<h3>Items<\/h3>/)
  assert.match(html, /<th>URL<\/th><th>Size<\/th><th>Position<\/th>/)
  assert.match(html, /<td class="url"><span class="resource"><span class="url" title="https:\/\/a\/x\.js">x\.js<\/span>.*?<\/span><\/span><\/td><td class="num">120<\/td><td><\/td>/)
  assert.match(html, /<td>top <b>10<\/b><\/td>/)
  assert.match(html, /2 of 3 items/)
})

test('details become a list of labelled fields', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { totalInteractions: 2, phases: { inputDelay: 7 } } })
  assert.match(html, /<dt>Total interactions<\/dt><dd>2<\/dd>/)
  assert.match(html, /<dt>Phases<\/dt><dd>input delay <b>7<\/b><\/dd>/)
})

test('a field and a column show their value in the format of their unit', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { totalSizeBytes: 17625 }, items: [{ name: 'a', durationMs: 1200.4 }] })
  assert.match(html, /<dt>Total size<\/dt><dd>17.2 KB<\/dd>/)
  assert.match(html, /<th>Name<\/th><th>Duration<\/th>/)
  assert.match(html, /<td class="num">1,200 ms<\/td>/)
})

test('a snippet with its own entries shows the title of its table and reads a field as a sentence', () => {
  const html = renderResult({
    script: 'Find-render-blocking-resources',
    status: 'ok',
    count: 1,
    details: { totalBlockingUntilMs: 532, totalSizeBytes: 314 },
    items: [{ type: 'link', url: 'https://example.com/style.css', shortName: 'style.css', responseEndMs: 532, durationMs: 120, sizeBytes: 314 }],
  })
  assert.match(html, /<h3>Render-blocking resources<\/h3>/)
  assert.match(html, /<p class="phrase">Rendering blocked until <strong>532 ms<\/strong><\/p>/)
  assert.match(html, /<dl class="details"><dt>Total size<\/dt><dd>314 B<\/dd><\/dl>/)
  assert.match(html, /<th>File<\/th><th>Type<\/th><th>Response end<\/th>/)
})

test('an error or an unsupported result shows its message', () => {
  assert.match(renderResult({ script: 'X', status: 'error', error: 'No navigation entry' }), /class="status status-error".*No navigation entry/s)
  assert.match(renderResult({ script: 'X', status: 'unsupported', error: 'Not in this browser' }), /class="status status-unsupported".*Not in this browser/s)
})

test('a tracking result says what to do in the panel, not the message for the console', () => {
  const html = renderResult({ script: 'INP', status: 'tracking', message: 'Interact with the page, then call getINP()', getDataFn: 'getINP' })
  assert.match(html, /class="status status-tracking">Tracking\. Nothing recorded yet\. Use the page, then read the result\.<\/p>/)
  assert.doesNotMatch(html.replace(/<details class="raw">.*<\/details>/s, ''), /getINP/)
})

test('the recommendations of a result are a list of their own', () => {
  const html = renderResult({ script: 'X', status: 'ok', recommendations: ['Add Cache-Control headers', 'Use HTTP/2'] })
  assert.match(html, /<section><h3>Recommendations<\/h3><ol class="recommendations"><li>Add Cache-Control headers<\/li><li>Use HTTP\/2<\/li><\/ol><\/section>/)
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

test('the JSON comes with a button to copy it', () => {
  assert.match(renderResult({ script: 'X', status: 'ok' }), /<button type="button" class="copy-json">Copy JSON<\/button>/)
})

test('only long values wrap in the items table', () => {
  const family = 'Example Sans Regular Latin Extended, Example Fallback, system-ui'
  const html = renderResult({ script: 'X', status: 'ok', items: [{ status: 'loaded', used: false, family }] })
  assert.match(html, /<td>loaded<\/td>/)
  assert.match(html, /<td class="mark"><\/td>/)
  assert.match(html, new RegExp(`<td class="long">${family}</td>`))
})

test('an ok result shows no status, since ok means the snippet ran, not that the page is fine', () => {
  const html = renderResult({ script: 'LCP', status: 'ok', metric: 'LCP', value: 4864, unit: 'ms', rating: 'poor' })
  assert.doesNotMatch(html, /class="status/)
  assert.doesNotMatch(html, />OK</)
})

test('the issues heading counts them by severity', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    issues: [
      { severity: 'warning', message: 'a' },
      { severity: 'info', message: 'b' },
      { severity: 'warning', message: 'c' },
    ],
  })
  assert.match(html, /<h3>Issues <span class="count">2 warnings, 1 info<\/span><\/h3>/)
})

test('an audit with nothing to report says so', () => {
  assert.match(renderResult({ script: 'X', status: 'ok', issues: [], details: { count: 0 } }), /<p class="summary">No issues found<\/p>/)
  // A metric speaks for itself through its value and rating
  assert.doesNotMatch(renderResult({ script: 'LCP', status: 'ok', value: 1200, unit: 'ms', rating: 'good' }), /No issues found/)
})

test('empty fields and columns are left out', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    items: [
      { family: 'A', unicodeRange: '', note: '' },
      { family: 'B', unicodeRange: '', note: 'declared again later' },
    ],
    details: { element: 'p', url: '', preloaded: [], none: null, count: 0 },
  })
  assert.match(html, /<th>Family<\/th><th>Note<\/th><\/tr>/)
  assert.doesNotMatch(html, /<th>Unicode range/)
  assert.match(html, /<dt>Element<\/dt>/)
  assert.match(html, /<dt>Count<\/dt><dd>0<\/dd>/)
  assert.doesNotMatch(html, /<dt>(URL|Preloaded|None)<\/dt>/)
})

test('numbers in the items table are aligned to the right', () => {
  const html = renderResult({ script: 'X', status: 'ok', items: [{ name: 'a', bytes: 1200 }] })
  assert.match(html, /<td>a<\/td><td class="num">1,200<\/td>/)
})

test('a selector in the items or the details is a button that inspects the element', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    items: [{ selector: 'img#hero', bytes: 10 }, { selector: '', bytes: 2 }],
    details: { element: 'p.intro', elementType: 'Text block' },
  })
  assert.match(html, /<td><button type="button" class="inspect" data-selector="img#hero" title="Inspect in Elements">img#hero<\/button><\/td>/)
  assert.match(html, /<dt>Element<\/dt><dd><button type="button" class="inspect" data-selector="p.intro" title="Inspect in Elements">p.intro<\/button><\/dd>/)
  assert.match(html, /<dt>Element type<\/dt><dd>Text block<\/dd>/)
})

test('a long selector wraps like any long value, so the table does not scroll sideways', () => {
  const selector = 'html.js-ready > body.logged-in > div.layout > div.layout-main > div.content > ul#list'
  const html = renderResult({ script: 'X', status: 'ok', items: [{ selector, children: 120 }] })
  assert.match(html, /<td class="long"><button type="button" class="inspect"/)
})

test('a distribution reads as a line of its parts, with the numbers in bold', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { byStrategy: { blocking: 0, async: 82, defer: 3 } } })
  assert.match(html, /<dt>By strategy<\/dt><dd>async <b>82<\/b> · defer <b>3<\/b><\/dd>/)
})

test('the phases of a metric are a bar on the scale of its thresholds, and a row each', () => {
  const html = renderResult({
    script: 'TTFB-Sub-Parts',
    status: 'ok',
    metric: 'TTFB',
    value: 1324,
    unit: 'ms',
    thresholds: { good: 800, needsImprovement: 1800 },
    details: { subParts: { redirectWait: { value: 32, unit: 'ms' }, dnsLookup: { value: 0, unit: 'ms' }, serverResponse: { value: 1292, unit: 'ms' } } },
  })
  assert.match(html, /<div class="phases"><p class="phases-label">Subparts<\/p>/)
  // A segment for each phase that took time, in the colour of its place
  assert.equal([...html.matchAll(/<span class="phase phase-\d"/g)].length, 2)
  assert.match(html, /<span class="zone zone-good" style="width:40%"><\/span>/)
  assert.match(html, /<li class="phase-row"><span class="swatch phase-0"><\/span><span class="phase-name">Redirect<\/span><span class="phase-value">32 ms<\/span><span class="phase-percent">2%<\/span><\/li>/)
  assert.match(html, /<li class="phase-row slowest"><span class="swatch phase-2"><\/span><span class="phase-name">Request<\/span>/)
  // Phases are not one more field of the list
  assert.doesNotMatch(html, /<dt>Subparts<\/dt>/)
})

test('a list of objects in the details is a folded table', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { candidates: [{ index: 1, time: 24 }, { index: 2, time: 32 }] } })
  assert.match(html, /<dt>Candidates<\/dt><dd><details class="nested"><summary>2 rows<\/summary><div class="table"><table><thead><tr><th>Index<\/th><th>Time<\/th><\/tr>/)
})

test('an object of an element is a nested list of its fields', () => {
  const html = renderResult({ script: 'X', status: 'ok', details: { lcpImage: { url: 'https://example.com/hero.png', bpp: 0.5, isLowEntropy: false } } })
  assert.match(html, /<dt>LCP image<\/dt><dd><dl class="details nested"><dt>URL<\/dt><dd><span class="resource"><span class="url" title="https:\/\/example.com\/hero.png">hero.png<\/span>/)
  assert.match(html, /<dt>Is low entropy<\/dt><dd>No<\/dd>/)
})

test('a URL shows its file, with the whole URL as its title', () => {
  const html = renderResult({ script: 'X', status: 'ok', items: [{ url: 'https://example.com/assets/app.js?v=3', cached: true }, { url: 'https://example.com/b.js', cached: false }] })
  assert.match(html, /<td class="url"><span class="resource"><span class="url" title="https:\/\/example.com\/assets\/app.js\?v=3">app.js<\/span>.*?<\/span><\/span><\/td><td class="mark">✓<\/td>/)
  assert.match(html, /<td class="mark"><\/td>/)
})

test('the columns with the same value in every row are a line above the table', () => {
  const html = renderResult({ script: 'X', status: 'ok', items: [{ file: 'a.js', host: '127.0.0.1' }, { file: 'b.js', host: '127.0.0.1' }] })
  assert.match(html, /<p class="constants">Host <b>127\.0\.0\.1<\/b><\/p><div class="table"><table><thead><tr><th>File<\/th><\/tr>/)
})

test('the booleans of a row are marks in one column', () => {
  const html = renderResult({
    script: 'X',
    status: 'ok',
    items: [
      { name: 'a', isLCP: true, inViewport: true },
      { name: 'b', isLCP: false, inViewport: false },
    ],
  })
  assert.match(html, /<th>Flags<\/th>/)
  assert.match(html, /<td class="flags"><span class="flag">LCP<\/span><span class="flag">in viewport<\/span><\/td>/)
  assert.match(html, /<td class="flags"><\/td>/)
})

const withRows = {
  script: 'X',
  status: 'ok',
  items: [
    { url: 'https://example.com/a.png', format: 'png' },
    { url: 'https://example.com/b.png', format: 'png' },
  ],
  issues: [
    { code: 'lcp-not-img', severity: 'info', message: 'The LCP element is not an image' },
    { code: 'lazy-in-viewport', severity: 'warning', message: 'b.png: remove loading=lazy', target: 'https://example.com/b.png' },
  ],
}

test('an issue about a row is a button that leads to it', () => {
  const html = renderResult(withRows)
  assert.match(html, /<li class="issue issue-warning"><button type="button" class="to-row" data-row="1" title="Show its row">b\.png: remove loading=lazy<\/button><\/li>/)
  assert.match(html, /<li class="issue issue-info">The LCP element is not an image<\/li>/)
})

test('a row shows its issues as dots of their severity, and knows its place', () => {
  const html = renderResult(withRows)
  assert.match(html, /<tr data-row="0"><td class="url"><span class="resource"><span class="url"/)
  assert.match(html, /<tr data-row="1"><td class="url"><span class="dots"><span class="dot dot-warning" title="b\.png: remove loading=lazy"><\/span><\/span><span class="resource"><span class="url"/)
})

test('the dots of a row go by severity, errors first', () => {
  const html = renderResult({
    ...withRows,
    issues: [...withRows.issues, { code: 'conflict', severity: 'error', message: 'b.png: conflict', target: 'https://example.com/b.png' }],
  })
  assert.match(html, /<span class="dots"><span class="dot dot-error" title="b\.png: conflict"><\/span><span class="dot dot-warning"/)
})

test('a URL comes with Open in Sources and Copy URL, which panel.js gives their action', () => {
  const html = renderResult({ script: 'X', status: 'ok', items: [{ url: 'https://example.com/assets/app.js?v=3', sizeBytes: 10 }] })
  assert.match(
    html,
    /<span class="resource"><span class="url" title="https:\/\/example.com\/assets\/app.js\?v=3">app.js<\/span><span class="resource-actions"><button type="button" class="open-source" data-url="https:\/\/example.com\/assets\/app.js\?v=3" title="Open in Sources" aria-label="Open app.js in Sources">/
  )
  assert.match(html, /<button type="button" class="copy-url" data-url="https:\/\/example.com\/assets\/app.js\?v=3" title="Copy URL, to filter Network by it" aria-label="Copy the URL of app.js">/)
})
