const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// The generated skills an agent reads: Claude Code (skills/, .claude/skills/), Antigravity and Gemini CLI.
// `npm run generate-skills:check` keeps them equal to what the generator writes.
const GENERATED_DIRS = ['skills', '.claude/skills', 'dist/antigravity', 'dist/gemini']

const guidanceFiles = (dir) => {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs, { recursive: true })
    .filter((f) => /\.(md|toml)$/.test(f))
    .map((f) => path.join(abs, f))
}

const files = GENERATED_DIRS.flatMap(guidanceFiles)
const rel = (file) => path.relative(ROOT, file)
const read = (file) => fs.readFileSync(file, 'utf8')

// The skill scripts are built with drop_console, so the console stays empty: the result is the return value.
for (const file of files) {
  test(`${rel(file)} does not send agents to the console for results`, () => {
    assert.doesNotMatch(read(file), /get_console_message|list_console_messages/)
  })
}

const categoryGuides = files.filter((f) => {
  const name = path.basename(f)
  const skill = path.basename(path.dirname(f))
  return skill !== 'webperf' && (name === 'SKILL.md' || name === `${skill}.toml`)
})

for (const file of categoryGuides) {
  test(`${rel(file)} says to read the return value of evaluate_script`, () => {
    const text = read(file)
    assert.match(text, /mcp__chrome-devtools__evaluate_script/)
    assert.match(text, /return(ed)? (value|object)/i)
    assert.match(text, /getDataFn/)
  })

  test(`${rel(file)} offers the CLI when Chrome DevTools MCP is not available`, () => {
    assert.match(read(file), /npx webperf-snippets <url> --snippet <\w+> --json/)
  })
}

const routers = files.filter((f) => path.basename(path.dirname(f)) === 'webperf')

for (const file of routers) {
  test(`${rel(file)} names SKILL.md with its real case`, () => {
    const text = read(file)
    assert.doesNotMatch(text, /skill\.md/, 'skill.md does not exist on case-sensitive file systems')
    assert.match(text, /SKILL\.md/)
  })

  test(`${rel(file)} says to read the return value of evaluate_script`, () => {
    assert.match(read(file), /evaluate_script.*return(ed)? (value|object)/i)
  })
}

test('SKILLS.md does not document settings Claude Code does not have', () => {
  const text = read(path.join(ROOT, 'SKILLS.md'))
  assert.doesNotMatch(text, /get_console_message/)
  assert.doesNotMatch(text, /"skills"\s*:\s*\[/, 'Claude Code has no "skills" key in settings.json')
})

test('finds the generated guidance of every target', () => {
  for (const dir of GENERATED_DIRS) {
    assert.ok(guidanceFiles(dir).length > 0, `no guidance files in ${dir}`)
  }
  assert.equal(categoryGuides.length, 5 * GENERATED_DIRS.length)
  assert.equal(routers.length, GENERATED_DIRS.length)
})
