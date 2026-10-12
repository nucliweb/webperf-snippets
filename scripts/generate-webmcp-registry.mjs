#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegistry } from '../lib/webmcp-registry.mjs'

// Writes the registry of the WebMCP tools to public/webmcp/snippets.json before the build; the file
// is not committed (see .gitignore)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(ROOT, 'public', 'webmcp', 'snippets.json')
const registry = buildRegistry(ROOT)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(registry))
console.log(`Generated the WebMCP registry (${registry.length} snippets)`)
