const test = require('node:test')
const assert = require('node:assert/strict')
const { stripEmoji, cleanSpec } = require('./strip-emoji')

test('removes a leading emoji and the space after it', () => {
  assert.equal(stripEmoji('✅ Include in CLS'), 'Include in CLS')
})

test('removes a trailing emoji and the space before it', () => {
  assert.equal(stripEmoji('Long Animation Frames API ✅'), 'Long Animation Frames API')
})

test('removes emojis with a variation selector and the check and cross glyphs', () => {
  assert.equal(stripEmoji('⏱️ Task > 50ms'), 'Task > 50ms')
  assert.equal(stripEmoji('✓ Add defer attribute'), 'Add defer attribute')
  assert.equal(stripEmoji('Fast ✓ No network'), 'Fast No network')
})

test('cleans every line of a multi-line label', () => {
  assert.equal(stripEmoji('⚡ Break up long tasks\n⚡ Use scheduler.yield()'), 'Break up long tasks\nUse scheduler.yield()')
  assert.equal(stripEmoji('Initial layout shifts\n✅ Count toward CLS'), 'Initial layout shifts\nCount toward CLS')
})

test('keeps text without emojis as it is, including arrows and comparison signs', () => {
  assert.equal(stripEmoji('isDirty? YES → warn FSL'), 'isDirty? YES → warn FSL')
  assert.equal(stripEmoji('Frame > 50ms'), 'Frame > 50ms')
})

test('cleanSpec cleans label, sub, text and title at any depth and leaves ids alone', () => {
  const spec = {
    nodes: [{ id: 'a', label: '❌ Exclude', sub: '✅ Count', tone: 'bad' }],
    edges: [{ from: 'a', to: 'b', label: 'Good ✅' }],
    groups: [{ id: 'g', label: 'API ❌', nodes: ['a'] }],
    steps: [{ type: 'note', over: ['U', 'JS'], text: 'Total: ~6,300ms 🔴' }],
  }
  const out = cleanSpec(spec)
  assert.equal(out.nodes[0].label, 'Exclude')
  assert.equal(out.nodes[0].sub, 'Count')
  assert.equal(out.edges[0].label, 'Good')
  assert.equal(out.groups[0].label, 'API')
  assert.deepEqual(out.groups[0].nodes, ['a'])
  assert.equal(out.steps[0].text, 'Total: ~6,300ms')
  assert.deepEqual(out.steps[0].over, ['U', 'JS'])
  assert.equal(out.nodes[0].id, 'a')
  assert.equal(out.nodes[0].tone, 'bad')
})

test('cleanSpec does not change its input', () => {
  const spec = { nodes: [{ id: 'a', label: '✅ Yes' }] }
  cleanSpec(spec)
  assert.equal(spec.nodes[0].label, '✅ Yes')
})
