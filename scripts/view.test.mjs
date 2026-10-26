import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeResult, formatValue, words } from '../snippets/_view/index.js'

// The view of a snippet result (snippets/_view/): labels, formats and order for the extension, the
// reports of the CLI and the visualizer of the site, which each paint it their own way.

const sample = {
  script: 'Find-render-blocking-resources',
  status: 'ok',
  count: 2,
  details: { totalBlockingUntilMs: 532, totalSizeBytes: 17625, byType: { script: 1, link: 1 } },
  items: [
    { type: 'script', url: 'https://example.com/third.js', shortName: 'third.js', responseEndMs: 532, durationMs: 210, sizeBytes: 0 },
    { type: 'link', url: 'https://example.com/style.css', shortName: 'style.css', responseEndMs: 401, durationMs: 120, sizeBytes: 17625 },
  ],
  issues: [],
}

test('each format writes its unit', () => {
  assert.equal(formatValue(532, 'ms'), '532 ms')
  assert.equal(formatValue(2448.4, 'ms'), '2,448 ms')
  assert.equal(formatValue(314, 'bytes'), '314 B')
  assert.equal(formatValue(17625, 'bytes'), '17.2 KB')
  assert.equal(formatValue(3 * 1024 * 1024, 'bytes'), '3.0 MB')
  assert.equal(formatValue(70, 'percent'), '70%')
  assert.equal(formatValue(1234, 'count'), '1,234')
  assert.equal(formatValue(0.07606, 'score'), '0.076')
  assert.equal(formatValue(0.1, 'score'), '0.100')
  assert.equal(formatValue(0.0512, 'bpp'), '0.051 bpp')
  assert.equal(formatValue(58.4, 'fps'), '58 fps')
  assert.equal(formatValue(7, undefined), '7')
  assert.equal(formatValue(0.12345, undefined), '0.123')
  assert.equal(formatValue('defer', undefined), 'defer')
})

test('numbers follow the locale', () => {
  assert.equal(formatValue(17625, 'bytes', 'es'), '17,2 KB')
  assert.equal(formatValue(2448, 'ms', 'de'), '2.448 ms')
  // With the no-break space of the locale
  assert.equal(formatValue(70, 'percent', 'es'), '70\u00a0%')
})

test('a key becomes words, without its unit and with its acronyms in capitals', () => {
  assert.equal(words('totalBlockingUntilMs'), 'Total blocking until')
  assert.equal(words('sizeBytes'), 'Size')
  assert.equal(words('headerCoveragePercent'), 'Header coverage')
  assert.equal(words('imageCount'), 'Image')
  assert.equal(words('count'), 'Count')
  assert.equal(words('isLCP'), 'Is LCP')
  assert.equal(words('lcpElement'), 'LCP element')
  assert.equal(words('url'), 'URL')
  assert.equal(words('corsRestricted'), 'CORS restricted')
  assert.equal(words('totalLoAFs'), 'Total LoAFs')
  assert.equal(words('ttfbMs'), 'TTFB')
  assert.equal(words('cache_control'), 'Cache control')
})

test('a field without an entry takes its format from its suffix', () => {
  const view = describeResult({ script: 'X', status: 'ok', details: { waitMs: 12, transferBytes: 2048, hitPercent: 40, nodeCount: 1500, name: 'a' } })
  assert.deepEqual(
    view.details.map(({ label, text }) => [label, text]),
    [
      ['Wait', '12 ms'],
      ['Transfer', '2.0 KB'],
      ['Hit', '40%'],
      ['Node', '1,500'],
      ['Name', 'a'],
    ]
  )
})

test('the table of a snippet has its title, and Items without one', () => {
  assert.equal(describeResult(sample).title, 'Render-blocking resources')
  assert.equal(describeResult({ script: 'X', status: 'ok', items: [{ a: 1 }] }).title, 'Items')
})

test('a field with a phrase reads as a sentence around its value', () => {
  const blocked = describeResult(sample).details.find((d) => d.key === 'totalBlockingUntilMs')
  assert.equal(blocked.text, '532 ms')
  assert.deepEqual(blocked.phrase, { before: 'Rendering blocked until ', after: '' })
})

