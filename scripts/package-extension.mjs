#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Builds the snippets of the extension and zips the extension folder, the file of the beta that people
// load unpacked in chrome://extensions. The release workflow attaches it to the extension-v* release.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSION = join(ROOT, 'extension')
// Only the panel needs them at runtime: the tests and the files for developing it stay out
const EXCLUDE = ['tests/*', '*.test.js', 'package.json', 'README.md', '.DS_Store']

export function packageExtension(outDir = ROOT) {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-extension.mjs')], { stdio: 'ignore' })
  const { version } = JSON.parse(readFileSync(join(EXTENSION, 'manifest.json'), 'utf8'))
  const zip = join(resolve(outDir), `webperf-snippets-extension-${version}.zip`)
  rmSync(zip, { force: true })
  execFileSync('zip', ['-qr', zip, '.', '-x', ...EXCLUDE], { cwd: EXTENSION })
  return zip
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Wrote ${packageExtension(process.argv[2])}`)
}
