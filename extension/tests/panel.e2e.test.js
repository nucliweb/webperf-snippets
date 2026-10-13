import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, startContractServers, STATUSES } from '../../cli/tests/helpers/contract.js'
import { auditWorkflow } from '../../cli/src/workflows/audit.js'

// Runs every snippet of snippets.json through the real panel: panel.html in one tab, and the seeded
// page of the CLI contract tests in another. A DevTools panel cannot be automated, so the panel gets a
// chrome.devtools.inspectedWindow.eval that runs each expression in the other tab, as the real one
// does: it returns the value as JSON and does not wait for a promise. Each result must keep the return
// contract (snippets/SCHEMA.md); an error of the panel itself, such as a syntax error, has no `script`.
// Run with npm run test:extension:e2e, which builds snippets.json first.

const EXTENSION = join(dirname(fileURLToPath(import.meta.url)), '..')
const snippets = JSON.parse(readFileSync(join(EXTENSION, 'snippets.json'), 'utf8'))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }

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
  // inspectedWindow.reload reloads the other tab, as the real one reloads the inspected page
  await panel.exposeFunction('__reloadTarget', () => target.reload({ waitUntil: 'commit' }).then(() => undefined))
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
        inspectedWindow: {
          eval: (e, callback) => window.__inspect(e).then(([value, exception]) => callback(value, exception)),
          reload: () => window.__reloadTarget(),
        },
        // The test calls window.__navigated(url) for a navigation of the inspected page
        network: { onNavigated: { addListener: (listener) => (window.__navigated = listener) } },
      },
      // chrome.storage, kept in the localStorage of the panel so that it outlives a reload, as the real
      // one outlives closing DevTools; each area under its own prefix
      storage: Object.fromEntries(
        ['sync', 'local'].map((name) => [
          name,
          {
            get: async (keys) =>
              Object.fromEntries(
                keys.flatMap((k) => {
                  const v = localStorage.getItem(`${name}:${k}`)
                  return v === null ? [] : [[k, JSON.parse(v)]]
                })
              ),
            set: async (items) => Object.entries(items).forEach(([k, v]) => localStorage.setItem(`${name}:${k}`, JSON.stringify(v))),
          },
        ])
      ),
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
  assert.ok(prompt.includes(`webperf-snippets '${servers.base}/seeded' --snippet LCP --json`), 'the command has the inspected page')
  assert.ok(!prompt.includes('<url>'))
  assert.ok(prompt.endsWith(`\nPage to measure: ${servers.base}/seeded\n`), prompt.slice(-120))
})

test('a navigation hides Read result, since it clears what a tracking snippet recorded', async () => {
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.click('#list button[data-id="Input-Latency-Breakdown"]')
  const result = await resultOf('#run')
  assert.equal(result.status, 'tracking')
  assert.ok(await panel.locator('#read').isVisible())
  await panel.evaluate((url) => window.__navigated(url), `${servers.base}/seeded?again`)
  assert.equal(await panel.locator('#read').isVisible(), false)
  assert.match(await panel.locator('#result').textContent(), /navigated.*Run the snippet again/)
})

// Reloads the panel, as closing and opening DevTools does
async function reopenPanel() {
  await panel.reload()
  // Attached, not visible: the list may be folded
  await panel.waitForSelector('#list button', { state: 'attached' })
}

test('the list folds away and comes back, and the panel remembers it', async () => {
  await panel.click('#toggle-sidebar')
  assert.equal(await panel.locator('#search').isVisible(), false)
  assert.equal(await panel.getAttribute('#toggle-sidebar', 'aria-expanded'), 'false')
  await reopenPanel()
  assert.equal(await panel.locator('#search').isVisible(), false)
  await panel.click('#toggle-sidebar')
  assert.equal(await panel.locator('#search').isVisible(), true)
  assert.equal(await panel.getAttribute('#toggle-sidebar', 'aria-expanded'), 'true')
})

test('/ goes to the search box, and opens the list when it is folded', async () => {
  await panel.click('#toggle-sidebar')
  await panel.locator('main').click()
  await panel.keyboard.press('/')
  assert.equal(await panel.evaluate(() => document.activeElement?.id), 'search')
  assert.equal(await panel.getAttribute('#toggle-sidebar', 'aria-expanded'), 'true')
  // Typed in the search box, / is just a character
  await panel.keyboard.type('a/b')
  assert.equal(await panel.inputValue('#search'), 'a/b')
  await panel.keyboard.press('Escape')
  assert.equal(await panel.inputValue('#search'), '')
})

