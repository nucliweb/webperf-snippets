#!/usr/bin/env node

// The version of each part is written in several files, which RELEASING.md lists and a release
// changes by hand. check-tag-version.js compares them when the tag is pushed, after the merge:
// this runs on every pull request, so a file left at the previous version stops there.
//
//   node scripts/release-versions.js             every file carries the version of its part
//   node scripts/release-versions.js --untagged  the versions that have no tag on the remote, as a
//                                                warning: a merged release whose tag was not pushed
//                                                is not published, and the site already names it

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8')
const readJson = (root, file) => JSON.parse(read(root, file))

// The tag of each part and the file that holds its version, as in check-tag-version.js
const PARTS = [
  { prefix: 'v', file: 'package.json' },
  { prefix: 'cli-v', file: 'cli/package.json' },
  { prefix: 'extension-v', file: 'extension/manifest.json' },
]

// The examples of the JSON output of the CLI name its version
const CLI_EXAMPLES = ['cli/README.md', 'content/CLI.mdx']
const CLI_VERSION_FIELD = /"cli(?:Version|_version)":\s*"([^"]+)"/g

function checkVersions(root = ROOT) {
  const problems = []
  const differs = (file, found, expected, of) => problems.push(`${file} has ${found}, and the version of ${of} is ${expected}`)

  const collection = readJson(root, 'package.json').version
  const cli = readJson(root, 'cli/package.json').version
  const extension = readJson(root, 'extension/manifest.json').version

  const server = readJson(root, 'cli/server.json')
  if (server.version !== cli) differs('cli/server.json', server.version, cli, 'cli/package.json')
  ;(server.packages ?? []).forEach((pkg, i) => {
    if (pkg.version !== cli) differs(`cli/server.json (packages[${i}])`, pkg.version, cli, 'cli/package.json')
  })

  const lock = readJson(root, 'package-lock.json')
  const lockRoot = lock.packages?.['']?.version ?? lock.version
  if (lockRoot !== collection) differs('package-lock.json', lockRoot, collection, 'package.json')
  const lockCli = lock.packages?.cli?.version
  if (lockCli !== cli) differs('package-lock.json (cli)', lockCli, cli, 'cli/package.json')

  for (const file of CLI_EXAMPLES) {
    read(root, file)
      .split('\n')
      .forEach((line, index) => {
        for (const [, version] of line.matchAll(CLI_VERSION_FIELD)) {
          if (version !== cli) differs(`${file}:${index + 1}`, version, cli, 'cli/package.json')
        }
      })
  }

  const template = '.github/ISSUE_TEMPLATE/extension-feedback.yml'
  const placeholder = read(root, template).match(/^\s*placeholder:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1]
  if (placeholder !== extension) differs(template, placeholder ?? 'no version in its placeholder', extension, 'extension/manifest.json')

  return problems
}

// The tags the current versions would have, without the ones in `tags`
function untaggedParts(root = ROOT, tags = []) {
  return PARTS.map(({ prefix, file }) => `${prefix}${readJson(root, file).version}`).filter((tag) => !tags.includes(tag))
}

function remoteTags(root) {
  const out = execFileSync('git', ['ls-remote', '--tags', 'origin'], { cwd: root, encoding: 'utf8' })
  return out.split('\n').flatMap((line) => line.match(/refs\/tags\/([^^\s]+)$/)?.[1] ?? [])
}

function main(args = process.argv.slice(2)) {
  if (args.includes('--untagged')) {
    const missing = untaggedParts(ROOT, remoteTags(ROOT))
    for (const tag of missing) console.log(`::warning::The tag ${tag} does not exist: that version is on main and is not published. See "Tags" in RELEASING.md`)
    if (missing.length === 0) console.log('Every version on this commit has its tag.')
    return 0
  }

  const problems = checkVersions()
  if (problems.length > 0) {
    console.error('The versions do not agree. See "Bump the versions" in RELEASING.md:\n')
    for (const problem of problems) console.error(`- ${problem}`)
    return 1
  }
  console.log('Every file carries the version of its part.')
  return 0
}

if (require.main === module) process.exitCode = main()

module.exports = { checkVersions, untaggedParts }
