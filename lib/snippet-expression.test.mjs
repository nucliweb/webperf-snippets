import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snippetExpression } from './snippet-expression.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (expression) => vm.runInNewContext(`(${expression})`)

test('an IIFE stays as it is, without its semicolon', () => {
  assert.equal(snippetExpression('(() => ({ status: "ok" }))();\n'), '(() => ({ status: "ok" }))()')
})

test('a script that declares functions and calls one becomes an expression with the value of the call', async () => {
  const source = `// A snippet with helpers
function double(n) {
  return n * 2;
}
async function analyze(n = 4) {
  return { status: "ok", value: double(n) };
}
(async () => analyze())();

// Or call it yourself:
// analyze(10);
`
  const expression = snippetExpression(source)
  assert.doesNotThrow(() => new Function(`return (${expression})`))
  assert.deepEqual({ ...(await run(expression)) }, { status: 'ok', value: 8 })
})

test('a script whose last statement is not an expression gives undefined', () => {
  assert.equal(run(snippetExpression('const a = 1;\nfunction f() {}\n')), undefined)
})

test('every snippet becomes an expression the panel can wrap', () => {
  const files = readdirSync(join(ROOT, 'snippets'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .flatMap((d) => readdirSync(join(ROOT, 'snippets', d.name)).filter((f) => f.endsWith('.js')).map((f) => join(ROOT, 'snippets', d.name, f)))
  for (const file of files) {
    const expression = snippetExpression(readFileSync(file, 'utf8'))
    assert.doesNotThrow(() => new Function(`return Promise.resolve().then(() => ${expression})`), file)
  }
})
