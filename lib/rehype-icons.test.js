const test = require('node:test')
const assert = require('node:assert/strict')
const rehypeIcons = require('./rehype-icons')
const { ICONS } = require('./icons')

const text = (value) => ({ type: 'text', value })
const el = (tagName, children = [], properties = {}) => ({ type: 'element', tagName, properties, children })
const run = (tree) => {
  rehypeIcons()(tree)
  return tree
}
const classOf = (node) => node.properties.className.join(' ')

test('replaces a rating emoji with a colored dot that keeps its meaning', () => {
  const cell = el('td', [text('🟢 Good')])
  run(el('table', [el('tr', [cell])]))

  const [dot, rest] = cell.children
  assert.equal(dot.tagName, 'span')
  assert.equal(classOf(dot), 'wp-dot wp-dot-good')
  assert.equal(dot.properties.role, 'img')
  assert.equal(dot.properties.ariaLabel, 'Good')
  assert.deepEqual(rest, text(' Good'))
})

test('replaces a status emoji with an inline svg icon', () => {
  const cell = el('td', [text('✅ 77')])
  run(el('table', [el('tr', [cell])]))

  const [icon, rest] = cell.children
  assert.equal(classOf(icon), 'wp-ic wp-ic-good')
  assert.equal(icon.properties.ariaLabel, 'Yes')
  assert.equal(icon.children[0].tagName, 'svg')
  assert.equal(icon.children[0].properties.viewBox, '0 0 24 24')
  assert.ok(icon.children[0].children.length > 0)
  assert.deepEqual(rest, text(' 77'))
})

test('handles several emojis in one text node and keeps the text between them', () => {
  const p = el('p', [text('a ✅ b ❌ c')])
  run(p)
  assert.deepEqual(
    p.children.map((n) => (n.type === 'text' ? n.value : classOf(n))),
    ['a ', 'wp-ic wp-ic-good', ' b ', 'wp-ic wp-ic-poor', ' c'],
  )
})

test('treats the emoji with and without the variation selector the same way', () => {
  for (const warning of ['⚠️', '⚠']) {
    const p = el('p', [text(`${warning} careful`)])
    run(p)
    assert.equal(classOf(p.children[0]), 'wp-ic wp-ic-mid')
    assert.deepEqual(p.children[1], text(' careful'))
  }
})

test('leaves inline code and code blocks untouched', () => {
  const inline = el('code', [text('⏳ Waiting SW detected')])
  const block = el('pre', [el('code', [text('✅ passed\n❌ failed')])])
  run(el('div', [inline, block]))

  assert.deepEqual(inline.children, [text('⏳ Waiting SW detected')])
  assert.deepEqual(block.children[0].children, [text('✅ passed\n❌ failed')])
})

test('leaves emojis without an icon mapping as they are', () => {
  const p = el('p', [text('🎨 Presentation')])
  run(p)
  assert.deepEqual(p.children, [text('🎨 Presentation')])
})

test('does not touch text without emojis', () => {
  const t = text('Plain text with ≤ 0.1 and > 0.25')
  const p = el('p', [t])
  run(p)
  assert.equal(p.children[0], t)
})

test('every mapped emoji produces a dot or an icon with a label', () => {
  for (const [emoji, spec] of Object.entries(ICONS)) {
    const p = el('p', [text(emoji)])
    run(p)
    assert.equal(p.children.length, 1, emoji)
    assert.equal(p.children[0].tagName, 'span', emoji)
    assert.ok(p.children[0].properties.ariaLabel, `${emoji} needs a label`)
    assert.ok(spec.tone, `${emoji} needs a tone`)
  }
})
