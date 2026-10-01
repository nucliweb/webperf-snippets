const fs = require('node:fs')
const matter = require('gray-matter')
const { BROWSERS, badgeText, cellText, supportFor } = require('./browser-support')

// Remark plugin: draws the browser support of a page at build time.
//
// A page lists what it needs in its frontmatter:
//
//   ---
//   browserSupport:
//     - api.LayoutShift
//     - api.PerformanceObserver
//   ---
//
// The plugin puts a row of browsers right after the H1 and a table after the
// "Browser support" heading, both computed from MDN browser-compat-data. Nextra
// strips the frontmatter before compiling, so the plugin reads it from the file.
// The emojis in the generated text become icons in lib/rehype-icons.js.

const SOURCE_URL = 'https://github.com/mdn/browser-compat-data'

const text = (value) => ({ type: 'text', value })
const attribute = (name, value) => ({ type: 'mdxJsxAttribute', name, value })

const isSection = (node) => node.type === 'heading' && /^browser support\b/i.test(plainText(node))

function plainText(node) {
  if (node.value) return node.value
  return (node.children || []).map(plainText).join('')
}

function badge(support) {
  const items = BROWSERS.flatMap(({ id, label }) => {
    const cell = support.combined[id]
    return [
      {
        type: 'mdxJsxTextElement',
        name: 'span',
        attributes: [attribute('className', `wp-support-item wp-support-${cell.state}`)],
        children: [text(badgeText(label, cell))],
      },
      text(' '),
    ]
  })
  return {
    type: 'mdxJsxFlowElement',
    name: 'div',
    attributes: [attribute('className', 'wp-support'), attribute('role', 'group'), attribute('aria-label', 'Browser support')],
    children: [
      {
        type: 'paragraph',
        children: [...items, { type: 'link', url: '#browser-support', children: [text('Details')] }],
      },
    ],
  }
}

function table(support) {
  const row = (cells) => ({ type: 'tableRow', children: cells.map((children) => ({ type: 'tableCell', children })) })
  const rows = [row([[text('Feature')], ...BROWSERS.map((b) => [text(b.label)])])]

  for (const feature of support.features) {
    const name = feature.mdnUrl
      ? { type: 'link', url: feature.mdnUrl, children: [text(feature.label)] }
      : text(feature.label)
    rows.push(row([[name], ...BROWSERS.map((b) => [text(cellText(feature.cells[b.id]))])]))
  }
  if (support.features.length > 1) {
    rows.push(row([[text('All of the above')], ...BROWSERS.map((b) => [text(cellText(support.combined[b.id]))])]))
  }
  return { type: 'table', align: [null, ...BROWSERS.map(() => 'center')], children: rows }
}

function credit(bcd) {
  const version = bcd.__meta && bcd.__meta.version ? `, version ${bcd.__meta.version}` : ''
  return {
    type: 'paragraph',
    children: [
      text('Source: '),
      { type: 'link', url: SOURCE_URL, children: [text('MDN browser compatibility data')] },
      text(`${version}.`),
    ],
  }
}

module.exports = function remarkBrowserSupport(options = {}) {
  return (tree, file) => {
    if (!file.path) return
    const features = matter(fs.readFileSync(file.path, 'utf8')).data.browserSupport
    if (!Array.isArray(features) || features.length === 0) return

    const bcd = options.bcd || require('@mdn/browser-compat-data')
    const support = supportFor(bcd, features)

    const sectionAt = tree.children.findIndex(isSection)
    if (sectionAt === -1) {
      throw new Error(`${file.path}: browserSupport needs a "Browser support" heading to hold the table`)
    }
    const depth = tree.children[sectionAt].depth
    for (let i = sectionAt + 1; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.type === 'heading' && node.depth <= depth) break
      if (node.type === 'table') {
        throw new Error(`${file.path}: remove the hand-written table from the Browser support section; it is generated`)
      }
    }

    // The section first, so the index of the H1 badge is still right afterwards.
    tree.children.splice(sectionAt + 1, 0, table(support), credit(bcd))
    const h1At = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 1)
    tree.children.splice(h1At + 1, 0, badge(support))
  }
}