test('the columns have labels and formats, in the order of the snippet entry', () => {
  const view = describeResult(sample)
  assert.deepEqual(
    view.columns.map((c) => c.key),
    ['shortName', 'type', 'responseEndMs', 'durationMs', 'sizeBytes', 'url']
  )
  assert.deepEqual(
    view.columns.map((c) => c.label),
    ['File', 'Type', 'Response end', 'Duration', 'Size', 'URL']
  )
  assert.deepEqual(
    view.rows[1].cells.map((c) => c.text),
    ['style.css', 'link', '401 ms', '120 ms', '17.2 KB', 'style.css']
  )
})

test('a snippet entry wins over the general one, and a hidden field is left out', () => {
  const fields = { '*': { size: { format: 'bytes' } }, Y: { size: { format: 'count' }, internal: { hidden: true } } }
  const view = describeResult({ script: 'Y', status: 'ok', details: { size: 2048, internal: 'x' } }, { fields })
  assert.deepEqual(view.details.map(({ key, text }) => [key, text]), [['size', '2,048']])
  assert.equal(describeResult({ script: 'Z', status: 'ok', details: { size: 2048 } }, { fields }).details[0].text, '2.0 KB')
})

test('a locale without an entry falls back to English', () => {
  const locales = { xx: { 'Find-render-blocking-resources': { fields: { totalSizeBytes: { label: 'Größe' } } } } }
  const view = describeResult(sample, { locale: 'xx', locales })
  const label = (key) => view.details.find((d) => d.key === key).label
  assert.equal(label('totalSizeBytes'), 'Größe')
  assert.equal(label('totalBlockingUntilMs'), 'Blocked until')
  assert.equal(view.title, 'Render-blocking resources')
  // A region falls back to its language
  assert.equal(describeResult(sample, { locale: 'xx-YY', locales }).details.find((d) => d.key === 'totalSizeBytes').label, 'Größe')
})

test('empty fields and columns are left out', () => {
  const view = describeResult({
    script: 'X',
    status: 'ok',
    items: [
      { family: 'A', unicodeRange: '', note: '' },
      { family: 'B', unicodeRange: '', note: 'declared again later' },
    ],
    details: { element: 'p', url: '', preloaded: [], none: null, count: 0 },
  })
  assert.deepEqual(view.columns.map((c) => c.key), ['family', 'note'])
  assert.deepEqual(view.details.map((d) => d.key), ['element', 'count'])
})

test('a list of values becomes rows of one value', () => {
  const view = describeResult({ script: 'X', status: 'ok', items: ['a.js', 'b.js'] })
  assert.deepEqual(view.rows.map((r) => r.cells[0].text), ['a.js', 'b.js'])
})

test('a result without details or items has an empty view', () => {
  const view = describeResult({ script: 'X', status: 'ok' })
  assert.deepEqual([view.details, view.columns, view.rows], [[], [], []])
})

const detail = (result, key, options) => describeResult(result, options).details.find((d) => d.key === key)

test('an object of counts is a distribution, without the zeros', () => {
  const byStrategy = detail({ script: 'Script-Loading', status: 'ok', details: { byStrategy: { blocking: 0, async: 82, defer: 3, module: 0 } } }, 'byStrategy')
  assert.equal(byStrategy.format, 'distribution')
  assert.deepEqual(byStrategy.parts.map(({ label, text }) => [label, text]), [['async', '82'], ['defer', '3']])
  assert.equal(byStrategy.text, 'async 82 · defer 3')
  // Keys in words, in lower case unless they are acronyms
  const byType = detail({ script: 'X', status: 'ok', details: { byType: { 'dns-prefetch': 2, firstParty: 1, 'http/1.1': 4 } } }, 'byType')
  assert.equal(byType.text, 'DNS prefetch 2 · first party 1 · http/1.1 4')
})

test('a distribution with only zeros says none', () => {
  const bySeverity = detail({ script: 'LongTask', status: 'ok', details: { bySeverity: { critical: 0, high: 0 } } }, 'bySeverity')
  assert.deepEqual([bySeverity.format, bySeverity.parts, bySeverity.text], ['distribution', [], 'none'])
})

const ttfb = {
  script: 'TTFB-Sub-Parts',
  status: 'ok',
  metric: 'TTFB',
  value: 1324,
  unit: 'ms',
  thresholds: { good: 800, needsImprovement: 1800 },
  details: {
    subParts: {
      redirectWait: { value: 32, unit: 'ms' },
      serviceWorkerCache: { value: 0, unit: 'ms' },
      dnsLookup: { value: 0, unit: 'ms' },
      tcpConnection: { value: 0, unit: 'ms' },
      sslTls: { value: 0, unit: 'ms' },
      serverResponse: { value: 1292, unit: 'ms' },
    },
    slowestPhase: 'serverResponse',
  },
}

