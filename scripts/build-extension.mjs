#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegistry } from '../lib/webmcp-registry.mjs'
import { isTrackingSnippet } from '../cli/src/tracking.js'

// Writes extension/snippets.json, the snippets the extension runs. The Chrome Web Store does not allow
// an extension to run code it did not ship with, so the snippets go in the package and a new version
// of a snippet needs a new build of the extension. The file is not committed (see .gitignore).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const snippets = buildRegistry(ROOT).map(({ id, path, category, title, description, url, code }) => ({
  id,
  path,
  category,
  title,
  description,
  url,
  code,
  tracking: isTrackingSnippet(path, code),
}))
writeFileSync(join(ROOT, 'extension', 'snippets.json'), JSON.stringify(snippets))
console.log(`Built extension/snippets.json (${snippets.length} snippets). Load the extension folder unpacked in chrome://extensions.`)
