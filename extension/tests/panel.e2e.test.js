import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, startContractServers, STATUSES } from '../../cli/tests/helpers/contract.js'

// Runs every snippet of snippets.json through the real panel: panel.html in one tab, and the seeded
// page of the CLI contract tests in another. A DevTools panel cannot be automated, so the panel gets a
// chrome.devtools.inspectedWindow.eval that runs each expression in the other tab, as the real one
// does: it returns the value as JSON and does not wait for a promise. Each result must keep the return
// contract (snippets/SCHEMA.md); an error of the panel itself, such as a syntax error, has no `script`.
// Run with npm run test:extension:e2e, which builds snippets.json first.

const EXTENSION = join(dirname(fileURLToPath(import.meta.url)), '..')
const snippets = JSON.parse(readFileSync(join(EXTENSION, 'snippets.json'), 'utf8'))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

let browser, servers, extension, target, panel
const pageErrors = []

before(async () => {
  servers = await startContractServers()
  extension = await new Promise((done) => {
    const server = createServer((req, res) => {
      const file = join(EXTENSION, decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (!file.startsWith(EXTENSION) || !existsSync(file)) return res.writeHead(404).end()
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'text/plain' }).end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => done(server))
  })
  browser = await launch()
  const context = await browser.newContext()
  target = await context.newPage()
  panel = await context.newPage()
  // An error of the panel fails the test that caused it
  panel.on('pageerror', (error) => pageErrors.push(error.message))
  await panel.exposeFunction('__inspect', async (expression) => {
    try {
      const value = await target.evaluate((e) => {
        const v = (0, eval)(e)
        return v instanceof Promise ? undefined : JSON.parse(JSON.stringify(v ?? null))
      }, expression)
      return [value, undefined]
    } catch (error) {
      return [undefined, { isException: true, value: error.message }]
    }
  })
  await panel.addInitScript(() => {
    // What the copy buttons write
    window.__copied = []
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => window.__copied.push(text) } })
    window.chrome = {
      devtools: {
        panels: { themeName: 'default' },
        inspectedWindow: { eval: (e, callback) => window.__inspect(e).then(([value, exception]) => callback(value, exception)) },
      },
    }
  })
  await panel.goto(`http://127.0.0.1:${extension.address().port}/panel.html`)
  await panel.waitForSelector('#list button')
})

test.afterEach(() => {
  const errors = pageErrors.splice(0)
  assert.deepEqual(errors, [], 'the panel threw')
})

after(async () => {
  await browser?.close()
  await servers?.close()
  extension?.close()
})

// Clicks a button of the panel and reads the result it shows, from the JSON of the result
async function resultOf(selector) {
  await panel.click(selector)
  await panel.waitForFunction(
    (s) => !document.querySelector(s).disabled && !document.querySelector('#result').textContent.includes('Running'),
    selector
  )
  const json = await panel.locator('#result .raw pre').textContent().catch(() => null)
  return json ? JSON.parse(json) : { panelError: await panel.locator('#result').textContent() }
}

function assertContract(id, result) {
  assert.ok(result && typeof result === 'object' && !Array.isArray(result), `${id}: not an object: ${JSON.stringify(result)}`)
  assert.ok(result.script, `${id}: no script, the panel failed: ${result.error ?? result.panelError}`)
  assert.ok(STATUSES.includes(result.status), `${id}: status ${result.status}`)
}

test('Copy JSON copies the result, and Copy prompt the prompt with the inspected page to measure', async () => {
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.click('#list button[data-id="LCP"]')
  const result = await resultOf('#run')
  await panel.evaluate(() => (window.__copied.length = 0))
  await panel.click('#result .copy-json')
  await panel.click('#copy-prompt')
  await panel.waitForFunction(() => window.__copied.length === 2)
  const [json, prompt] = await panel.evaluate(() => window.__copied)
  assert.deepEqual(JSON.parse(json), result)
  assert.match(prompt, /--snippet LCP --json/)
  assert.ok(prompt.endsWith(`\nPage to measure: ${servers.base}/seeded\n`), prompt.slice(-120))
})

test('a snippet the CLI cannot run has no Copy prompt', async () => {
  await panel.click('#list button[data-id="Long-Animation-Frames-Helpers"]')
  assert.equal(await panel.locator('#copy-prompt').count(), 0)
})

test('the panel lists every snippet', async () => {
  assert.equal(await panel.locator('#list button').count(), snippets.length)
})

for (const snippet of snippets) {
  test(snippet.id, async () => {
    await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
    await panel.click(`#list button[data-id="${snippet.id}"]`)
    const result = await resultOf('#run')
    assertContract(snippet.id, result)
    if (result.status === 'tracking' && result.getDataFn) {
      assert.ok(await panel.locator('#read').isVisible(), `${snippet.id}: no Read result button`)
      assertContract(`${snippet.id} (Read result)`, await resultOf('#read'))
    }
  })
}
