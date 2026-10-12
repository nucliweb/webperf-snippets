#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegistry } from '../lib/webmcp-registry.mjs'
import { isTrackingSnippet } from '../cli/src/tracking.js'
import { snippetExpression } from '../lib/snippet-expression.mjs'

// Writes extension/snippets.json, the snippets the extension runs. The Chrome Web Store does not allow
// an extension to run code it did not ship with, so the snippets go in the package and a new version
// of a snippet needs a new build of the extension. The file is not committed (see .gitignore).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// The DevTools-Overrides scripts are pasted into Local Overrides so they run before the page, and
// return nothing; the CLI and the Copy prompt leave them out too
const snippets = buildRegistry(ROOT)
  .filter(({ category }) => category !== 'DevTools-Overrides')
  .map(({ id, path, category, title, description, url, code, prompt }) => ({
  id,
  path,
  category,
  title,
  description,
  url,
  // The snippet as one expression, which the panel runs inside its own (lib/snippet-expression.mjs)
  expression: snippetExpression(code),
  tracking: isTrackingSnippet(path, code),
  // The Copy prompt of the site, to run the snippet on the inspected page with the CLI from an agent
  prompt,
}))
writeFileSync(join(ROOT, 'extension', 'snippets.json'), JSON.stringify(snippets))
console.log(`Built extension/snippets.json (${snippets.length} snippets). Load the extension folder unpacked in chrome://extensions.`)
