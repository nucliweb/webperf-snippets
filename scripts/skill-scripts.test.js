const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SKILLS_DIR = path.join(ROOT, 'skills')

// Agents run a skill script with evaluate_script and read its return value: the build
// drops console output. If the minifier treats the snippet IIFE as a statement whose value
// is unused, it drops the final `return { script: ..., status: ... }` and the agent gets
// undefined. Each result object in the source has to survive in the built script.
const resultObjects = (code) => (code.match(/[{,]\s*["']?script["']?\s*:/g) || []).length

const scripts = fs
  .readdirSync(SKILLS_DIR)
  .flatMap((skill) => {
    const dir = path.join(SKILLS_DIR, skill, 'scripts')
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f)) : []
  })

for (const file of scripts) {
  const built = fs.readFileSync(file, 'utf8')
  const source = path.join(ROOT, built.match(/^\/\/ (snippets\/\S+)/)[1])
  const name = path.relative(ROOT, file)

  test(`${name} keeps the result objects of its source`, () => {
    assert.equal(resultObjects(built), resultObjects(fs.readFileSync(source, 'utf8')))
  })
}

test('finds the built skill scripts', () => {
  assert.ok(scripts.length > 0)
})
