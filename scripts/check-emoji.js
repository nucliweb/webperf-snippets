#!/usr/bin/env node

// Fails when a documentation page uses an emoji that has no icon mapping.
//
// Emojis inside code fences are console output and stay. Emojis in lib/icons.js
// become icons while the page renders. Any other emoji in prose or tables would
// show up as a system emoji on the site, so it has to be mapped or removed.
// KNOWN_UNMAPPED lists the ones still waiting to be removed; it can only shrink.

const fs = require('fs')
const path = require('path')
const { ICONS } = require('../lib/icons')

const ROOT = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'pages')

const KNOWN_UNMAPPED = new Set([
  '🎨', '⚡', '🔧', '⚙️', '⏱️', '👆', '🖱️', '📦', '🔍', '⏳', '📄',
  '🚫', '📖', '📋', '⭐', '🖼️', '🔗', '👁️', '👈', '❓',
])
const NOT_EMOJI = new Set(['©', '®', '™'])

function listMdx(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listMdx(full)
    return entry.name.endsWith('.mdx') ? [full] : []
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

function findProblems() {
  const problems = []
  for (const file of listMdx(PAGES_DIR)) {
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

module.exports = { proseEmojis, findProblems }
