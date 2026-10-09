import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import { VFile } from 'vfile'
import remarkSnippetPrompt from './remark-snippet-prompt.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Parses a real page and runs the plugin on it, as the MDX loader does
async function snippetsOf(page) {
  const path = join(ROOT, 'content', `${page}.mdx`)
  const file = new VFile({ path, value: readFileSync(path, 'utf8') })
  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkSnippetPrompt)
  const tree = await processor.run(processor.parse(file), file)
  const found = []
  const walk = (node) => {
    if (node.type === 'mdxJsxFlowElement' && node.name === 'Snippet') {
      const attr = (name) => node.attributes.find((a) => a.name === name)
      found.push({ code: attr('code')?.value?.value, prompt: attr('prompt')?.value })
    }
    node.children?.forEach(walk)
  }
  walk(tree)
  return found
}

test('each snippet of a page gets the prompt of its own source file', async () => {
  const snippets = await snippetsOf('Loading/TTFB')
  assert.equal(snippets.length, 3)
  assert.match(snippets[0].prompt, /--snippet TTFB --json/)
  assert.match(snippets[1].prompt, /--snippet TTFB-Sub-Parts --json/)
  assert.match(snippets[2].prompt, /--snippet TTFB-Resources --json/)
})

test('the prompt links the page it is on', async () => {
  const [, subParts] = await snippetsOf('Loading/TTFB')
  assert.match(subParts.prompt, /Documentation: https:\/\/webperf-snippets\.nucliweb\.net\/Loading\/TTFB\n/)
})

test('the code attribute stays as it was', async () => {
  const [first] = await snippetsOf('Loading/TTFB')
  assert.equal(first.code, 'snippet')
})

test('a tracking snippet gets the prompt with the interaction script', async () => {
  const [inp] = await snippetsOf('CoreWebVitals/INP')
  assert.match(inp.prompt, /--snippet INP --interact-script interactions\.json/)
})

test('an excluded snippet gets no prompt', async () => {
  for (const page of ['Interaction/Long-Animation-Frames-Helpers', 'Resources/Network-Bandwidth-Connection-Quality', 'DevTools-Overrides/Fetch-XHR-Timeline']) {
    for (const snippet of await snippetsOf(page)) {
      assert.equal(snippet.prompt, undefined, page)
    }
  }
})

test('every snippet page except the excluded ones has a prompt on each snippet', async () => {
  const { readdirSync } = await import('node:fs')
  const pages = readdirSync(join(ROOT, 'content'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(ROOT, 'content', d.name)).filter((f) => f.endsWith('.mdx')).map((f) => `${d.name}/${f.slice(0, -4)}`))
  const excluded = new Set(['Interaction/Long-Animation-Frames-Helpers', 'Resources/Network-Bandwidth-Connection-Quality', 'DevTools-Overrides/Fetch-XHR-Timeline'])
  let withPrompt = 0
  for (const page of pages) {
    for (const snippet of await snippetsOf(page)) {
      if (excluded.has(page)) continue
      assert.ok(snippet.prompt, `${page} has a snippet without a prompt`)
      withPrompt++
    }
  }
  assert.ok(withPrompt >= 50, `only ${withPrompt} snippets with a prompt`)
})

test('the prompt lists the snippets its page links', async () => {
  const [lcp] = await snippetsOf('CoreWebVitals/LCP')
  assert.match(lcp.prompt, /- LCP Subparts \(`CoreWebVitals\/LCP-Subparts`\)/)
  assert.match(lcp.prompt, /- LCP Trail \(`CoreWebVitals\/LCP-Trail`\): Visualize all LCP candidates during page load/)
  assert.match(lcp.prompt, /- FCP \(`Loading\/FCP`\)/)
  assert.doesNotMatch(lcp.prompt, /Image-Element-Audit/)
})

test('a page that links no snippet gives a prompt without related snippets', async () => {
  const [bfcache] = await snippetsOf('Loading/Back-Forward-Cache')
  assert.doesNotMatch(bfcache.prompt, /Related snippets/)
})

