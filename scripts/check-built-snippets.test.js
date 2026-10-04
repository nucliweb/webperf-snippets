const test = require('node:test')
const assert = require('node:assert/strict')
const { snippetIsIntact, snippetImports } = require('./check-built-snippets')

const SOURCE = '// Measure TTFB\n\n(() => {\n  const a = "x" && 1;\n  return { script: "TTFB", status: "ok" };\n})();\n'

// The page shows the code highlighted: tags around the tokens and escaped characters
const page = (code) => `<html><body><pre><code class="hljs">${code}</code></pre></body></html>`

test('finds the source in the highlighted code of a page', () => {
  const highlighted =
    '<span class="hljs-comment">// Measure TTFB</span>\n\n(() =&gt; {\n  <span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;x&quot;</span> &amp;&amp; <span class="hljs-number">1</span>;\n  <span class="hljs-keyword">return</span> { script: <span class="hljs-string">&quot;TTFB&quot;</span>, status: <span class="hljs-string">&quot;ok&quot;</span> };\n})();\n'
  assert.equal(snippetIsIntact(SOURCE, page(highlighted)), true)
})

test('rejects code that a loader reformatted', () => {
  const reformatted = '// Measure TTFB\n(()=&gt;{\n    const a = &quot;x&quot; &amp;&amp; 1;\n    return { script: &quot;TTFB&quot;, status: &quot;ok&quot; };\n})();\n'
  assert.equal(snippetIsIntact(SOURCE, page(reformatted)), false)
})

test('rejects a page without the code', () => {
  assert.equal(snippetIsIntact(SOURCE, page('nothing')), false)
})

test('lists the snippets a page imports as raw text', () => {
  const mdx = [
    "import snippet from '../../snippets/Loading/TTFB.js?raw'",
    "import snippet2 from '../../snippets/Loading/TTFB-Sub-Parts.js?raw'",
    "import { Snippet } from '../../components/Snippet'",
  ].join('\n')
  assert.deepEqual(snippetImports(mdx), ['snippets/Loading/TTFB.js', 'snippets/Loading/TTFB-Sub-Parts.js'])
})
