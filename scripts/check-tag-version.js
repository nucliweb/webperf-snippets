#!/usr/bin/env node

// Checks that a release tag matches the version of the part it publishes, before the workflow
// publishes anything. The three parts have independent versions:
//   v*           the collection and the skills  package.json
//   cli-v*       the CLI on npm                 cli/package.json
//   extension-v* the DevTools extension         extension/manifest.json
//
// Run: node scripts/check-tag-version.js <tag> [root]

const fs = require('node:fs')
const path = require('node:path')

const PARTS = [
  { prefix: 'cli-v', file: 'cli/package.json' },
  { prefix: 'extension-v', file: 'extension/manifest.json' },
  { prefix: 'v', file: 'package.json' },
]

function checkTag(tag, root = path.join(__dirname, '..')) {
  const part = PARTS.find(({ prefix }) => tag.startsWith(prefix))
  if (!part) return { ok: false, message: `${tag} is not a release tag (v*, cli-v* or extension-v*)` }

  const version = JSON.parse(fs.readFileSync(path.join(root, part.file), 'utf8')).version
  if (tag.slice(part.prefix.length) === version) return { ok: true, file: part.file, version }
  return { ok: false, message: `The tag ${tag} does not match the version ${version} of ${part.file}` }
}

function main([tag, root] = process.argv.slice(2)) {
  if (!tag) {
    console.log('::error::Usage: node scripts/check-tag-version.js <tag> [root]')
    return 1
  }
  const result = checkTag(tag, root)
  if (!result.ok) {
    console.log(`::error::${result.message}`)
    return 1
  }
  console.log(`${tag} matches the version ${result.version} of ${result.file}`)
  return 0
}

if (require.main === module) process.exitCode = main()

module.exports = { checkTag }