test('the arrows move through the list, Enter opens a snippet and Ctrl+Enter runs it', async () => {
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.locator('main').click()
  await panel.keyboard.press('/')
  await panel.keyboard.press('ArrowDown')
  const first = await panel.evaluate(() => document.activeElement?.dataset.id)
  await panel.keyboard.press('ArrowDown')
  const second = await panel.evaluate(() => document.activeElement?.dataset.id)
  const ids = await panel.locator('#list button').evaluateAll((buttons) => buttons.map((b) => b.dataset.id))
  assert.deepEqual([first, second], ids.slice(0, 2))
  await panel.keyboard.press('ArrowUp')
  await panel.keyboard.press('Enter')
  assert.equal(await panel.textContent('main h1'), snippets.find((s) => s.id === first).title)
  await panel.keyboard.press('Control+Enter')
  await panel.waitForSelector('#result .raw pre', { state: 'attached' })
})

test('the panel opens on the last snippet it showed', async () => {
  await panel.click('#list button[data-id="TTFB"]')
  await reopenPanel()
  assert.equal(await panel.textContent('main h1'), snippets.find((s) => s.id === 'TTFB').title)
  assert.equal(await panel.getAttribute('#list button[data-id="TTFB"]', 'aria-current'), 'true')
})

test('a selector in the result selects its element in Elements', async () => {
  // inspect() is a DevTools console function; here it records what it got
  await target.addInitScript(() => (window.inspect = (el) => (window.__inspected = el.outerHTML.slice(0, 40))))
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.click('#list button[data-id="LCP"]')
  const result = await resultOf('#run')
  const selector = result.details.element
  assert.ok(selector, 'LCP gives the selector of its element')
  await panel.click('#result button.inspect')
  const inspected = await target.evaluate(() => window.__inspected)
  const expected = await target.evaluate((s) => document.querySelector(s).outerHTML.slice(0, 40), selector)
  assert.equal(inspected, expected)
})

test('the keyboard button lists the shortcuts, and ? is left to DevTools', async () => {
  const dialog = panel.locator('#shortcuts')
  // DevTools opens its settings with ?
  await panel.locator('main').click()
  await panel.keyboard.press('?')
  assert.equal(await dialog.isVisible(), false)
  await panel.click('#open-shortcuts')
  assert.ok(await dialog.isVisible())
  const text = await dialog.textContent()
  for (const action of ['Search snippets', 'Move through the list', 'Open the snippet', 'Run the snippet', 'Clear the search']) {
    assert.ok(text.includes(action), `no "${action}"`)
  }
  await panel.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), false)
  await panel.click('#open-shortcuts')
  await panel.click('#shortcuts .close')
  assert.equal(await dialog.isVisible(), false)
})

test('the settings choose the theme and the side of the list, and the panel remembers them', async () => {
  const isDark = () => panel.evaluate(() => document.documentElement.classList.contains('dark'))
  await panel.click('#open-settings')
  await panel.check('input[name="theme"][value="dark"]')
  assert.equal(await isDark(), true)
  await panel.check('input[name="side"][value="right"]')
  await panel.click('#settings .close')
  const side = async () => {
    const [list, main] = await Promise.all([panel.locator('.sidebar').boundingBox(), panel.locator('main').boundingBox()])
    return list.x > main.x ? 'right' : 'left'
  }
  assert.equal(await side(), 'right')
  await reopenPanel()
  assert.equal(await isDark(), true)
  assert.equal(await side(), 'right')
  await panel.click('#open-settings')
  assert.ok(await panel.isChecked('input[name="theme"][value="dark"]'))
  await panel.check('input[name="theme"][value="light"]')
  assert.equal(await isDark(), false)
  // Following DevTools, which the test sets to the light theme
  await panel.check('input[name="theme"][value="devtools"]')
  assert.equal(await isDark(), false)
  await panel.check('input[name="side"][value="left"]')
  await panel.click('#settings .close')
  assert.equal(await side(), 'left')
})

test('Clear empties the result, and only shows when there is one', async () => {
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.click('#list button[data-id="Input-Latency-Breakdown"]')
  assert.equal(await panel.locator('#clear').isVisible(), false)
  await resultOf('#run')
  assert.ok(await panel.locator('#read').isVisible())
  await panel.click('#clear')
  assert.equal((await panel.textContent('#result')).trim(), '')
  assert.equal(await panel.locator('#clear').isVisible(), false)
  assert.equal(await panel.locator('#read').isVisible(), false)
})

