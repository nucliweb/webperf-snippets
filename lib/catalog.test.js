const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { categoryCatalog, siteCategories, snippetCategories } = require('./catalog')
const { readMeta } = require('../scripts/read-meta')
const { readPageInfo } = require('./page-info')

const CONTENT = path.join(__dirname, '..', 'content')

test('categoryCatalog lists the pages of a category in the order of its _meta.js, without its own index', () => {
  const catalog = categoryCatalog(CONTENT, 'Loading')
  const order = Object.keys(readMeta(path.join(CONTENT, 'Loading'))).filter((slug) => slug !== 'index')
  assert.deepEqual(catalog.pages.map((p) => p.slug), order)
  assert.equal(catalog.title, 'Loading')
})

test('each page of the catalog has the title, the description and the URL of its page', () => {
  const ttfb = categoryCatalog(CONTENT, 'Loading').pages.find((p) => p.slug === 'TTFB')
  const info = readPageInfo(CONTENT, 'Loading/TTFB')
  assert.deepEqual(ttfb, { slug: 'TTFB', title: info.title, description: info.description, url: '/Loading/TTFB' })
})

test('every snippet category has a catalog with every page of its folder', () => {
  for (const category of ['CoreWebVitals', 'Loading', 'Interaction', 'Media', 'Resources']) {
    const files = fs.readdirSync(path.join(CONTENT, category)).filter((f) => f.endsWith('.mdx') && f !== 'index.mdx').map((f) => f.slice(0, -4))
    assert.deepEqual(categoryCatalog(CONTENT, category).pages.map((p) => p.slug).sort(), files.sort(), category)
  }
})

test('siteCategories lists the folders of the site that have a page of their own, in the order of the sidebar', () => {
  const categories = siteCategories(CONTENT)
  assert.deepEqual(categories.map((c) => c.category), ['CoreWebVitals', 'Loading', 'Interaction', 'Resources', 'Media', 'DevTools-Overrides'])
  const loading = categories.find((c) => c.category === 'Loading')
  assert.equal(loading.title, 'Loading')
  assert.equal(loading.url, '/Loading')
  assert.equal(loading.description, readPageInfo(CONTENT, 'Loading/index').description)
  assert.equal(loading.count, categoryCatalog(CONTENT, 'Loading').pages.length)
})

test('snippetCategories leaves DevTools Overrides out of the categories of snippets', () => {
  assert.deepEqual(snippetCategories(CONTENT).map((c) => c.category), ['CoreWebVitals', 'Loading', 'Interaction', 'Resources', 'Media'])
})
