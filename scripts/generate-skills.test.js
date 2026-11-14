const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, 'generate-skills.js')
const SNIPPET = '// A snippet\n(() => {\n  return { script: "Sample", status: "ok" };\n})();\n'

// A repository with one snippet, in a temporary folder: the generator writes there instead of here
function repository(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-skills-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const all = {
    'package.json': JSON.stringify({ version: '0.0.0', license: 'MIT', author: 'Someone' }),
    'snippets/SCHEMA.md': '# Schema\n',
    ...files,
  }
  for (const [file, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  return root
}

const generate = (root) =>
  spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, GENERATE_SKILLS_ROOT: root }, encoding: 'utf8' })

test('builds the script of a snippet', (t) => {
  const root = repository(t, { 'snippets/CoreWebVitals/Sample.js': SNIPPET })
  const run = generate(root)

  assert.equal(run.status, 0, run.stderr)
  assert.ok(fs.existsSync(path.join(root, 'skills/webperf-core-web-vitals/scripts/Sample.js')))
})

// generate-skills:check compares the output with what is committed: a generator that fails and
// exits with 0 leaves the folders half written, and the release packs them
test('exits with 1 when it fails', (t) => {
  const root = repository(t, { 'snippets/CoreWebVitals/Sample.js': SNIPPET })
  fs.rmSync(path.join(root, 'snippets/SCHEMA.md'))
  const run = generate(root)

  assert.equal(run.status, 1)
  assert.match(run.stderr, /SCHEMA\.md not found/)
})

test('removes the scripts of a snippet that no longer exists', (t) => {
  const stale = [
    'skills/webperf-core-web-vitals/scripts/Removed.js',
    'dist/webperf-core-web-vitals/Removed.js',
    'dist/gemini/webperf-core-web-vitals/scripts/Removed.js',
    'dist/antigravity/webperf-core-web-vitals/scripts/Removed.js',
    '.claude/skills/webperf-core-web-vitals/scripts/Removed.js',
  ]
  const root = repository(t, {
    'snippets/CoreWebVitals/Sample.js': SNIPPET,
    ...Object.fromEntries(stale.map((file) => [file, SNIPPET])),
  })
  const run = generate(root)

  assert.equal(run.status, 0, run.stderr)
  for (const file of stale) assert.ok(!fs.existsSync(path.join(root, file)), `${file} is still there`)
  assert.ok(fs.existsSync(path.join(root, 'dist/webperf-core-web-vitals/Sample.js')))
})
