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

const { proseEmojis, KNOWN_UNMAPPED } = require('./check-emoji')

const proseFound = (source) => proseEmojis(source).map((hit) => hit.emoji)

test('prose ignores emojis written as inline code, which mirror what the console prints', () => {
  assert.deepEqual(proseFound('| Is LCP | `👈` marks the current LCP element |'), [])
  assert.deepEqual(proseFound('| `🖼️` | `inline` | `🔗` and more |'), [])
})

test('prose still flags the same emoji outside inline code', () => {
  assert.deepEqual(proseFound('| Is LCP | 👈 marks the current LCP element |'), ['👈'])
  assert.deepEqual(proseFound('- ⚡ **Async**: Downloads in parallel'), ['⚡'])
})

test('prose ignores code fences and the props of diagram components', () => {
  assert.deepEqual(proseFound('```js\nconsole.log("✅ ok")\n```'), [])
  assert.deepEqual(proseFound('<Flow\n  nodes={[{ label: "⏳ Wait" }]}\n/>'), [])
})

test('no decorative emoji is waiting to be removed any more', () => {
  assert.equal(KNOWN_UNMAPPED.size, 0)
})

const { headingEmojis } = require('./check-emoji')

const headingFound = (source) => headingEmojis(source).map((hit) => hit.emoji)

test('headings may not hold an emoji, because the table of contents shows it as plain text', () => {
  assert.deepEqual(headingFound('### ✅ Good: Next.js route prefetching'), ['✅'])
  assert.deepEqual(headingFound('## Navigation preload disabled (`❌ Disabled`)'), ['❌'])
})

test('headings check includes inline code, but not code fences or body text', () => {
  assert.deepEqual(headingFound('```md\n### ✅ example\n```'), [])
  assert.deepEqual(headingFound('A paragraph with ✅\n\n### Plain heading'), [])
})

test('reports the line of the heading', () => {
  assert.deepEqual(headingEmojis('# Title\n\n### ❌ Bad: x'), [{ emoji: '❌', line: 3 }])
})
