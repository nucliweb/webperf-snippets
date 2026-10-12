const fs = require('fs')
const path = require('path')

// What the site says about a page, read from its MDX: the title, a description for search and for
// llms.txt, and the snippets it shows. Used by scripts/generate-llms.js and by the page route.

function extractTitle(mdx) {
  const match = mdx.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

// Lines that are not prose: a heading, a table, a quote, a component, an import or a code fence
const NOT_PROSE = /^(#|\||>|<|import |export |```|---)/

// The first paragraph of text after the H1, as plain text on one line
function extractDescription(mdx) {
  const lines = mdx.split('\n')
  const h1 = lines.findIndex((line) => /^#\s/.test(line))
  const paragraph = []
  let inFence = false
  let inComponent = false

  for (const line of lines.slice(h1 + 1)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) inFence = !inFence
    if (inFence || trimmed.startsWith('```')) continue
    // A component that spans several lines ends at the line that closes it
    if (inComponent) {
      if (/\/>$|<\/[A-Z][\w.]*>$/.test(trimmed)) inComponent = false
      continue
    }
    if (paragraph.length > 0 && trimmed === '') break
    if (trimmed === '') continue
    if (/^<[A-Z]/.test(trimmed) && !/\/>$|<\/[A-Z][\w.]*>$/.test(trimmed)) {
      inComponent = true
      continue
    }
    if (NOT_PROSE.test(trimmed)) {
      if (paragraph.length > 0) break
      continue
    }
    paragraph.push(trimmed)
  }

  return paragraph
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

// The snippets a page imports, as "Category/Name"
function snippetPaths(mdx) {
  return [...mdx.matchAll(/from\s+['"](?:\.\.\/)+snippets\/([^'"?]+)\.js\?raw['"]/g)].map(([, p]) => p)
}

function readPageInfo(contentDir, page) {
  const mdx = fs.readFileSync(path.join(contentDir, `${page}.mdx`), 'utf8')
  return { title: extractTitle(mdx), description: extractDescription(mdx), snippets: snippetPaths(mdx) }
}

module.exports = { extractTitle, extractDescription, snippetPaths, readPageInfo }
