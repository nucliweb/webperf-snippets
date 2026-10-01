const test = require('node:test')
const assert = require('node:assert/strict')
const {
  BROWSERS,
  cellFor,
  combineCells,
  compareVersions,
  featureLabel,
  lookupFeature,
  supportFor,
  badgeText,
  cellText,
} = require('./browser-support')

// A small stand-in for @mdn/browser-compat-data: same shape, only what the tests need.
const bcd = {
  api: {
    LayoutShift: {
      __compat: {
        mdn_url: 'https://developer.mozilla.org/docs/Web/API/LayoutShift',
        support: {
          chrome: { version_added: '77' },
          edge: { version_added: '79' },
          firefox: { version_added: false },
          safari: { version_added: false },
        },
      },
    },
    PerformanceObserver: {
      __compat: {
        mdn_url: 'https://developer.mozilla.org/docs/Web/API/PerformanceObserver',
        support: {
          chrome: { version_added: '52' },
          edge: { version_added: '≤79' },
          firefox: { version_added: '57' },
          safari: { version_added: '11' },
        },
      },
    },
    LargestContentfulPaint: {
      __compat: {
        support: {
          chrome: { version_added: '77' },
          edge: { version_added: '79' },
          firefox: { version_added: '122' },
          safari: { version_added: '26.2' },
        },
      },
    },
  },
}

test('compareVersions orders dotted versions numerically', () => {
  assert.ok(compareVersions('26.2', '15.4') > 0)
  assert.ok(compareVersions('9', '10') < 0)
  assert.ok(compareVersions('15.4', '15.4') === 0)
  assert.ok(compareVersions('17', '17.2') < 0)
})

test('cellFor reads a plain version, a range and unknown support', () => {
  assert.deepEqual(cellFor({ version_added: '77' }), { state: 'yes', version: '77' })
  assert.deepEqual(cellFor({ version_added: '≤79' }), { state: 'yes', version: '79' })
  assert.deepEqual(cellFor({ version_added: true }), { state: 'yes', version: null })
  assert.deepEqual(cellFor({ version_added: false }), { state: 'no', version: null })
})

test('cellFor treats a flag, a preview build and a removal as not supported', () => {
  assert.equal(cellFor({ version_added: '90', flags: [{ type: 'preference', name: 'x' }] }).state, 'no')
  assert.equal(cellFor({ version_added: 'preview' }).state, 'no')
  assert.equal(cellFor({ version_added: '40', version_removed: '60' }).state, 'no')
})

test('cellFor marks a partial implementation', () => {
  assert.deepEqual(cellFor({ version_added: '11', partial_implementation: true }), { state: 'partial', version: '11' })
})

test('cellFor picks the first entry that is neither prefixed nor behind a flag', () => {
  const statement = [
    { version_added: '30', prefix: 'webkit' },
    { version_added: '95', flags: [{ type: 'preference', name: 'x' }] },
    { version_added: '80' },
  ]
  assert.deepEqual(cellFor(statement), { state: 'yes', version: '80' })
})

test('cellFor says no when the statement is missing', () => {
  assert.deepEqual(cellFor(undefined), { state: 'no', version: null })
})

test('combineCells needs every feature: the highest version wins and one gap breaks it', () => {
  assert.deepEqual(
    combineCells([{ state: 'yes', version: '52' }, { state: 'yes', version: '77' }]),
    { state: 'yes', version: '77' },
  )
  assert.deepEqual(
    combineCells([{ state: 'yes', version: '57' }, { state: 'no', version: null }]),
    { state: 'no', version: null },
  )
})

test('combineCells keeps a partial implementation and an unknown version', () => {
  assert.equal(combineCells([{ state: 'yes', version: '10' }, { state: 'partial', version: '12' }]).state, 'partial')
  assert.equal(combineCells([{ state: 'yes', version: null }, { state: 'yes', version: '12' }]).version, null)
})

test('lookupFeature finds a feature and fails loudly on an unknown key', () => {
  assert.equal(lookupFeature(bcd, 'api.LayoutShift').mdn_url, 'https://developer.mozilla.org/docs/Web/API/LayoutShift')
  assert.throws(() => lookupFeature(bcd, 'api.DoesNotExist'), /api\.DoesNotExist/)
})

test('supportFor builds a row per feature and a combined row', () => {
  const result = supportFor(bcd, ['api.LayoutShift', 'api.PerformanceObserver'])
  assert.deepEqual(result.features.map((f) => f.key), ['api.LayoutShift', 'api.PerformanceObserver'])
  assert.deepEqual(result.features[0].cells.chrome, { state: 'yes', version: '77' })
  assert.deepEqual(result.features[1].cells.edge, { state: 'yes', version: '79' })
  assert.deepEqual(result.combined.chrome, { state: 'yes', version: '77' })
  assert.deepEqual(result.combined.firefox, { state: 'no', version: null })
  assert.deepEqual(Object.keys(result.combined), BROWSERS.map((b) => b.id))
})

test('featureLabel shortens a key to the name a reader knows', () => {
  assert.equal(featureLabel('api.LayoutShift'), 'LayoutShift')
  assert.equal(featureLabel('api.PerformanceEventTiming.interactionId'), 'PerformanceEventTiming.interactionId')
  assert.equal(featureLabel('css.properties.content-visibility'), 'content-visibility')
  assert.equal(featureLabel('html.elements.img.loading'), '<img loading>')
  assert.equal(featureLabel('html.elements.link.rel.preload'), '<link rel="preload">')
})

test('badgeText and cellText use the icon emojis the rehype plugin turns into icons', () => {
  assert.equal(badgeText('Chrome', { state: 'yes', version: '77' }), '✅ Chrome 77+')
  assert.equal(badgeText('Chrome', { state: 'yes', version: null }), '✅ Chrome')
  assert.equal(badgeText('Firefox', { state: 'no', version: null }), '❌ Firefox')
  assert.equal(badgeText('Safari', { state: 'partial', version: '26.2' }), '⚠️ Safari 26.2+ (partial)')
  assert.equal(cellText({ state: 'yes', version: '77' }), '✅ 77')
  assert.equal(cellText({ state: 'no', version: null }), '❌')
  assert.equal(cellText({ state: 'partial', version: '11' }), '⚠️ 11')
})