test('the phases of a metric are parts of its value, on the scale of its thresholds', () => {
  const subParts = detail(ttfb, 'subParts')
  assert.equal(subParts.format, 'phases')
  assert.equal(subParts.label, 'Subparts')
  assert.deepEqual(
    subParts.parts.map(({ key, label, text, percent, slowest }) => [key, label, text, percent, slowest]),
    [
      ['redirectWait', 'Redirect', '32 ms', 2, false],
      ['serviceWorkerCache', 'Service worker', '0 ms', 0, false],
      ['dnsLookup', 'DNS', '0 ms', 0, false],
      ['tcpConnection', 'TCP', '0 ms', 0, false],
      ['sslTls', 'SSL/TLS', '0 ms', 0, false],
      ['serverResponse', 'Request', '1,292 ms', 98, true],
    ]
  )
  assert.deepEqual(subParts.scale, { total: 1324, good: 800, poor: 1800 })
  assert.equal(subParts.text, 'Redirect 32 ms (2%) · Request 1,292 ms (98%)')
})

test('the slowest phase is the one the snippet names, when it names one', () => {
  const tie = { ...ttfb, details: { subParts: { serviceWorkerCache: { value: 1, unit: 'ms' }, serverResponse: { value: 1, unit: 'ms' } }, slowestPhase: 'serverResponse' } }
  assert.deepEqual(detail(tie, 'subParts').parts.map((p) => p.slowest), [false, true])
})

test('a phase keeps the percent and the over target mark the snippet gives', () => {
  const subParts = detail(
    {
      script: 'LCP-Subparts',
      status: 'ok',
      value: 44,
      thresholds: { good: 2500, needsImprovement: 4000 },
      details: { subParts: { ttfb: { value: 1, percent: 2, overTarget: false }, resourceLoadDelay: { value: 26, percent: 59, overTarget: true } } },
    },
    'subParts'
  )
  assert.deepEqual(
    subParts.parts.map(({ label, percent, overTarget }) => [label, percent, overTarget]),
    [
      ['TTFB', 2, false],
      ['Resource load delay', 59, true],
    ]
  )
})

test('the phases of INP are plain numbers in ms', () => {
  const phases = detail(
    { script: 'INP', status: 'ok', value: 48, thresholds: { good: 200, needsImprovement: 500 }, details: { phases: { inputDelay: 1, processingTime: 4, presentationDelay: 43 } } },
    'phases'
  )
  assert.equal(phases.format, 'phases')
  assert.deepEqual(phases.parts.map((p) => p.text), ['1 ms', '4 ms', '43 ms'])
})

test('a field that names a key reads as the label of that key', () => {
  assert.equal(detail(ttfb, 'slowestPhase').text, 'Request')
  assert.equal(detail({ script: 'LCP-Subparts', status: 'ok', details: { slowestPhase: 'elementRenderDelay' } }, 'slowestPhase').text, 'Element render delay')
})

test('a list of objects is a nested table, with the same labels and formats', () => {
  const candidates = detail(
    {
      script: 'LCP-Trail',
      status: 'ok',
      details: {
        candidates: [
          { index: 1, selector: '#go', time: 24, elementType: 'button' },
          { index: 2, selector: 'div > img', time: 32, elementType: 'Image', url: 'https://example.com/img/hero.png?v=2' },
        ],
      },
    },
    'candidates'
  )
  assert.equal(candidates.format, 'table')
  assert.deepEqual(candidates.columns.map((c) => c.label), ['Index', 'Selector', 'Time', 'Element type', 'URL'])
  assert.deepEqual(candidates.rows[1].cells.map((c) => c.text), ['2', 'div > img', '32', 'Image', 'hero.png'])
  assert.equal(candidates.rows[1].cells[1].format, 'selector')
  assert.equal(candidates.text, '2 rows')
})

test('an object of objects is a table with a row per key', () => {
  const eventTypes = detail({ script: 'X', status: 'ok', details: { eventTypes: { click: { count: 3, p75Ms: 48 }, keydown: { count: 1, p75Ms: 12 } } } }, 'eventTypes')
  assert.equal(eventTypes.format, 'table')
  assert.deepEqual(eventTypes.columns.map((c) => c.label), ['Name', 'Count', 'P75'])
  assert.deepEqual(eventTypes.rows[0].cells.map((c) => c.text), ['click', '3', '48 ms'])
})

