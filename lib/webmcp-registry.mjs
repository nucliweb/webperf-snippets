import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createRequire } from 'node:module'
import { BASE_URL, markdownPath } from './markdown-path.mjs'
import { buildPrompt, cliVersion, relatedSnippets } from './snippet-prompt.mjs'

const require = createRequire(import.meta.url)
const { readPageInfo } = require('./page-info')

// The registry of the WebMCP tools (lib/webmcp.js): every snippet with the title, description and URLs
// of the page that shows it, its code and its Copy prompt. scripts/generate-webmcp-registry.mjs writes
// it to public/ before the build, from the same sources as the pages, so it lists every snippet.

const REPOSITORY = 'https://github.com/nucliweb/webperf-snippets'

const pagesOf = (content, dir = content) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? pagesOf(content, join(dir, d.name)) : d.name.endsWith('.mdx') ? [relative(content, join(dir, d.name)).slice(0, -4).split(sep).join('/')] : []
  )

export function buildRegistry(root) {
  const content = join(root, 'content')
  const version = cliVersion()
  const registry = []

  for (const page of pagesOf(content)) {
    const info = readPageInfo(content, page)
    if (info.snippets.length === 0) continue
    const mdx = readFileSync(join(content, `${page}.mdx`), 'utf8')
    const docsPath = `/${page}`
    const related = relatedSnippets(mdx, docsPath)

    for (const path of info.snippets) {
      const [category, id] = path.split('/')
      const code = readFileSync(join(root, 'snippets', `${path}.js`), 'utf8')
      registry.push({
        id,
        path,
        category,
        // A page with several snippets gives each one its own name before the title of the page
        title: info.snippets.length === 1 ? info.title : `${id.replace(/-/g, ' ')} (${info.title})`,
        description: info.description,
        url: `${BASE_URL}${docsPath}`,
        markdownUrl: `${BASE_URL}${markdownPath(page)}`,
        sourceUrl: `${REPOSITORY}/blob/main/snippets/${path}.js`,
        code,
        prompt: buildPrompt({ path, source: code, docsPath, cliVersion: version, related }),
      })
    }
  }

  return registry.sort((a, b) => a.path.localeCompare(b.path))
}
