const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { extractTitle, extractDescription, snippetPaths, readPageInfo } = require('./page-info')

const CONTENT = path.join(__dirname, '..', 'content')

const PAGE = `---
browserSupport:
  - api.PerformanceObserver
---

import snippet from '../../snippets/Loading/TTFB.js?raw'
import subParts from '../../snippets/Loading/TTFB-Sub-Parts.js?raw'
import { Snippet } from '../../components/Snippet'

# Time to first byte

Measures the **time** until the [first byte](https://web.dev/ttfb) of the \`document\`
arrives from the server.

Second paragraph.
`

test('extractTitle reads the H1', () => {
  assert.equal(extractTitle(PAGE), 'Time to first byte')
})

test('extractDescription gives the first paragraph after the H1 as plain text, on one line', () => {
  assert.equal(extractDescription(PAGE), 'Measures the time until the first byte of the document arrives from the server.')
})

test('extractDescription skips headings, tables, quotes and components before the first paragraph', () => {
  const mdx = `# Overrides\n\n### What are they?\n\n<Callout>Note</Callout>\n\n> Quote\n\n| a |\n|---|\n\nThe first paragraph.\n`
  assert.equal(extractDescription(mdx), 'The first paragraph.')
})

test('extractDescription works on a page with no imports or frontmatter', () => {
  assert.equal(extractDescription('# CLI\n\nRun the snippets headlessly.\n'), 'Run the snippets headlessly.')
})

test('snippetPaths lists the snippets a page imports', () => {
  assert.deepEqual(snippetPaths(PAGE), ['Loading/TTFB', 'Loading/TTFB-Sub-Parts'])
})

test('readPageInfo reads a real page', () => {
  const info = readPageInfo(CONTENT, 'CoreWebVitals/LCP')
  assert.equal(info.title, 'Largest contentful paint (LCP)')
  assert.match(info.description, /^Quick check for Largest Contentful Paint, a Core Web Vital/)
  assert.deepEqual(info.snippets, ['CoreWebVitals/LCP'])
})

test('every page has a title and a description', () => {
  const walk = (dir) =>
    require('fs').readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.mdx') ? [path.relative(CONTENT, path.join(dir, d.name)).slice(0, -4)] : []
    )
  for (const page of walk(CONTENT)) {
    const info = readPageInfo(CONTENT, page)
    assert.ok(info.title, `${page}: title`)
    assert.ok(info.description.length > 40, `${page}: description "${info.description}"`)
  }
})
