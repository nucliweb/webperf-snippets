#!/usr/bin/env node

// Fails when the website would show a system emoji instead of an icon.
//
// Pages (.mdx): emojis inside code fences are console output and stay. Emojis in
// lib/icons.js become icons while the page renders. The multi-line props of the
// diagram components are cleaned by the diagrams themselves. Any other emoji in
// prose or tables has to be mapped or removed; KNOWN_UNMAPPED lists the ones
// still waiting to be removed, and it can only shrink.
//
// Components (.jsx): an emoji can only appear where it is passed to <Icon>, in
// a constant named after emoji or icon, or in a file that draws a text glyph on
// purpose (GLYPH_FILES).

const fs = require('fs')
const path = require('path')
const { ICONS } = require('../lib/icons')

const ROOT = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'pages')

const KNOWN_UNMAPPED = new Set([
  '🎨', '⚡', '🔧', '⚙️', '⏱️', '👆', '🖱️', '📦', '🔍', '⏳', '📄',
  '🚫', '📖', '📋', '⭐', '🖼️', '🔗', '👁️', '👈', '❓',
])
const NOT_EMOJI = new Set(['©', '®', '™', '↗'])
const COMPONENTS_DIR = path.join(ROOT, 'components')
// Files that write emojis or glyphs on purpose: the SVG text of the LCP diagram, and the
// Markdown that "Copy as Markdown" puts on the clipboard (it is pasted into issues, not shown).
const GLYPH_FILES = new Set([
  'components/diagrams/LcpSubparts.jsx',
  'components/SnippetVisualizer/exportMarkdown.js',
])

function listFiles(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(full, extensions)
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : []
  })
}

// Emojis of a page that render as text: outside code fences and outside the
// multi-line props of diagram components (`<Flow` ... `/>`), which the diagram
// components handle themselves.
function proseEmojis(source) {
  const found = []
  let inFence = false
  let inProps = false
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      return
    }
    if (inFence) return
    if (inProps) {
      if (trimmed === '/>') inProps = false
      return
    }
    if (/^<[A-Z]\w*$/.test(trimmed)) {
      inProps = true
      return
    }
    for (const match of line.matchAll(/\p{Extended_Pictographic}️?/gu)) {
      found.push({ emoji: match[0], line: index + 1 })
    }
  })
  return found
}

// Emojis of a component that would reach the page as text instead of an icon.
function componentEmojis(source) {
  const found = []
  source.split('\n').forEach((line, index) => {
    if (/emoji|icon/i.test(line)) return
    for (const match of line.matchAll(/[\p{Extended_Pictographic}\u2713\u2717]\uFE0F?/gu)) {
      found.push({ emoji: match[0], line: index + 1 })
    }
  })
  return found
}

function findProblems() {
  const problems = []
  for (const file of listFiles(COMPONENTS_DIR, ['.jsx', '.js'])) {
    const rel = path.relative(ROOT, file)
    if (GLYPH_FILES.has(rel)) continue
    for (const { emoji, line } of componentEmojis(fs.readFileSync(file, 'utf8'))) {
      if (NOT_EMOJI.has(emoji)) continue
      problems.push(`${rel}:${line} draws ${emoji} as text; use <Icon emoji="${emoji}" /> or remove it`)
    }
  }
  for (const file of listFiles(PAGES_DIR, ['.mdx'])) {
    const rel = path.relative(ROOT, file)
    for (const { emoji, line } of proseEmojis(fs.readFileSync(file, 'utf8'))) {
      if (NOT_EMOJI.has(emoji) || ICONS[emoji] || KNOWN_UNMAPPED.has(emoji)) continue
      problems.push(`${rel}:${line} uses ${emoji}, which has no icon in lib/icons.js`)
    }
  }
  return problems
}

if (require.main === module) {
  const problems = findProblems()
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('Emoji check passed.')
}

module.exports = { proseEmojis, componentEmojis, findProblems }
