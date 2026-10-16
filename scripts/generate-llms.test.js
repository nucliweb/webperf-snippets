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

test('llms.txt and llms-full.txt give the version of the collection', () => {
  const { generateLlmsFullTxt } = require('./generate-llms')
  const { version } = require('../package.json')
  const entries = buildSnippetEntries()
  assert.match(generateLlmsTxt(entries, buildGuideEntries()), new RegExp(`^> Version: ${version.replaceAll('.', '\\.')}$`, 'm'))
  assert.match(generateLlmsFullTxt(entries), new RegExp(`^Version: ${version.replaceAll('.', '\\.')}$`, 'm'))
})

test('llms.txt and llms-full.txt describe the collection with the description of the site', () => {
  const { generateLlmsFullTxt } = require('./generate-llms')
  const { site } = require('../lib/site.js')
  const entries = buildSnippetEntries()
  assert.ok(generateLlmsTxt(entries, buildGuideEntries()).includes(`> ${site.description}\n`))
  assert.ok(generateLlmsFullTxt(entries).includes(`\n${site.description}\n`))
})
