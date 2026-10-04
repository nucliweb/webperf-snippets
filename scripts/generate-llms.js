#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { readMeta } = require('./read-meta')

const ROOT = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'content')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')
const PUBLIC_DIR = path.join(ROOT, 'public')
const BASE_URL = 'https://webperf-snippets.nucliweb.net'

const CATEGORIES = ['CoreWebVitals', 'Loading', 'Interaction', 'Media', 'Resources', 'DevTools-Overrides']

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

function extractDescription(content) {
  const lines = content.split('\n')
  let pastImports = false
  let pastTitle = false
  const descLines = []

  for (const line of lines) {
    if (line.startsWith('import ')) { pastImports = true; continue }
    if (!pastImports) continue
    if (line.trim() === '') continue
    if (line.startsWith('#')) { pastTitle = true; continue }
    if (!pastTitle) continue

    // Stop at next heading, table, blockquote, or JSX
    if (line.startsWith('#') || line.startsWith('|') || line.startsWith('>') || line.startsWith('<')) break

    descLines.push(line)
    // One paragraph is enough
    if (descLines.length > 0 && line.trim() === '') break
  }

  return descLines
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // strip bold
    .trim()
}

function extractSnippetImports(content) {
  const matches = [...content.matchAll(/import\s+\w+\s+from\s+['"]\.\.\/\.\.\/snippets\/([^/'"]+)\/([^'"?]+)/g)]
  return matches.map((m) => ({ category: m[1], file: m[2] }))
}

function getSnippetCode(category, file) {
  const filePath = path.join(SNIPPETS_DIR, category, file)
  if (!fs.existsSync(filePath)) return null
  return readFile(filePath)
}

function getMdxFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
    .sort()
}

function getCategoryTitle(category) {
  try {
    const meta = readMeta(PAGES_DIR)
    return meta[category]?.title || category
  } catch {
    return category
  }
}

function buildSnippetEntries() {
  const entries = []

  for (const category of CATEGORIES) {
    const categoryTitle = getCategoryTitle(category)
    const mdxFiles = getMdxFiles(path.join(PAGES_DIR, category))

    for (const mdxFile of mdxFiles) {
      const slug = path.basename(mdxFile, '.mdx')
      const content = readFile(path.join(PAGES_DIR, category, mdxFile))
      const title = extractTitle(content)
      const description = extractDescription(content)
      const snippetImports = extractSnippetImports(content)

      const snippets = snippetImports.map(({ category: cat, file }) => ({
        file,
        code: getSnippetCode(cat, file),
      })).filter((s) => s.code !== null)

      entries.push({
        category,
        categoryTitle,
        slug,
        title: title || slug,
        description,
        url: `${BASE_URL}/${category}/${slug}`,
        snippets,
      })
    }
  }

  return entries
}

function generateLlmsTxt(entries) {
  const lines = [
    '# WebPerf Snippets',
    '',
    `> A curated collection of JavaScript snippets for web performance measurement in browser consoles and Chrome DevTools.`,
    `> Source: ${BASE_URL}`,
    '',
    '---',
    '',
  ]

  let currentCategory = null

  for (const entry of entries) {
    if (entry.categoryTitle !== currentCategory) {
      currentCategory = entry.categoryTitle
      lines.push(`## ${currentCategory}`, '')
    }

    lines.push(`- [${entry.title}](${entry.url})`)
    if (entry.description) {
      lines.push(`  ${entry.description}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function generateLlmsFullTxt(entries) {
  const lines = [
    '# WebPerf Snippets — Full Reference',
    '',
    'A curated collection of JavaScript snippets for web performance measurement.',
    'Each snippet runs in the browser console or Chrome DevTools.',
    `Source: ${BASE_URL}`,
    '',
    '---',
    '',
  ]

  let currentCategory = null

  for (const entry of entries) {
    if (entry.categoryTitle !== currentCategory) {
      currentCategory = entry.categoryTitle
      lines.push(`# ${currentCategory}`, '')
    }

    lines.push(`## ${entry.title}`)
    lines.push(`URL: ${entry.url}`)
    if (entry.description) {
      lines.push(``, entry.description)
    }

    for (const snippet of entry.snippets) {
      lines.push('', '```js', snippet.code.trim(), '```')
    }

    lines.push('', '---', '')
  }

  return lines.join('\n')
}

function main() {
  const entries = buildSnippetEntries()
  const llmsTxt = generateLlmsTxt(entries)
  const llmsFullTxt = generateLlmsFullTxt(entries)

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt, 'utf8')
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt, 'utf8')

  console.log(`Generated llms.txt and llms-full.txt (${entries.length} snippets)`)
}

main()
