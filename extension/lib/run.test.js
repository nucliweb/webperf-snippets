import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { runSnippet, readTrackingData, reloadPage } from './run.js'

// inspectedWindow.eval returns the value as JSON, without waiting for a promise
const asJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

// An inspected page: a vm context with a window, and an eval like the one of chrome.devtools.inspectedWindow
function inspectedPage(globals = {}) {
  const context = vm.createContext({ console, Promise, setTimeout, ...globals })
  context.window = context
  return (expression) => Promise.resolve(asJson(vm.runInContext(expression, context)))
}

test('runSnippet returns the value of a synchronous snippet', async () => {
  const result = await runSnippet(inspectedPage(), '(() => ({ script: "TTFB", status: "ok", value: 42 }))()', { pollMs: 5 })
  assert.deepEqual(result, { script: 'TTFB', status: 'ok', value: 42 })
})

test('runSnippet waits for an async snippet', async () => {
  const code = '(async () => { await new Promise((r) => setTimeout(r, 30)); return { script: "LCP", status: "ok" }; })()'
  assert.deepEqual(await runSnippet(inspectedPage(), code, { pollMs: 5 }), { script: 'LCP', status: 'ok' })
})

test('runSnippet turns a snippet that throws into an error result', async () => {
  const result = await runSnippet(inspectedPage(), '(() => { throw new Error("boom"); })()', { pollMs: 5 })
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

test('readTrackingData says the recording is gone when the page no longer has the data function', async () => {
  const result = await readTrackingData(inspectedPage(), 'getInputLatencyBreakdown', { pollMs: 5 })
  assert.equal(result.status, 'error')
  assert.match(result.error, /getInputLatencyBreakdown\(\) is not on the page/)
  assert.match(result.error, /reloaded or navigated/)
  assert.match(result.error, /Run the snippet again/)
})

test('reloadPage reloads the page, waits for the new one to load and then for a while, as the CLI does', async () => {
  const context = vm.createContext({ document: { readyState: 'complete' } })
  context.window = context
  const evaluate = (expression) => Promise.resolve(asJson(vm.runInContext(expression, context)))
  let reloads = 0
  // The new page keeps loading for a moment
  const reload = () => {
    reloads++
    // A new page: nothing the old one had on window
    vm.runInContext("for (const k of Object.keys(globalThis)) if (k.startsWith('__')) delete globalThis[k]", context)
    context.document = { readyState: 'loading' }
    setTimeout(() => (context.document = { readyState: 'complete' }), 30)
  }
  const started = Date.now()
  assert.equal(await reloadPage(evaluate, reload, { afterLoadMs: 50, pollMs: 5 }), true)
  assert.equal(reloads, 1)
  assert.ok(Date.now() - started >= 80, 'it waits for the load and then afterLoadMs')
})

test('reloadPage gives up when the page does not load in time', async () => {
  const context = vm.createContext({ document: { readyState: 'complete' } })
  context.window = context
  const evaluate = (expression) => Promise.resolve(asJson(vm.runInContext(expression, context)))
  // A reload that never happens: the marker stays, so the old page is never taken for the new one
  assert.equal(await reloadPage(evaluate, () => {}, { afterLoadMs: 0, pollMs: 5, timeoutMs: 40 }), false)
})
