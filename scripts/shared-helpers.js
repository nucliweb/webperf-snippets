// Keeps the helpers that snippets copy in sync with their canonical source,
// snippets/_shared/helpers.js. See the header of that file for the marker syntax.

const fs = require('fs')
const path = require('path')

const SNIPPETS_DIR = path.join(__dirname, '..', 'snippets')
const CANONICAL_PATH = path.join(SNIPPETS_DIR, '_shared', 'helpers.js')

const START = /^\s*\/\/ @shared (\S+)\s*$/
const END = /^\s*\/\/ @end-shared (\S+)\s*$/
// A definition of a shared helper, in any declaration style
const PRIVATE_COPY = /\b(?:function|const|let|var)\s+(getRootDomain|isFirstParty|logOwnDomainsHint|formatBytes)\b/

function dedent(lines) {
  const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)[0].length)
  const strip = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(strip).replace(/\s+$/, '')).join('\n')
}

// Returns the marked blocks of a file, each dedented, plus the problems with the markers.
function extractBlocks(text) {
  const blocks = {}
  const problems = []
  const outside = []
  let open = null
  let body = []

  text.split('\n').forEach((line, index) => {
    const start = line.match(START)
    const end = line.match(END)
    if (start) {
      if (open) problems.push(`marker "${open.name}" is not closed before "${start[1]}" starts (line ${index + 1})`)
      open = { name: start[1], line: index + 1 }
      body = []
    } else if (end) {
      if (!open || open.name !== end[1]) {
        problems.push(`@end-shared ${end[1]} at line ${index + 1} has no matching @shared`)
      } else {
        blocks[open.name] = dedent(body)
        open = null
      }
    } else if (open) {
      body.push(line)
    } else {
      outside.push(line)
    }
  })
  if (open) problems.push(`marker "${open.name}" (line ${open.line}) is not closed`)

  return { blocks, problems, outside: outside.join('\n') }
}

function snippetFiles(snippetsDir) {
  return fs
    .readdirSync(snippetsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .flatMap((entry) =>
      fs
        .readdirSync(path.join(snippetsDir, entry.name))
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => `${entry.name}/${file}`)
    )
}

function verifySharedHelpers(errors, { snippetsDir = SNIPPETS_DIR } = {}) {
  const canonicalPath = path.join(snippetsDir, '_shared', 'helpers.js')
  const canonical = extractBlocks(fs.readFileSync(canonicalPath, 'utf8'))
  for (const problem of canonical.problems) errors.push(`snippets/_shared/helpers.js: ${problem}`)

  for (const file of snippetFiles(snippetsDir)) {
    const { blocks, problems, outside } = extractBlocks(fs.readFileSync(path.join(snippetsDir, file), 'utf8'))
    for (const problem of problems) errors.push(`${file}: ${problem}`)

    for (const [name, body] of Object.entries(blocks)) {
      if (!(name in canonical.blocks)) errors.push(`${file}: unknown shared helper "${name}"`)
      else if (body !== canonical.blocks[name]) {
        errors.push(`${file}: shared helper "${name}" differs from snippets/_shared/helpers.js`)
      }
    }

    const stray = outside.match(PRIVATE_COPY)
    if (stray) errors.push(`${file}: defines ${stray[1]} without the // @shared ${stray[1]} marker; use the shared block or rename the local helper`)
  }
}

module.exports = { extractBlocks, verifySharedHelpers, CANONICAL_PATH }
