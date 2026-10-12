import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { VFile } from 'vfile'
import matter from 'gray-matter'

const require = createRequire(import.meta.url)
const remarkBrowserSupport = require('./remark-browser-support')

// The Markdown version of a page of the site, for agents and generative search: the whole text of the
// page, the snippets as code blocks, the browser support table the site generates, and each component
// as its text description. Pages are served at their path with `.md`, such as /CoreWebVitals/LCP.md.

export const BASE_URL = 'https://webperf-snippets.nucliweb.net'

// "CoreWebVitals/LCP" gives "/CoreWebVitals/LCP.md"
export const markdownPath = (page) => `/${page}.md`

// The URL of the HTML page: "index" is the home, and "Category/index" the page of the category
const htmlUrl = (page) => `${BASE_URL}/${page.replace(/(^|\/)index$/, '')}`

const IMPORT = /import\s+(\w+)\s+from\s+['"]([^'"]*\/snippets\/[^'"]+\.js)\?raw['"]/g
const NOTE = { info: 'Note:', warning: 'Warning:' }

const text = (value) => ({ type: 'text', value })
const paragraph = (children) => ({ type: 'paragraph', children })
const attribute = (node, name) => {
  const value = node.attributes.find((a) => a.name === name)?.value
  return typeof value === 'string' ? value : value?.value
}
const isPhrasing = (node) => ['text', 'emphasis', 'strong', 'inlineCode', 'link', 'break', 'image', 'mdxJsxTextElement'].includes(node.type)

// Turns the MDX tree into plain Markdown, in place
function plainMarkdown({ root, filePath }) {
  return (tree) => {
    const snippets = new Map()
    for (const node of tree.children) {
      if (node.type !== 'mdxjsEsm') continue
      for (const [, name, specifier] of node.value.matchAll(IMPORT)) {
        snippets.set(name, readFileSync(resolve(dirname(filePath), specifier), 'utf8').trim())
      }
    }

    // Links to another page go to its Markdown version; the other links of the site become absolute
    const absolute = (url) => {
      if (!url.startsWith('/')) return url
      const [path, hash = ''] = url.split(/(?=#)/)
      const page = path.replace(/^\/|\/$/g, '')
      const isPage = !extname(path) && page && existsSync(join(root, 'content', `${page}.mdx`))
      return isPage ? `${BASE_URL}${markdownPath(page)}${hash}` : `${BASE_URL}${url}`
    }

    const component = (node) => {
      if (node.name === 'Snippet') {
        const code = snippets.get(node.attributes.find((a) => a.name === 'code')?.value?.value)
        return code ? [{ type: 'code', lang: 'js', value: code }] : []
      }
      if (node.name === 'Callout') {
        const children = transform(node.children)
        const blocks = children.every(isPhrasing) ? [paragraph(children)] : children
        const label = NOTE[attribute(node, 'type')]
        if (label && blocks[0]?.type === 'paragraph') {
          blocks[0].children.unshift({ type: 'strong', children: [text(label)] }, text(' '))
        }
        return [{ type: 'blockquote', children: blocks }]
      }
      if (node.name === 'Demo') {
        const caption = attribute(node, 'caption')
        const link = { type: 'link', url: absolute(attribute(node, 'src')), children: [text(attribute(node, 'title'))] }
        return [paragraph([text('Interactive demo: '), link, text(caption ? `. ${caption}` : '.')])]
      }
      // A diagram describes itself in its title; a component with no text, such as a video, is dropped
      const title = attribute(node, 'title')
      if (/^[A-Z]/.test(node.name ?? '') && title) return [paragraph([text(`Diagram: ${title}`)])]
      // The browser support badge repeats the table; other HTML elements keep their content
      if (attribute(node, 'className')?.includes('wp-support')) return []
      if (/^[a-z]/.test(node.name ?? '')) return transform(node.children)
      return []
    }

    function transform(nodes) {
      return nodes.flatMap((node) => {
        if (node.type === 'mdxjsEsm' || node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') return []
        if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') return component(node)
        if ((node.type === 'link' || node.type === 'image') && node.url) node.url = absolute(node.url)
        if (node.children) node.children = transform(node.children)
        return [node]
      })
    }

    tree.children = transform(tree.children)
  }
}

export async function pageToMarkdown(filePath, { root }) {
  const page = relative(join(root, 'content'), filePath).replace(/\.mdx$/, '').split(sep).join('/')
  // The browser support plugin reads the frontmatter from the file; the tree starts after it
  const file = new VFile({ path: filePath, value: matter(readFileSync(filePath, 'utf8')).content })
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(remarkBrowserSupport)
    .use(plainMarkdown, { root, filePath })
  const tree = await processor.run(processor.parse(file), file)

  const h1 = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 1)
  const source = { type: 'link', url: htmlUrl(page), children: [text(htmlUrl(page))] }
  tree.children.splice(h1 + 1, 0, { type: 'blockquote', children: [paragraph([text('Source: '), source])] })

  // Stringified without MDX, so text such as { or < is not escaped for JSX
  return unified().use(remarkGfm).use(remarkStringify, { bullet: '-', fences: true, rule: '-' }).stringify(tree)
}
