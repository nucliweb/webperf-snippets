#!/usr/bin/env node

// After `next build`, every page that imports a snippet as raw text must show that exact code.
// A loader that parses and prints the module rewrites the code and nothing else notices it.

const fs = require('fs')
const path = require('path')
const { findPrerenderedDir } = require('./prerendered-dir')

const ROOT = path.join(__dirname, '..')
const CONTENT_DIR = path.join(ROOT, 'content')

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&#x2F;': '/' }

function pageText(html) {
  const withoutTags = html.replace(/<[^>]+>/g, '')
  return withoutTags.replace(/&(?:amp|lt|gt|quot|#x27|#39|#x2F);/g, (entity) => ENTITIES[entity])
}

function snippetIsIntact(source, html) {
  return pageText(html).includes(source.trimEnd())
}

function snippetImports(mdx) {
  const imports = []
  for (const match of mdx.matchAll(/from\s+['"](?:\.\.\/)+(snippets\/[^'"]+\.js)\?raw['"]/g)) {
    imports.push(match[1])
  }
  return imports
}

function mdxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return mdxFiles(full)
    return entry.name.endsWith('.mdx') ? [full] : []
  })
}

function builtPagePath(builtDir, mdxPath) {
  const route = path.relative(CONTENT_DIR, mdxPath).replace(/\.mdx$/, '')
  const page = route === 'index' ? 'index' : route.replace(/\/index$/, '')
  return path.join(builtDir, `${page}.html`)
}

function main() {
  let builtDir
  try {
    builtDir = findPrerenderedDir(path.join(ROOT, '.next'))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const errors = []
  let checked = 0
  for (const file of mdxFiles(CONTENT_DIR)) {
    const imports = snippetImports(fs.readFileSync(file, 'utf8'))
    if (imports.length === 0) continue
    const built = builtPagePath(builtDir, file)
    if (!fs.existsSync(built)) {
      errors.push(`${path.relative(ROOT, file)} has no built page at ${path.relative(ROOT, built)}`)
      continue
    }
    const html = fs.readFileSync(built, 'utf8')
    for (const snippet of imports) {
      checked++
      if (!snippetIsIntact(fs.readFileSync(path.join(ROOT, snippet), 'utf8'), html)) {
        errors.push(`${path.relative(CONTENT_DIR, file)} does not show ${snippet} as it is in the source`)
      }
    }
  }
  if (errors.length > 0) {
    console.error('Built snippets check failed:\n')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exit(1)
  }
  console.log(`Built snippets check passed (${checked} snippets).`)
}

if (require.main === module) main()

module.exports = { snippetIsIntact, snippetImports }
