#!/usr/bin/env node
/**
 * Fails when the files under the given paths differ from what is committed. It runs after a
 * generator, to check that the generated files in the repository are up to date.
 *
 * It reads `git status`, not `git diff`: a diff does not list a file that was never added,
 * which is what the output of a new snippet is.
 *
 * Run: node scripts/check-generated.js <path> [<path>...]
 */

const { execFileSync } = require('child_process')

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error('Usage: node scripts/check-generated.js <path> [<path>...]')
  process.exit(2)
}

const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], { encoding: 'utf8' })
if (status.trim()) {
  console.error(`The generated files are not up to date. Run the generator and commit the result:\n${status}`)
  process.exit(1)
}
