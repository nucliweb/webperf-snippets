const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readMeta } = require('./read-meta')

const CONTENT_DIR = path.join(__dirname, '..', 'content')

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-meta-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('reads the object exported by a _meta.js file', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, '_meta.js'), 'export default {\n  index: { title: "Intro" },\n  "my-page": { title: "My page" },\n}\n')
    assert.deepEqual(readMeta(dir), { index: { title: 'Intro' }, 'my-page': { title: 'My page' } })
  })
})

test('throws when the directory has no _meta.js', () => {
  withTempDir((dir) => {
    assert.throws(() => readMeta(dir), /_meta\.js/)
  })
})

test('every content directory describes its navigation in _meta.js', () => {
  const dirs = [CONTENT_DIR, ...fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CONTENT_DIR, entry.name))]
  for (const dir of dirs) {
    assert.ok(fs.existsSync(path.join(dir, '_meta.js')), `${path.relative(CONTENT_DIR, dir) || 'content'} has no _meta.js`)
    assert.ok(!fs.existsSync(path.join(dir, '_meta.json')), `${path.relative(CONTENT_DIR, dir) || 'content'} still has _meta.json`)
  }
})
