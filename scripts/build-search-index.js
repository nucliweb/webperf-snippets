#!/usr/bin/env node

// Builds the Pagefind index of the site from the HTML that `next build` prerendered.

const path = require('path')
const { spawnSync } = require('child_process')
const { findPrerenderedDir } = require('./prerendered-dir')

const ROOT = path.join(__dirname, '..')
const site = findPrerenderedDir(path.join(ROOT, '.next'))
console.log(`Indexing ${path.relative(ROOT, site)}`)

const result = spawnSync(
  path.join(ROOT, 'node_modules', '.bin', 'pagefind'),
  ['--site', site, '--output-path', path.join(ROOT, 'public', '_pagefind')],
  { stdio: 'inherit' }
)
process.exit(result.status ?? 1)
