import test from 'node:test'
import assert from 'node:assert/strict'
import { markdownPath, pageOfRoute, markdownUrlOfRoute } from './markdown-path.mjs'

test('markdownPath gives the URL path of the Markdown version of a page', () => {
  assert.equal(markdownPath('CoreWebVitals/LCP'), '/CoreWebVitals/LCP.md')
  assert.equal(markdownPath('index'), '/index.md')
})

test('pageOfRoute maps a route to its page: the home is index, and a folder its index page', () => {
  const pages = new Set(['index', 'CLI', 'CoreWebVitals/LCP', 'DevTools-Overrides/index'])
  const exists = (page) => pages.has(page)
  assert.equal(pageOfRoute(undefined, exists), 'index')
  assert.equal(pageOfRoute([], exists), 'index')
  assert.equal(pageOfRoute(['CLI'], exists), 'CLI')
  assert.equal(pageOfRoute(['CoreWebVitals', 'LCP'], exists), 'CoreWebVitals/LCP')
  assert.equal(pageOfRoute(['DevTools-Overrides'], exists), 'DevTools-Overrides/index')
  assert.equal(pageOfRoute(['Nope'], exists), null)
})

test('markdownUrlOfRoute gives the absolute URL of the Markdown version, from the pages in content/', () => {
  assert.equal(markdownUrlOfRoute(['CoreWebVitals', 'LCP']), 'https://webperf-snippets.nucliweb.net/CoreWebVitals/LCP.md')
  assert.equal(markdownUrlOfRoute([]), 'https://webperf-snippets.nucliweb.net/index.md')
  assert.equal(markdownUrlOfRoute(['DevTools-Overrides']), 'https://webperf-snippets.nucliweb.net/DevTools-Overrides/index.md')
  assert.equal(markdownUrlOfRoute(['Nope']), null)
})
