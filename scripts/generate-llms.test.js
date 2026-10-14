const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSnippetEntries, buildGuideEntries, generateLlmsTxt } = require('./generate-llms')

const BASE = 'https://webperf-snippets.net'

test('llms.txt links each page to its Markdown version', () => {
  const txt = generateLlmsTxt(buildSnippetEntries(), buildGuideEntries())
  assert.match(txt, new RegExp(`- \\[Largest contentful paint \\(LCP\\)\\]\\(${BASE}/CoreWebVitals/LCP\\.md\\)`))
  assert.doesNotMatch(txt, new RegExp(`\\]\\(${BASE}/[^)]*[^d]\\)`))
})

test('llms.txt lists the guides before the snippets', () => {
  const txt = generateLlmsTxt(buildSnippetEntries(), buildGuideEntries())
  assert.match(txt, new RegExp(`## Guides\\n\\n- \\[WebPerf Snippets CLI\\]\\(${BASE}/CLI\\.md\\)`))
  assert.match(txt, new RegExp(`- \\[Which snippet should I use\\?\\]\\(${BASE}/which-snippet\\.md\\)`))
  assert.ok(txt.indexOf('## Guides') < txt.indexOf('## Core Web Vitals'))
})
