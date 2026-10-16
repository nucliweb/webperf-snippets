#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { readMeta } = require('./read-meta')
const { extractTitle, extractDescription } = require('../lib/page-info')
const { site } = require('../lib/site.js')

const ROOT = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'content')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')
const PUBLIC_DIR = path.join(ROOT, 'public')
const BASE_URL = 'https://webperf-snippets.net'
const { version: VERSION } = require('../package.json')

const CATEGORIES = ['CoreWebVitals', 'Loading', 'Interaction', 'Media', 'Resources', 'DevTools-Overrides']

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
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

// The pages at the root of content/ marked `type: guide`, such as the CLI and Which snippet
function buildGuideEntries() {
  return fs.readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .sort()
    .map((f) => ({ slug: path.basename(f, '.mdx'), content: readFile(path.join(PAGES_DIR, f)) }))
    .filter(({ content }) => /^---\n[\s\S]*?^type:\s*guide\s*$[\s\S]*?^---/m.test(content))
    .map(({ slug, content }) => ({ title: extractTitle(content) || slug, url: `${BASE_URL}/${slug}` }))
}

// Each link points to the Markdown version of the page (scripts/generate-page-markdown.mjs)
function generateLlmsTxt(entries, guides = []) {
  const lines = [
    '# WebPerf Snippets',
    '',
    `> ${site.description}`,
    `> Source: ${BASE_URL}`,
    `> Version: ${VERSION}`,
    `> Each link points to the Markdown version of a page; the HTML page is at the same URL without .md.`,
    '',
    '---',
    '',
  ]

  if (guides.length > 0) {
    lines.push('## Guides', '')
    for (const guide of guides) lines.push(`- [${guide.title}](${guide.url}.md)`)
    lines.push('')
  }

  let currentCategory = null

  for (const entry of entries) {
    if (entry.categoryTitle !== currentCategory) {
      currentCategory = entry.categoryTitle
      lines.push(`## ${currentCategory}`, '')
    }

    lines.push(`- [${entry.title}](${entry.url}.md)`)
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
    site.description,
    `Source: ${BASE_URL}`,
    `Version: ${VERSION}`,
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
  const llmsTxt = generateLlmsTxt(entries, buildGuideEntries())
  const llmsFullTxt = generateLlmsFullTxt(entries)

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt, 'utf8')
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt, 'utf8')

  console.log(`Generated llms.txt and llms-full.txt (${entries.length} snippets)`)
}

if (require.main === module) main()

module.exports = { buildSnippetEntries, buildGuideEntries, generateLlmsTxt, generateLlmsFullTxt }
