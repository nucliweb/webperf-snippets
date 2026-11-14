const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const CONTENT = path.join(__dirname, '..', 'content')
const guide = fs.readFileSync(path.join(CONTENT, 'which-snippet.mdx'), 'utf8')

// The pages of the snippets: content/<Category>/<Name>.mdx. The index of a category introduces
// it and is not a snippet
const pages = fs
  .readdirSync(CONTENT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((category) =>
    fs
      .readdirSync(path.join(CONTENT, category.name))
      .filter((file) => file.endsWith('.mdx') && file !== 'index.mdx')
      .map((file) => `/${category.name}/${file.replace(/\.mdx$/, '')}`),
  )

const links = new Set([...guide.matchAll(/\]\((\/[^)#\s]+)/g)].map((match) => match[1]))

test('finds the pages of the snippets', () => {
  assert.ok(pages.length > 50)
})

// The guide is how a person gets from a symptom to a snippet: a page it does not name is one
// that only the search or the sidebar reach
test('which-snippet links every snippet page', () => {
  const missing = pages.filter((page) => !links.has(page))
  assert.deepEqual(missing, [])
})

test('every link of which-snippet to a snippet page goes to a page that exists', () => {
  const categories = new Set(pages.map((page) => page.split('/')[1]))
  const broken = [...links].filter((link) => categories.has(link.split('/')[1]) && link.split('/').length === 3 && !pages.includes(link))
  assert.deepEqual(broken, [])
})
