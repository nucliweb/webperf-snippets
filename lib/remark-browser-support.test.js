const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const remarkBrowserSupport = require('./remark-browser-support')

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
        support: {
          chrome: { version_added: '52' },
          edge: { version_added: '79' },
          firefox: { version_added: '57' },
          safari: { version_added: '11' },
        },
      },
    },
  },
}

const text = (value) => ({ type: 'text', value })
const heading = (depth, value) => ({ type: 'heading', depth, children: [text(value)] })
const paragraph = (value) => ({ type: 'paragraph', children: [text(value)] })

function page(frontmatter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'support-'))
  const file = path.join(dir, 'page.mdx')
  fs.writeFileSync(file, `${frontmatter}\n# Title\n`)
  return { path: file }
}

const tree = () => ({
  type: 'root',
  children: [heading(1, 'Title'), paragraph('Intro.'), heading(3, 'Browser support'), paragraph('A note.')],
})

const run = (file, root) => {
  remarkBrowserSupport({ bcd })(root, file)
  return root
}
const withFeatures = '---\nbrowserSupport:\n  - api.LayoutShift\n  - api.PerformanceObserver\n---\n'

test('leaves a page without browserSupport untouched', () => {
  const root = run(page('---\ntype: guide\n---\n'), tree())
  assert.equal(root.children.length, 4)
})

test('puts the badge right after the H1', () => {
  const root = run(page(withFeatures), tree())
  const badge = root.children[1]
  assert.equal(badge.type, 'mdxJsxFlowElement')
  assert.equal(badge.name, 'div')
  const items = badge.children[0].children.filter((n) => n.type === 'mdxJsxTextElement')
  assert.deepEqual(
    items.map((n) => n.children[0].value),
    ['✅ Chrome 77+', '✅ Edge 79+', '❌ Firefox', '❌ Safari'],
  )
  assert.deepEqual(
    items.map((n) => n.attributes[0].value),
    ['wp-support-item wp-support-yes', 'wp-support-item wp-support-yes', 'wp-support-item wp-support-no', 'wp-support-item wp-support-no'],
  )
})

test('links the badge to the Browser support section', () => {
  const root = run(page(withFeatures), tree())
  const link = root.children[1].children[0].children.find((n) => n.type === 'link')
  assert.equal(link.url, '#browser-support')
})

test('puts a table after the Browser support heading and keeps the notes below it', () => {
  const root = run(page(withFeatures), tree())
  const at = root.children.findIndex((n) => n.type === 'heading' && n.depth === 3)
  assert.equal(root.children[at + 1].type, 'table')
  assert.equal(root.children[at + 2].type, 'paragraph')
  assert.equal(root.children[at + 3].children[0].value, 'A note.')
})

test('the table has a row per feature plus the combined row, with the header first', () => {
  const root = run(page(withFeatures), tree())
  const table = root.children.find((n) => n.type === 'table')
  const cells = (row) => row.children.map((cell) => {
    const [first] = cell.children
    return first.type === 'link' ? first.children[0].value : first.value
  })
  assert.deepEqual(cells(table.children[0]), ['Feature', 'Chrome', 'Edge', 'Firefox', 'Safari'])
  assert.deepEqual(cells(table.children[1]), ['LayoutShift', '✅ 77', '✅ 79', '❌', '❌'])
  assert.deepEqual(cells(table.children[2]), ['PerformanceObserver', '✅ 52', '✅ 79', '✅ 57', '✅ 11'])
  assert.deepEqual(cells(table.children[3]), ['All of the above', '✅ 77', '✅ 79', '❌', '❌'])
})

test('links a feature to its MDN page when there is one', () => {
  const root = run(page(withFeatures), tree())
  const table = root.children.find((n) => n.type === 'table')
  assert.equal(table.children[1].children[0].children[0].url, 'https://developer.mozilla.org/docs/Web/API/LayoutShift')
  assert.equal(table.children[2].children[0].children[0].type, 'text')
})

test('a single feature has no combined row', () => {
  const root = run(page('---\nbrowserSupport:\n  - api.LayoutShift\n---\n'), tree())
  const table = root.children.find((n) => n.type === 'table')
  assert.equal(table.children.length, 2)
})

test('credits the data source under the table', () => {
  const root = run(page(withFeatures), tree())
  const at = root.children.findIndex((n) => n.type === 'table')
  const credit = root.children[at + 1]
  assert.equal(credit.type, 'paragraph')
  assert.ok(credit.children.some((n) => n.type === 'link' && /browser-compat-data/.test(n.url)))
})

test('fails when the page has no Browser support heading', () => {
  const root = { type: 'root', children: [heading(1, 'Title'), paragraph('Intro.')] }
  assert.throws(() => run(page(withFeatures), root), /Browser support/)
})

test('fails when the section still holds a hand-written table', () => {
  const root = tree()
  root.children.splice(3, 0, { type: 'table', children: [] })
  assert.throws(() => run(page(withFeatures), root), /hand-written table/)
})

test('fails on a feature that browser-compat-data does not know', () => {
  assert.throws(() => run(page('---\nbrowserSupport:\n  - api.Nope\n---\n'), tree()), /api\.Nope/)
})

const withReported =
  '---\nbrowserSupport:\n  - api.PerformanceObserver\nbrowserSupportReported:\n  - api.LayoutShift\n---\n'

test('a reported feature gets its own table and does not change the badge', () => {
  const root = run(page(withReported), tree())
  const items = root.children[1].children[0].children.filter((n) => n.type === 'mdxJsxTextElement')
  assert.deepEqual(
    items.map((n) => n.children[0].value),
    ['✅ Chrome 52+', '✅ Edge 79+', '✅ Firefox 57+', '✅ Safari 11+'],
  )
})

test('with a reported table, each table has a sentence that says what it is', () => {
  const root = run(page(withReported), tree())
  const at = root.children.findIndex((n) => n.type === 'heading' && n.depth === 3)
  assert.equal(root.children[at + 1].type, 'paragraph')
  assert.match(root.children[at + 1].children[0].value, /needs these features to run/)
  assert.equal(root.children[at + 2].type, 'table')
  assert.equal(root.children[at + 3].type, 'paragraph')
  assert.match(root.children[at + 3].children[0].value, /reports on these features/)
  assert.equal(root.children[at + 4].type, 'table')
  assert.equal(root.children[at + 5].children[0].value, 'Source: ')
  assert.equal(root.children[at + 6].children[0].value, 'A note.')
})

test('without a reported table, the main table has no lead sentence', () => {
  const root = run(page(withFeatures), tree())
  const at = root.children.findIndex((n) => n.type === 'heading' && n.depth === 3)
  assert.equal(root.children[at + 1].type, 'table')
})

test('the reported table lists each feature and has no combined row', () => {
  const root = run(page(withReported), tree())
  const reported = root.children.filter((n) => n.type === 'table')[1]
  const cells = (row) => row.children.map((cell) => {
    const [first] = cell.children
    return first.type === 'link' ? first.children[0].value : first.value
  })
  assert.deepEqual(reported.children.map(cells), [
    ['Feature', 'Chrome', 'Edge', 'Firefox', 'Safari'],
    ['LayoutShift', '✅ 77', '✅ 79', '❌', '❌'],
  ])
})

test('fails on a reported feature that browser-compat-data does not know', () => {
  const source = '---\nbrowserSupport:\n  - api.PerformanceObserver\nbrowserSupportReported:\n  - api.Nope\n---\n'
  assert.throws(() => run(page(source), tree()), /api\.Nope/)
})
