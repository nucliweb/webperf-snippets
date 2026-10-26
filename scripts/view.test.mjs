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
    ['style.css', 'link', '401 ms', '120 ms', '17.2 KB', 'https://example.com/style.css']
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

// The results of every snippet on the seeded and the heavy pages of the CLI contract tests, written by
// scripts/capture-result-fixtures.mjs
const FIXTURES = new URL('./fixtures/results/', import.meta.url)
const fixtures = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(FIXTURES.pathname, f), 'utf8'))])

test('there is a fixture for every snippet on both pages', () => {
  assert.ok(fixtures.length >= 112, `${fixtures.length} fixtures`)
})

const camelCase = /[a-z][A-Z]|^[a-z]/

test('no label of any snippet is in camelCase', () => {
  const found = fixtures.flatMap(([file, result]) => {
    const view = describeResult(result)
    return [view.title, ...view.details.map((d) => d.label), ...view.columns.map((c) => c.label)]
      .filter((label) => camelCase.test(label))
      .map((label) => `${file}: ${label}`)
  })
  assert.deepEqual(found, [])
})
