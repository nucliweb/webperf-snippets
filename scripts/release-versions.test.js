const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { checkVersions, untaggedParts } = require('./release-versions')

// A repository with the files that carry a version, all of them in agreement
function repository(t, changes = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-versions-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = {
    'package.json': JSON.stringify({ version: '2.0.0' }),
    'cli/package.json': JSON.stringify({ version: '1.5.0', mcpName: 'io.github.example/cli' }),
    'cli/server.json': JSON.stringify({ name: 'io.github.example/cli', version: '1.5.0', packages: [{ version: '1.5.0' }] }),
    'extension/manifest.json': JSON.stringify({ version: '0.3.0' }),
    'package-lock.json': JSON.stringify({ version: '2.0.0', packages: { '': { version: '2.0.0' }, cli: { version: '1.5.0' } } }),
    'cli/README.md': 'Output:\n"conditions": { "cliVersion": "1.5.0" }\n"meta": { "cli_version": "1.5.0" }\n',
    'content/CLI.mdx': 'Output:\n"conditions": { "cliVersion": "1.5.0" }\n',
    '.github/ISSUE_TEMPLATE/extension-feedback.yml': 'body:\n  - type: input\n    attributes:\n      label: Version\n      placeholder: 0.3.0\n',
    ...changes,
  }
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  return root
}

test('finds nothing when every file carries the version of its part', (t) => {
  assert.deepEqual(checkVersions(repository(t)), [])
})

test('reports a server.json left at the previous version of the CLI', (t) => {
  const root = repository(t, { 'cli/server.json': JSON.stringify({ name: 'io.github.example/cli', version: '1.4.0', packages: [{ version: '1.5.0' }] }) })
  const problems = checkVersions(root)

  assert.equal(problems.length, 1)
  assert.match(problems[0], /cli\/server\.json.*1\.4\.0.*1\.5\.0/)
})

test('reports a lockfile that was not regenerated, for the collection and for the CLI', (t) => {
  const root = repository(t, { 'package-lock.json': JSON.stringify({ version: '1.9.0', packages: { '': { version: '1.9.0' }, cli: { version: '1.4.0' } } }) })
  const problems = checkVersions(root)

  assert.equal(problems.length, 2)
  assert.match(problems[0], /package-lock\.json.*1\.9\.0.*2\.0\.0/)
  assert.match(problems[1], /package-lock\.json.*1\.4\.0.*1\.5\.0/)
})

test('reports an example of the JSON output with another version of the CLI, with its line', (t) => {
  const root = repository(t, { 'content/CLI.mdx': 'Output:\n"conditions": { "cliVersion": "1.4.0" }\n' })
  const problems = checkVersions(root)

  assert.equal(problems.length, 1)
  assert.match(problems[0], /content\/CLI\.mdx:2.*1\.4\.0.*1\.5\.0/)
})

test('reports the version of the feedback template when it is not the one of the extension', (t) => {
  const root = repository(t, { 'extension/manifest.json': JSON.stringify({ version: '0.4.0' }) })
  const problems = checkVersions(root)

  assert.equal(problems.length, 1)
  assert.match(problems[0], /extension-feedback\.yml.*0\.3\.0.*0\.4\.0/)
})

test('the repository carries one version per part in every file', () => {
  assert.deepEqual(checkVersions(path.join(__dirname, '..')), [])
})

test('names the parts whose version has no tag yet', (t) => {
  const root = repository(t)

  assert.deepEqual(untaggedParts(root, ['v2.0.0', 'cli-v1.4.0', 'extension-v0.3.0']), ['cli-v1.5.0'])
  assert.deepEqual(untaggedParts(root, ['v2.0.0', 'cli-v1.5.0', 'extension-v0.3.0']), [])
  assert.deepEqual(untaggedParts(root, []), ['v2.0.0', 'cli-v1.5.0', 'extension-v0.3.0'])
})
