const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

// When each page last changed, for the sitemap: the last commit of its MDX or of a snippet it shows,
// since the code of a snippet is part of its page. Read from git at build time.

// The output of `git log --format=%x00%cI --name-only`, newest commit first: the date of the first
// commit that names a file is the last time it changed
function parseGitLog(text) {
  const dates = new Map()
  for (const commit of text.split('\0').slice(1)) {
    const [date, ...files] = commit.split('\n')
    for (const file of files) {
      if (file && !dates.has(file)) dates.set(file, date.trim())
    }
  }
  return dates
}

// The MDX of a route: a page, or the index of a folder. `exists` takes a path from the repository root.
function pageFile(route, exists) {
  const base = route === '/' ? 'content/index' : `content${route}`
  for (const file of [`${base}.mdx`, `${base}/index.mdx`]) if (exists(file)) return file
  return null
}

// The newest date of the page and of its snippets ("Category/Name"), or undefined when git knows none
function pageLastModified(file, snippets, dates) {
  const known = [file, ...snippets.map((snippet) => `snippets/${snippet}.js`)].map((f) => dates.get(f)).filter(Boolean)
  if (known.length === 0) return undefined
  return known.reduce((newest, date) => (Date.parse(date) > Date.parse(newest) ? date : newest))
}

// The dates of the files of the pages and the snippets, or null when they would be wrong: a shallow
// clone, as the one Vercel builds from, knows only its last commits, and would date every page to them
function readGitDates(cwd) {
  try {
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
    if (git('rev-parse', '--is-shallow-repository').trim() !== 'false') return null
    return parseGitLog(git('log', '--format=%x00%cI', '--name-only', '--', 'content', 'snippets'))
  } catch {
    return null
  }
}

// What the sitemap asks for each route, with the dates of `cwd`; a function that knows nothing
// when git cannot date the pages
function lastModifiedOf(cwd, readSnippets) {
  const dates = readGitDates(cwd)
  if (!dates) return () => undefined
  const exists = (file) => fs.existsSync(path.join(cwd, file))
  return (route) => {
    const file = pageFile(route, exists)
    return file ? pageLastModified(file, readSnippets(path.join(cwd, file)), dates) : undefined
  }
}

module.exports = { parseGitLog, pageFile, pageLastModified, readGitDates, lastModifiedOf }
