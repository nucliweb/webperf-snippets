#!/usr/bin/env node

// Checks that a release tag matches the version of the part it publishes, before the workflow
// publishes anything. The three parts have independent versions:
//   v*           the collection and the skills  package.json
//   cli-v*       the CLI on npm                 cli/package.json
//   extension-v* the DevTools extension         extension/manifest.json
//
// The CLI carries its MCP server too: cli/server.json describes it for the MCP Registry, which the
// publish workflow updates after npm. Its version, the one of the npm package it lists and its name
// (the mcpName of cli/package.json, which the registry checks on npm) have to match as well.
//
// Run: node scripts/check-tag-version.js <tag> [root]

const fs = require('node:fs')
const path = require('node:path')

const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

function checkMcpServer(root, version) {
  const server = readJson(root, 'cli/server.json')
  if (server.version !== version) return `The version ${server.version} of cli/server.json does not match the version ${version} of cli/package.json`
  const pkg = (server.packages ?? []).findIndex((p) => p.version !== version)
  if (pkg !== -1) return `packages[${pkg}].version ${server.packages[pkg].version} of cli/server.json does not match the version ${version} of cli/package.json`
  const { mcpName } = readJson(root, 'cli/package.json')
  if (server.name !== mcpName) return `The name ${server.name} of cli/server.json is not the mcpName ${mcpName} of cli/package.json`
  return null
}

const PARTS = [
  { prefix: 'cli-v', file: 'cli/package.json', also: checkMcpServer },
  { prefix: 'extension-v', file: 'extension/manifest.json' },
  { prefix: 'v', file: 'package.json' },
]

function checkTag(tag, root = path.join(__dirname, '..')) {
  const part = PARTS.find(({ prefix }) => tag.startsWith(prefix))
  if (!part) return { ok: false, message: `${tag} is not a release tag (v*, cli-v* or extension-v*)` }

  const version = readJson(root, part.file).version
  if (tag.slice(part.prefix.length) !== version) return { ok: false, message: `The tag ${tag} does not match the version ${version} of ${part.file}` }
  const mismatch = part.also?.(root, version)
  if (mismatch) return { ok: false, message: mismatch }
  return { ok: true, file: part.file, version }
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
