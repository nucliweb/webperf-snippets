const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { checkTag } = require('./check-tag-version')

// A repository with the three versioned parts: the collection, the CLI (with the server.json of its
// MCP server) and the extension
const MCP_NAME = 'io.github.nucliweb/webperf-snippets'
function repo({ collection = '2.0.1', cli = '1.0.0', extension = '0.1.1', server = cli, serverPackage = server, serverName = MCP_NAME } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-version-'))
  fs.mkdirSync(path.join(root, 'cli'))
  fs.mkdirSync(path.join(root, 'extension'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: collection }))
  fs.writeFileSync(path.join(root, 'cli', 'package.json'), JSON.stringify({ version: cli, mcpName: MCP_NAME }))
  fs.writeFileSync(
    path.join(root, 'cli', 'server.json'),
    JSON.stringify({ name: serverName, version: server, packages: [{ registryType: 'npm', identifier: 'webperf-snippets', version: serverPackage }] })
  )
  fs.writeFileSync(path.join(root, 'extension', 'manifest.json'), JSON.stringify({ version: extension }))
  return root
}

test('a v* tag matches the version of the collection in package.json', () => {
  assert.deepEqual(checkTag('v2.0.1', repo()), { ok: true, file: 'package.json', version: '2.0.1' })
  assert.equal(checkTag('v2.0.2', repo()).ok, false)
})

test('a cli-v* tag matches the version of cli/package.json, not the one of the collection', () => {
  assert.deepEqual(checkTag('cli-v1.0.0', repo()), { ok: true, file: 'cli/package.json', version: '1.0.0' })
  assert.equal(checkTag('cli-v2.0.1', repo()).ok, false)
})

test('a cli-v* tag also matches the version of cli/server.json and of the npm package it lists', () => {
  assert.equal(checkTag('cli-v1.1.0', repo({ cli: '1.1.0' })).ok, true)
  const server = checkTag('cli-v1.1.0', repo({ cli: '1.1.0', server: '1.0.0' }))
  assert.equal(server.ok, false)
  assert.match(server.message, /1\.0\.0 of cli\/server\.json/)
  const pkg = checkTag('cli-v1.1.0', repo({ cli: '1.1.0', serverPackage: '1.0.0' }))
  assert.equal(pkg.ok, false)
  assert.match(pkg.message, /packages\[0\]\.version/)
})

test('the name of cli/server.json is the mcpName of cli/package.json, which the MCP Registry checks', () => {
  const { ok, message } = checkTag('cli-v1.0.0', repo({ serverName: 'io.github.someone/else' }))
  assert.equal(ok, false)
  assert.match(message, /io\.github\.someone\/else/)
  assert.match(message, /mcpName/)
})

test('an extension-v* tag matches the version of extension/manifest.json', () => {
  assert.deepEqual(checkTag('extension-v0.1.1', repo()), { ok: true, file: 'extension/manifest.json', version: '0.1.1' })
  assert.equal(checkTag('extension-v0.1.2', repo()).ok, false)
})

test('a mismatch says which tag and which file disagree', () => {
  const { message } = checkTag('cli-v1.1.0', repo())
  assert.match(message, /cli-v1\.1\.0/)
  assert.match(message, /1\.0\.0 of cli\/package\.json/)
})

test('a tag of no known part is not a release', () => {
  assert.equal(checkTag('release-1.0.0', repo()).ok, false)
  assert.match(checkTag('release-1.0.0', repo()).message, /not a release tag/)
})

test('from the command line, a mismatch exits with 1 and prints a GitHub error annotation', () => {
  const script = path.join(__dirname, 'check-tag-version.js')
  const root = repo()
  assert.match(execFileSync('node', [script, 'v2.0.1', root], { encoding: 'utf8' }), /v2\.0\.1 matches/)
  assert.throws(
    () => execFileSync('node', [script, 'v9.9.9', root], { encoding: 'utf8', stdio: 'pipe' }),
    (error) => error.status === 1 && /^::error::/.test(error.stdout)
  )
})

test('the tags of this repository match their files as they are committed', () => {
  const root = path.join(__dirname, '..')
  const version = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).version
  assert.equal(checkTag(`v${version('package.json')}`, root).ok, true)
  assert.equal(checkTag(`cli-v${version('cli/package.json')}`, root).ok, true)
  assert.equal(checkTag(`extension-v${version('extension/manifest.json')}`, root).ok, true)
})
