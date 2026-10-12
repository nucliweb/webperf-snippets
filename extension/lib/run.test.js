import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { runSnippet, readTrackingData, toExpression } from './run.js'

// inspectedWindow.eval returns the value as JSON, without waiting for a promise
const asJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

// An inspected page: a vm context with a window, and an eval like the one of chrome.devtools.inspectedWindow
function inspectedPage(globals = {}) {
  const context = vm.createContext({ console, Promise, setTimeout, ...globals })
  context.window = context
  return (expression) => Promise.resolve(asJson(vm.runInContext(expression, context)))
}

test('toExpression drops the trailing semicolon of an IIFE', () => {
  assert.equal(toExpression('(() => 1)();\n'), '(() => 1)()')
})

test('runSnippet returns the value of a synchronous snippet', async () => {
  const result = await runSnippet(inspectedPage(), '(() => ({ script: "TTFB", status: "ok", value: 42 }))();', { pollMs: 5 })
  assert.deepEqual(result, { script: 'TTFB', status: 'ok', value: 42 })
})

test('runSnippet waits for an async snippet', async () => {
  const code = '(async () => { await new Promise((r) => setTimeout(r, 30)); return { script: "LCP", status: "ok" }; })();'
  assert.deepEqual(await runSnippet(inspectedPage(), code, { pollMs: 5 }), { script: 'LCP', status: 'ok' })
})

test('runSnippet turns a snippet that throws into an error result', async () => {
  const result = await runSnippet(inspectedPage(), '(() => { throw new Error("boom"); })();', { pollMs: 5 })
  assert.deepEqual(result, { status: 'error', error: 'boom' })
})

test('runSnippet gives up after the timeout', async () => {
  const result = await runSnippet(inspectedPage(), 'new Promise(() => {})', { pollMs: 5, timeoutMs: 40 })
  assert.deepEqual(result, { status: 'error', error: 'The snippet did not finish in 0.04 s' })
})

test('runSnippet leaves nothing behind in the page', async () => {
  const context = { console, Promise, setTimeout }
  vm.createContext(context)
  context.window = context
  const evaluate = (e) => Promise.resolve(asJson(vm.runInContext(e, context)))
  await runSnippet(evaluate, '(() => 1)()', { pollMs: 5 })
  assert.deepEqual(Object.keys(context.__webperfSnippets ?? {}), [])
})

test('readTrackingData calls the data function a tracking snippet names, also on a dotted path', async () => {
  const evaluate = inspectedPage()
  await evaluate('window.loafHelpers = { getData: async () => ({ script: "LoAF", status: "ok", count: 3 }) }')
  assert.deepEqual(await readTrackingData(evaluate, 'loafHelpers.getData', { pollMs: 5 }), { script: 'LoAF', status: 'ok', count: 3 })
})

test('readTrackingData rejects a name that is not a function path', async () => {
  const result = await readTrackingData(inspectedPage(), 'alert(1); x', { pollMs: 5 })
  assert.match(result.error, /not a valid function name/)
})