test('the home page says what the snippets are for, and the home button goes back to it', async () => {
  await panel.click('#go-home')
  assert.equal(await panel.textContent('main h1'), 'WebPerf Snippets')
  // The logo of the site, loaded from the extension
  assert.ok(await panel.locator('main h1 img.logo').evaluate((img) => img.decode().then(() => img.naturalWidth > 0, () => false)))
  const text = await panel.textContent('main')
  assert.match(text, /inspected page/)
  assert.match(text, /Read result/)
  // A shortcut per category, with its number of snippets
  const categories = [...new Set(snippets.map((s) => s.category))]
  assert.equal(await panel.locator('main .categories button').count(), categories.length)
  // It opens on the home page again after closing DevTools
  await reopenPanel()
  assert.equal(await panel.textContent('main h1'), 'WebPerf Snippets')
  // A category shortcut shows its snippets in the list
  await panel.click('main .categories button >> nth=1')
  assert.equal(await panel.evaluate(() => document.activeElement?.closest('#list') !== null), true)
})

test('the audit runs the snippets of the audit of the CLI, sums them up and opens each result', async () => {
  const inAudit = snippets.filter((s) => typeof s.audit === 'number')
  assert.deepEqual(
    [...inAudit].sort((a, b) => a.audit - b.audit).map((s) => s.path),
    auditWorkflow.steps.map((step) => step.path)
  )
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await panel.click('#go-home')
  await panel.click('#run-audit')
  await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  assert.equal(await panel.locator('#audit tbody tr').count(), auditWorkflow.steps.length)
  assert.match(await panel.textContent('#audit .overview'), new RegExp(`^${auditWorkflow.steps.length} snippets: `))
  // A snippet with nothing to fix says so, and a metric shows its value and rating
  const rows = await panel.locator('#audit tbody tr').evaluateAll((trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()))
  assert.ok(rows.some((r) => r.includes('No issues found')), 'no row says it has no issues')
  assert.ok(await panel.locator('#audit tbody .clean').count() > 0)
  const ttfb = rows.find((r) => r.startsWith('TTFB Sub Parts'))
  assert.match(ttfb, /\d+ ms · (good|needs improvement|poor)/)
  // Each row opens the result it got, and the way back keeps the audit
  const title = await panel.textContent('#audit tbody tr >> nth=0 >> button')
  await panel.click('#audit tbody tr >> nth=0 >> button')
  assert.equal(await panel.textContent('main h1'), title)
  await panel.waitForSelector('#result .raw pre', { state: 'attached' })
  await panel.click('#back-to-audit')
  assert.equal(await panel.locator('#audit tbody tr').count(), auditWorkflow.steps.length)

  // The home page keeps the last audit, also after closing DevTools, and opens it again with its results
  await panel.click('#go-home')
  assert.match(await panel.textContent('main .audits li >> nth=0'), new RegExp(`${servers.base}/seeded`))
  await reopenPanel()
  await panel.click('#go-home')
  await panel.click('main .audits li >> nth=0 >> .open-audit')
  assert.equal(await panel.locator('#audit tbody tr').count(), auditWorkflow.steps.length)
  await panel.click('#audit tbody tr >> nth=0 >> button')
  await panel.waitForSelector('#result .raw pre', { state: 'attached' })
  await panel.click('#back-to-audit')
  assert.equal(await panel.locator('#audit tbody tr').count(), auditWorkflow.steps.length)

  // Copy JSON and Download JSON give the audit in the shape of the CLI
  await panel.evaluate(() => (window.__copied.length = 0))
  await panel.click('#copy-audit')
  await panel.waitForFunction(() => window.__copied.length === 1)
  const copied = JSON.parse(await panel.evaluate(() => window.__copied[0]))
  assert.equal(copied.workflow, 'audit')
  assert.equal(copied.url, `${servers.base}/seeded`)
  assert.deepEqual(copied.results.map((r) => r.id), auditWorkflow.steps.map((step) => step.id))
  assert.equal(copied.overview.snippets, auditWorkflow.steps.length)
  assert.ok(copied.issues.length > 0)
  const [download] = await Promise.all([panel.waitForEvent('download'), panel.click('#download-audit')])
  assert.match(download.suggestedFilename(), /^webperf-audit-127\.0\.0\.1-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'))
  assert.deepEqual(file.results.map((r) => r.id), copied.results.map((r) => r.id))
})

test('the home page lists the audits, opens and deletes them, and keeps them after closing DevTools', async () => {
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  const before = await (async () => {
    await panel.click('#go-home')
    return panel.locator('main .audits li').count()
  })()
  await panel.click('#run-audit')
  await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  await panel.click('#go-home')
  const entries = panel.locator('main .audits li')
  assert.equal(await entries.count(), before + 1)
  assert.match(await entries.nth(0).textContent(), new RegExp(`${servers.base}/seeded`))
  await reopenPanel()
  await panel.click('#go-home')
  assert.equal(await entries.count(), before + 1)
  // The newest opens with its results
  await entries.nth(0).locator('.open-audit').click()
  assert.equal(await panel.locator('#audit tbody tr').count(), auditWorkflow.steps.length)
  await panel.click('#go-home')
  const [download] = await Promise.all([panel.waitForEvent('download'), entries.nth(0).locator('.download-audit').click()])
  assert.match(download.suggestedFilename(), /^webperf-audit-127\.0\.0\.1-/)
  await entries.nth(0).locator('.delete-audit').click()
  assert.equal(await entries.count(), before)
  await reopenPanel()
  await panel.click('#go-home')
  assert.equal(await entries.count(), before)
})

test('an audit says what changed since the last audit of the same page', async () => {
  const audit = async () => {
    await panel.click('#go-home')
    await panel.click('#run-audit')
    await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  }
  // The page changes between the audits, so the audit must not reload it
  await panel.click('#go-home')
  await panel.uncheck('#reload-before-audit')
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await audit()
  // An image that is lazy and high priority at once: a new issue of Find-Images-With-Lazy-and-Fetchpriority
  await target.evaluate(() => {
    const img = Object.assign(document.createElement('img'), { src: '/hero.png?again', width: 10, height: 10, loading: 'lazy' })
    img.setAttribute('fetchpriority', 'high')
    document.body.prepend(img)
  })
  await audit()
  const comparison = panel.locator('#audit .comparison')
  assert.match(await comparison.textContent(), /Since /)
  const added = await comparison.locator('.added li').allTextContents()
  assert.ok(added.some((text) => /lazy/i.test(text)), `no new lazy issue in ${JSON.stringify(added)}`)
  // From 1 to 2 conflicting images: the same issue of Find-Images-With-Lazy-and-Fetchpriority, changed
  const changed = await comparison.locator('.changed li').allTextContents()
  assert.ok(changed.some((text) => /1 element.*→.*2 element/s.test(text)), `no changed count in ${JSON.stringify(changed)}`)
  await panel.click('#go-home')
  await panel.check('#reload-before-audit')
})

test('the audit reloads the page first, as the CLI loads it, unless the option is off, which the panel remembers', async () => {
  const marked = () => target.evaluate(() => window.__marked === true).catch(() => false)
  await target.goto(`${servers.base}/seeded`, { waitUntil: 'load' })
  await target.evaluate(() => (window.__marked = true))
  await panel.click('#go-home')
  assert.ok(await panel.isChecked('#reload-before-audit'), 'on by default')
  await panel.click('#run-audit')
  await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  assert.equal(await marked(), false, 'the page was not reloaded')
  // Two audits of the unchanged page find the same issues: no snippet counts the requests another one made
  await panel.click('#go-home')
  await panel.click('#run-audit')
  await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  assert.match(await panel.textContent('#audit .comparison'), /No issue appeared, changed or went away/)

  await panel.click('#go-home')
  await panel.uncheck('#reload-before-audit')
  await reopenPanel()
  await panel.click('#go-home')
  assert.equal(await panel.isChecked('#reload-before-audit'), false)
  await target.evaluate(() => (window.__marked = true))
  await panel.click('#run-audit')
  await panel.waitForSelector('#audit[data-done="true"]', { timeout: 120000 })
  assert.equal(await marked(), true, 'the page was reloaded with the option off')
  await panel.click('#go-home')
  await panel.check('#reload-before-audit')
})

test('a snippet the CLI cannot run has no Copy prompt', async () => {
  await panel.click('#list button[data-id="Long-Animation-Frames-Helpers"]')
  assert.equal(await panel.locator('#copy-prompt').count(), 0)
})

test('the panel lists every snippet, and each category says how many it has', async () => {
  assert.equal(await panel.locator('#list button').count(), snippets.length)
  const counts = await panel.locator('#list h2 .count').allTextContents()
  assert.equal(counts.map(Number).reduce((a, b) => a + b, 0), snippets.length)
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
