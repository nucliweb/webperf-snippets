const test = require('node:test')
const assert = require('node:assert/strict')
const { demoEmojis } = require('./check-emoji')

const found = (source) => demoEmojis(source).map((hit) => hit.emoji)

test('flags status emojis in a demo', () => {
  assert.deepEqual(found('<button>❌ No fix</button>'), ['❌'])
  assert.deepEqual(found("note: '⚠️ — rAF registered'"), ['⚠️'])
  assert.deepEqual(found("text: '✅ Render free'"), ['✅'])
})

test('flags the check and cross glyphs and the decorative symbols', () => {
  assert.deepEqual(found('✓ done ✗ failed ✕ closes'), ['✓', '✗', '✕'])
  assert.deepEqual(found("text: '▶ keep parsing', cap: '♻ stays open'"), ['▶', '♻'])
  assert.deepEqual(found('⚡ Recalc Style 🎨 Paint 👆'), ['⚡', '🎨', '👆'])
})

test('reports the line of each hit', () => {
  assert.deepEqual(demoEmojis('one\ntwo ✅\nthree'), [{ emoji: '✅', line: 2 }])
})

test('allows the arrows that label the Reset and Next buttons', () => {
  assert.deepEqual(found('<button>↩ Reset</button><button>Next step →</button>'), [])
})

test('allows the icon markup that replaces the emojis', () => {
  assert.deepEqual(found('<span class="ic ic-ok" role="img" aria-label="OK"></span> Render free'), [])
})
