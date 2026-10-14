import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegistry } from './webmcp-registry.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://webperf-snippets.net'
const registry = buildRegistry(ROOT)
const byId = Object.fromEntries(registry.map((s) => [s.id, s]))

const snippetFiles = readdirSync(join(ROOT, 'snippets'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .flatMap((d) => readdirSync(join(ROOT, 'snippets', d.name)).filter((f) => f.endsWith('.js')).map((f) => `${d.name}/${f.slice(0, -3)}`))

test('the registry has every snippet of the repository, with a unique id', () => {
  assert.deepEqual(registry.map((s) => s.path).sort(), snippetFiles.sort())
  assert.equal(new Set(registry.map((s) => s.id)).size, registry.length)
})

test('a snippet takes the title, description and URLs of its page, and its own code', () => {
  const lcp = byId.LCP
  assert.equal(lcp.path, 'CoreWebVitals/LCP')
  assert.equal(lcp.category, 'CoreWebVitals')
  assert.equal(lcp.title, 'Largest contentful paint (LCP)')
  assert.match(lcp.description, /^Quick check for Largest Contentful Paint/)
  assert.equal(lcp.url, `${BASE}/CoreWebVitals/LCP`)
  assert.equal(lcp.markdownUrl, `${BASE}/CoreWebVitals/LCP.md`)
  assert.equal(lcp.sourceUrl, 'https://github.com/nucliweb/webperf-snippets/blob/main/snippets/CoreWebVitals/LCP.js')
  assert.equal(lcp.code, readFileSync(join(ROOT, 'snippets', 'CoreWebVitals', 'LCP.js'), 'utf8'))
})

test('a snippet on a page with several names itself and its page in the title', () => {
  assert.equal(byId['TTFB-Sub-Parts'].title, 'TTFB Sub Parts (Time to first byte)')
  assert.equal(byId['TTFB-Sub-Parts'].url, `${BASE}/Loading/TTFB`)
})

test('a snippet gets the Copy prompt of its page, with the related snippets', () => {
  assert.match(byId.LCP.prompt, /--snippet LCP --json/)
  assert.match(byId.LCP.prompt, /## Related snippets/)
  assert.match(byId.LCP.prompt, /Documentation: https:\/\/webperf-snippets\.net\/CoreWebVitals\/LCP\n/)
})

test('a snippet the CLI cannot run has no prompt', () => {
  assert.equal(byId['Long-Animation-Frames-Helpers'].prompt, null)
  assert.equal(byId['Network-Bandwidth-Connection-Quality'].prompt, null)
})
