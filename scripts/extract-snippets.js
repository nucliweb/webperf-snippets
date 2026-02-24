#!/usr/bin/env node
// Extracts JS snippets from ### Snippet sections in MDX files into separate .js files
// and updates the MDX files to use import + <Snippet> component.

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'pages')
const SNIPPETS_DIR = path.join(ROOT, 'snippets')

const SNIPPET_HEADING_RE = /^### Snippet$/m

function getMdxFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getMdxFiles(path.join(dir, entry.name)))
    } else if (entry.name.endsWith('.mdx')) {
      files.push(path.join(dir, entry.name))
    }
  }
  return files
}

// Finds the position of the next "### Snippet" heading from fromPos.
function findNextSnippetHeading(content, fromPos) {
  SNIPPET_HEADING_RE.lastIndex = 0
  const slice = content.slice(fromPos)
  const match = SNIPPET_HEADING_RE.exec(slice)
  return match ? fromPos + match.index : -1
}

const STOP_WORDS = new Set([
  'measure', 'check', 'analyze', 'analyse', 'detect', 'find', 'get', 'fetch',
  'track', 'monitor', 'for', 'all', 'the', 'a', 'an', 'to', 'of', 'and', 'or',
  'with', 'in', 'by', 'via', 'its',
])

// Returns the nearest H2 heading text before pos, or null.
function findPrecedingH2(content, pos) {
  const before = content.slice(0, pos)
  const matches = [...before.matchAll(/^## (.+)$/gm)]
  if (matches.length === 0) return null
  return matches[matches.length - 1][1].trim()
}

// Converts an H2 title into a kebab-case semantic slug, removing stop words
// and the given basename. E.g. "Measure TTFB sub-parts" + "TTFB" → "Sub-Parts"
function h2ToSlug(title, basename) {
  const baseWords = basename.toLowerCase().replace(/[-_]/g, ' ').split(' ')
  return title
    .replace(/[^\w\s-]/g, '')
    .split(/[\s-]+/)
    .filter((w) => {
      const lw = w.toLowerCase()
      return w.length > 1 && !STOP_WORDS.has(lw) && !baseWords.includes(lw)
    })
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('-')
}

// Returns all code blocks that appear directly under a Snippet heading.
// Each item: { code, blockStart, blockEnd, h2Title } — absolute positions in content.
function extractSnippetBlocks(content) {
  const results = []
  let searchPos = 0

  while (true) {
    const headingPos = findNextSnippetHeading(content, searchPos)
    if (headingPos === -1) break

    // Find the end of the heading line
    const headingEnd = content.indexOf('\n', headingPos)

    // Bound: find the next Snippet heading to limit our search
    const nextHeadingPos = findNextSnippetHeading(content, headingEnd + 1)
    const boundPos = nextHeadingPos === -1 ? content.length : nextHeadingPos

    const section = content.slice(headingEnd, boundPos)
    const relBlockStart = section.indexOf('```js copy\n')

    if (relBlockStart !== -1) {
      const relCodeStart = relBlockStart + 11 // length of "```js copy\n"
      const relCodeEnd = section.indexOf('\n```', relCodeStart)

      if (relCodeEnd !== -1) {
        results.push({
          code: section.slice(relCodeStart, relCodeEnd),
          blockStart: headingEnd + relBlockStart,
          blockEnd: headingEnd + relCodeEnd + 4, // past \n```
          h2Title: findPrecedingH2(content, headingPos),
        })
      }
    }

    searchPos = boundPos
  }

  return results
}

function varName(index) {
  return index === 0 ? 'snippet' : `snippet${index + 1}`
}

function snippetFileName(basename, index, h2Title) {
  if (index === 0) return `${basename}.js`
  const slug = h2Title ? h2ToSlug(h2Title, basename) : ''
  return slug ? `${basename}-${slug}.js` : `${basename}-${index + 1}.js`
}

function processFile(mdxFilePath) {
  const content = fs.readFileSync(mdxFilePath, 'utf-8')
  const relativePath = path.relative(PAGES_DIR, mdxFilePath)
  const category = path.dirname(relativePath) // e.g. 'CoreWebVitals', or '.' for index
  const basename = path.basename(relativePath, '.mdx')

  const blocks = extractSnippetBlocks(content)
  if (blocks.length === 0) return

  // Create snippets directory for this category
  const snippetDir = path.join(SNIPPETS_DIR, category === '.' ? '' : category)
  fs.mkdirSync(snippetDir, { recursive: true })

  // Write snippet .js files
  const snippetMeta = blocks.map((block, i) => {
    const fileName = snippetFileName(basename, i, block.h2Title)
    fs.writeFileSync(path.join(snippetDir, fileName), block.code + '\n')
    const catPrefix = category === '.' ? '' : category + '/'
    console.log(`  created: snippets/${catPrefix}${fileName}`)
    return { varName: varName(i), fileName, catPrefix }
  })

  // Build the updated MDX content — replace blocks from last to first (preserves positions)
  let updated = content
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { blockStart, blockEnd } = blocks[i]
    const replacement = `<Snippet code={${snippetMeta[i].varName}} />`
    updated = updated.slice(0, blockStart) + replacement + updated.slice(blockEnd)
  }

  // Build import statements
  const depth = category === '.' ? 1 : 2
  const prefix = '../'.repeat(depth)

  const snippetImports = snippetMeta
    .map(({ varName: v, fileName, catPrefix }) =>
      `import ${v} from '${prefix}snippets/${catPrefix}${fileName}?raw'`
    )
    .join('\n')

  const componentImport = `import { Snippet } from '${prefix}components/Snippet'`
  const imports = snippetImports + '\n' + componentImport + '\n'

  updated = imports + '\n' + updated

  fs.writeFileSync(mdxFilePath, updated)
  console.log(`  updated: pages/${relativePath}`)
}

const mdxFiles = getMdxFiles(PAGES_DIR)
console.log(`Processing ${mdxFiles.length} MDX files...\n`)
for (const file of mdxFiles) {
  processFile(file)
}
console.log('\nDone.')
