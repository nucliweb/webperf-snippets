import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pageToMarkdown } from './page-markdown.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://webperf-snippets.net'

// Every page of the site, as "Category/Name" or "Name"
const pages = (dir = join(ROOT, 'content')) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? pages(join(dir, d.name)) : d.name.endsWith('.mdx') ? [relative(join(ROOT, 'content'), join(dir, d.name)).slice(0, -4)] : []
  )

const convert = (page, root = ROOT) => pageToMarkdown(join(root, 'content', `${page}.mdx`), { root })

// A site with one page that uses every component, and its snippet
function fixture(mdx) {
  const root = mkdtempSync(join(tmpdir(), 'page-markdown-'))
  mkdirSync(join(root, 'content', 'Loading'), { recursive: true })
  mkdirSync(join(root, 'snippets', 'Loading'), { recursive: true })
  writeFileSync(join(root, 'snippets', 'Loading', 'Example.js'), '(() => {\n  return { script: "Example" };\n})();\n')
  writeFileSync(join(root, 'content', 'Loading', 'Other.mdx'), '# Other\n')
  writeFileSync(join(root, 'content', 'Loading', 'Example.mdx'), mdx)
  return root
}

const EXAMPLE = `import snippet from '../../snippets/Loading/Example.js?raw'
import { Snippet } from '../../components/Snippet'
import { Callout } from '../../components/Callout'
import { Demo } from '../../components/Demo'
import { Flow, Sequence } from '../../components/diagrams'
import { SnippetVisualizer } from '../../components/SnippetVisualizer'

# Example

Measures something. See [Other](/Loading/Other#usage), the [demo page](/demos/x.html) and [web.dev](https://web.dev).

<Callout type="warning">
Chromium only.
</Callout>

<Callout type="info">Read it twice.</Callout>

### Snippet

<Snippet code={snippet} />

<Demo src="/demos/example.html" title="Timeline of the example" caption="Step through it." />

<Flow title="Decision tree for the example" nodes={[{ id: "A", label: "A" }]} edges={[]} />

<SnippetVisualizer />

| Rating | Time |
|--------|------|
| Good | ≤ 1s |
`

test('a page keeps its text and gets its snippet as a code block, with no import or JSX left', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, /^# Example\n/)
  assert.match(md, /Measures something\./)
  assert.match(md, /```js\n\(\(\) => \{\n {2}return \{ script: "Example" \};\n\}\)\(\);\n```/)
  assert.doesNotMatch(md, /^import /m)
  assert.doesNotMatch(md, /<[A-Z]/)
})

test('the page says where its HTML version is', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, new RegExp(`^# Example\\n\\n> Source: <${BASE}/Loading/Example>\\n`))
})

test('a callout becomes a quote that keeps its kind', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, /> \*\*Warning:\*\* Chromium only\./)
  assert.match(md, /> \*\*Note:\*\* Read it twice\./)
})

test('a demo and a diagram become their text description, and a component with none is dropped', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, new RegExp(`Interactive demo: \\[Timeline of the example\\]\\(${BASE}/demos/example\\.html\\)\\. Step through it\\.`))
  assert.match(md, /Diagram: Decision tree for the example/)
  assert.doesNotMatch(md, /SnippetVisualizer/)
})

test('links to other pages point to their Markdown version, and other links become absolute', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, new RegExp(`\\[Other\\]\\(${BASE}/Loading/Other\\.md#usage\\)`))
  assert.match(md, new RegExp(`\\[demo page\\]\\(${BASE}/demos/x\\.html\\)`))
  assert.match(md, /\[web\.dev\]\(https:\/\/web\.dev\)/)
})

test('tables stay as Markdown tables', async () => {
  const md = await convert('Loading/Example', fixture(EXAMPLE))
  assert.match(md, /\| Rating \| Time \|\n\| -+ \| -+ \|\n\| Good +\| ≤ 1s +\|/)
})

test('a real page gets the browser support table of the site and no badge', async () => {
  const md = await convert('CoreWebVitals/LCP')
  assert.match(md, /### Browser support\n\n\| Feature +\| Chrome/)
  assert.match(md, /Source: \[MDN browser compatibility data\]/)
  assert.doesNotMatch(md, /wp-support/)
  assert.match(md, new RegExp(`\\(${BASE}/CoreWebVitals/LCP-Subparts\\.md\\)`))
})

test('every page converts, with no JSX left and the exact code of each snippet it imports', async () => {
  for (const page of pages()) {
    const path = join(ROOT, 'content', `${page}.mdx`)
    const md = await convert(page)
    const prose = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
    assert.doesNotMatch(prose, /<[A-Z][A-Za-z]*[\s/>]/, page)
    assert.doesNotMatch(md, /^import /m, page)
    for (const [, file] of readFileSync(path, 'utf8').matchAll(/from '\.\.\/(?:\.\.\/)?snippets\/([^']+\.js)\?raw'/g)) {
      const code = readFileSync(join(ROOT, 'snippets', file), 'utf8').trim()
      assert.ok(md.includes(code), `${page}: ${file}`)
    }
  }
})