test('an object of an element is a list of its fields, with the same rules', () => {
  const navigation = detail({ script: 'X', status: 'ok', details: { navigation: { responseStartMs: 1.1, earlyHintsReceived: false, server: 'nginx' } } }, 'navigation')
  assert.equal(navigation.format, 'fields')
  assert.deepEqual(navigation.fields.map(({ label, text }) => [label, text]), [
    ['Response start', '1 ms'],
    ['Early hints received', 'No'],
    ['Server', 'nginx'],
  ])
  assert.equal(navigation.text, 'Response start 1 ms · Early hints received No · Server nginx')
})

test('a list of values is a list', () => {
  const list = detail({ script: 'X', status: 'ok', details: { preloadedFonts: ['a.woff2', 'b.woff2'] } }, 'preloadedFonts')
  assert.deepEqual([list.format, list.text], ['list', 'a.woff2, b.woff2'])
})

test('a boolean is Yes or No in the details, and a mark only when true in a table', () => {
  const view = describeResult({ script: 'X', status: 'ok', details: { lcpAffected: false, cdnDetected: true }, items: [{ name: 'a', cached: true }, { name: 'b', cached: false }] })
  assert.deepEqual(view.details.map((d) => [d.format, d.text]), [['boolean', 'No'], ['boolean', 'Yes']])
  assert.deepEqual(view.rows.map((r) => r.cells[1].text), ['✓', ''])
})

test('a URL shows its file, and keeps the whole URL', () => {
  const view = describeResult({ script: 'X', status: 'ok', items: [{ url: 'https://example.com/assets/app.js?v=3' }, { url: 'https://example.com/' }] })
  assert.deepEqual(
    view.rows.map((r) => [r.cells[0].format, r.cells[0].text, r.cells[0].href]),
    [
      ['url', 'app.js', 'https://example.com/assets/app.js?v=3'],
      ['url', 'example.com', 'https://example.com/'],
    ]
  )
})

test('a selector has its own format, which the consumer can make inspectable', () => {
  const view = describeResult({ script: 'X', status: 'ok', details: { element: 'p.intro', elementType: 'Text' }, items: [{ selector: 'img#hero' }] })
  assert.deepEqual(view.details.map((d) => d.format), ['selector', undefined])
  assert.equal(view.rows[0].cells[0].format, 'selector')
})

test('the issues of a row are not a column, since the issues section lists them', () => {
  const view = describeResult({ script: 'X', status: 'ok', items: [{ src: 'a.png', issues: [{ code: 'x', severity: 'warning', message: 'm' }] }] })
  assert.deepEqual(view.columns.map((c) => c.key), ['src'])
})

// The results of every snippet on the seeded and the heavy pages of the CLI contract tests, written by
// scripts/capture-result-fixtures.mjs
const FIXTURES = new URL('./fixtures/results/', import.meta.url)
const fixtures = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(FIXTURES.pathname, f), 'utf8'))])

test('there is a fixture for every snippet on both pages', () => {
  assert.ok(fixtures.length >= 112, `${fixtures.length} fixtures`)
})

// A word that starts in lower case and has a capital inside (totalBlocking), or a label in lower case;
// a name such as LoAFs is not camelCase
const camelCase = /\b[a-z]+[A-Z]|^[a-z]/

test('no label of any snippet is in camelCase', () => {
  const found = fixtures.flatMap(([file, result]) => {
    const view = describeResult(result)
    return [view.title, ...view.details.map((d) => d.label), ...view.columns.map((c) => c.label)]
      .filter((label) => camelCase.test(label))
      .map((label) => `${file}: ${label}`)
  })
  assert.deepEqual(found, [])
})

// Every text of a view, nested tables and fields included
const textsOf = (field) => [
  field.text,
  ...(field.parts ?? []).map((p) => p.text),
  ...(field.fields ?? []).flatMap(textsOf),
  ...(field.rows ?? []).flatMap((r) => r.cells.flatMap(textsOf)),
]

test('no value of any snippet is shown as JSON', () => {
  const found = fixtures.flatMap(([file, result]) => {
    const view = describeResult(result)
    return [...view.details.flatMap(textsOf), ...view.rows.flatMap((r) => r.cells.flatMap(textsOf))]
      .filter((text) => /^[[{]/.test(text))
      .map((text) => `${file}: ${text.slice(0, 60)}`)
  })
  assert.deepEqual(found, [])
})
