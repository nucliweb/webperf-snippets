const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, 'check-generated.js')

// A git repository with one committed file in generated/, in a temporary folder
function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-generated-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  fs.mkdirSync(path.join(root, 'generated'))
  fs.writeFileSync(path.join(root, 'generated/kept.txt'), 'one\n')
  fs.writeFileSync(path.join(root, 'other.txt'), 'one\n')
  git('init', '--quiet')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '--quiet', '-m', 'first')
  return root
}

const check = (root, ...paths) => spawnSync(process.execPath, [SCRIPT, ...paths], { cwd: root, encoding: 'utf8' })

test('passes when the generated files are the committed ones', (t) => {
  const root = repository(t)

  assert.equal(check(root, 'generated').status, 0)
})

test('fails when a generated file changed', (t) => {
  const root = repository(t)
  fs.writeFileSync(path.join(root, 'generated/kept.txt'), 'two\n')
  const run = check(root, 'generated')

  assert.equal(run.status, 1)
  assert.match(run.stderr, /generated\/kept\.txt/)
})

// git diff --exit-code does not see a file that was never added: the script of a new snippet
test('fails when a generated file is new and not committed', (t) => {
  const root = repository(t)
  fs.writeFileSync(path.join(root, 'generated/new.txt'), 'one\n')
  const run = check(root, 'generated')

  assert.equal(run.status, 1)
  assert.match(run.stderr, /generated\/new\.txt/)
})

test('fails when a committed file is no longer generated', (t) => {
  const root = repository(t)
  fs.rmSync(path.join(root, 'generated/kept.txt'))

  assert.equal(check(root, 'generated').status, 1)
})

test('ignores the changes outside the paths it is given', (t) => {
  const root = repository(t)
  fs.writeFileSync(path.join(root, 'other.txt'), 'two\n')

  assert.equal(check(root, 'generated').status, 0)
})

test('exits with 2 without paths', (t) => {
  assert.equal(check(repository(t)).status, 2)
})
