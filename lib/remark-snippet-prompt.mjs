import { readFileSync } from 'node:fs'
import { dirname, resolve, relative, sep } from 'node:path'
import { buildPrompt, cliVersion, relatedSnippets } from './snippet-prompt.mjs'

// Remark plugin: gives each <Snippet code={x} /> of a page the agent prompt of its snippet.
//
// A page imports its snippets as raw text:
//
//   import snippet from '../../snippets/Loading/TTFB.js?raw'
//   <Snippet code={snippet} />
//
// The plugin reads those imports, builds the prompt of each snippet at build time and adds it as a
// `prompt` attribute, so the pages need no change. A snippet with no prompt (see snippet-prompt.mjs)
// gets no attribute.

const IMPORT = /import\s+(\w+)\s+from\s+['"]([^'"]*\/snippets\/[^'"]+\.js)\?raw['"]/g
const VERSION = cliVersion()

// "/Loading/TTFB" for content/Loading/TTFB.mdx
function docsPathOf(filePath) {
  const marker = `${sep}content${sep}`
  const rest = filePath.slice(filePath.lastIndexOf(marker) + marker.length)
  return '/' + rest.replace(/\.mdx$/, '').split(sep).join('/')
}

export default function remarkSnippetPrompt() {
  return (tree, file) => {
    if (!file.path) return
    const pageDir = dirname(file.path)

    // Import name to snippet ("Loading/TTFB") and its source
    const imports = new Map()
    for (const node of tree.children) {
      if (node.type !== 'mdxjsEsm') continue
      for (const [, name, specifier] of node.value.matchAll(IMPORT)) {
        const absolute = resolve(pageDir, specifier)
        const path = relative(resolve(absolute, '..', '..'), absolute).split(sep).join('/').replace(/\.js$/, '')
        imports.set(name, { path, source: readFileSync(absolute, 'utf8') })
      }
    }
    if (imports.size === 0) return

    const docsPath = docsPathOf(file.path)
    const related = relatedSnippets(String(file.value), docsPath)
    const visit = (node) => {
      if (node.type === 'mdxJsxFlowElement' && node.name === 'Snippet') {
        const code = node.attributes.find((a) => a.name === 'code')
        const snippet = imports.get(code?.value?.value)
        const prompt = snippet && buildPrompt({ ...snippet, docsPath, cliVersion: VERSION, related })
        if (prompt) node.attributes.push({ type: 'mdxJsxAttribute', name: 'prompt', value: prompt })
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}
