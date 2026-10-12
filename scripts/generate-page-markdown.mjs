#!/usr/bin/env node
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { markdownPath, pageToMarkdown } from '../lib/page-markdown.mjs'

// Writes the Markdown version of every page to public/, so /CoreWebVitals/LCP.md is served next to
// /CoreWebVitals/LCP. Runs before the build; the files are not committed (see .gitignore).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const PUBLIC = join(ROOT, 'public')

const pages = (dir = CONTENT) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? pages(join(dir, d.name)) : d.name.endsWith('.mdx') ? [relative(CONTENT, join(dir, d.name)).slice(0, -4)] : []
  )

const list = pages()
// The folders of a previous run, so a renamed page leaves no file behind
for (const dir of new Set(list.filter((p) => p.includes('/')).map((p) => p.split('/')[0]))) {
  rmSync(join(PUBLIC, dir), { recursive: true, force: true })
}
for (const page of list) {
  const out = join(PUBLIC, markdownPath(page))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await pageToMarkdown(join(CONTENT, `${page}.mdx`), { root: ROOT }))
}
console.log(`Generated the Markdown version of ${list.length} pages`)
