const { ICONS, SHAPES, EMOJI_PATTERN } = require('./icons')

// Rehype plugin: replaces the emojis listed in lib/icons.js with icons while a
// page renders. Code (inline and blocks) keeps its emojis because it mirrors
// what the console prints.

const SKIPPED = new Set(['code', 'pre', 'svg', 'script', 'style'])

function build(spec) {
  const className = spec.kind === 'dot' ? ['wp-dot', `wp-dot-${spec.tone}`] : ['wp-ic', `wp-ic-${spec.tone}`]
  const node = {
    type: 'element',
    tagName: 'span',
    properties: { className, role: 'img', ariaLabel: spec.label },
    children: [],
  }
  if (spec.kind === 'icon') {
    node.children.push({
      type: 'element',
      tagName: 'svg',
      properties: { viewBox: '0 0 24 24', ariaHidden: 'true', focusable: 'false' },
      children: SHAPES[spec.shape].map(([tagName, properties]) => ({
        type: 'element',
        tagName,
        properties: { ...properties },
        children: [],
      })),
    })
  }
  return node
}

function split(value) {
  const re = new RegExp(EMOJI_PATTERN, 'g')
  const parts = []
  let last = 0
  for (const match of value.matchAll(re)) {
    if (match.index > last) parts.push({ type: 'text', value: value.slice(last, match.index) })
    parts.push(build(ICONS[match[0]]))
    last = match.index + match[0].length
  }
  if (last === 0) return null
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
  return parts
}

function walk(node) {
  if (!node.children) return
  if (node.type === 'element' && SKIPPED.has(node.tagName)) return
  const next = []
  for (const child of node.children) {
    if (child.type === 'text') {
      next.push(...(split(child.value) || [child]))
    } else {
      walk(child)
      next.push(child)
    }
  }
  node.children = next
}

module.exports = function rehypeIcons() {
  return (tree) => walk(tree)
}
