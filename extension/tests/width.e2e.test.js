import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { renderResult } from '../lib/render.js'

// Every result of scripts/fixtures/results/ through the renderer of the panel, with its styles, in a
// panel 1,000 px wide with the list open, as DevTools docked to a side: no table may be wider than the
// panel, so that no column hides behind a sideways scroll. Each result goes twice, as it is and with the
// long URLs and selectors of a real page. Run with npm run test:extension:e2e, which builds lib/view/.

const css = readFileSync(new URL('../panel.css', import.meta.url), 'utf8')
const FIXTURES = new URL('../../scripts/fixtures/results/', import.meta.url)
const fixtures = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(new URL(f, FIXTURES), 'utf8'))])

const SELECTORS = new Set(['selector', 'element', 'lcpElement', 'finalElement'])
const LONG_SELECTOR = 'html.js-focus-visible > body.page-layout > div.application-main > main#content > div.container-xl > section.feed'
// The URLs and selectors of a real page: a long path with a hash and a query, a long chain of classes
function lengthen(value, key) {
  if (Array.isArray(value)) return value.map((v) => lengthen(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, lengthen(v, k)]))
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return `${value.replace(/\/[^/]*$/, '')}/assets/static/chunks/pages/framework-3f6a9c2d1b8e7f4a5c0d.${value.split('.').pop()}?v=1730000000`
  if (typeof value === 'string' && SELECTORS.has(key) && value) return `${LONG_SELECTOR} > ${value}`
  return value
}

let browser, page
before(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
})
after(() => browser?.close())

async function widerTables(result) {
  await page.setContent(`<html><head><style>${css}</style></head><body><aside class="sidebar"></aside><main id="main"><div id="result">${renderResult(result)}</div></main></body></html>`)
  return page.evaluate(() => {
    document.querySelectorAll('details.nested').forEach((d) => (d.open = true))
    const panel = document.querySelector('#result').clientWidth
    return [...document.querySelectorAll('.table')]
      .filter((t) => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > document.querySelector('#result').getBoundingClientRect().right + 1)
      .map((t) => `${[...t.querySelectorAll(':scope > table > thead th')].map((th) => th.textContent).join(', ')} (${t.scrollWidth} px in ${panel} px)`)
  })
}

test('no table of any result is wider than a panel of 1,000 px', async () => {
  const found = []
  for (const [file, result] of fixtures) {
    for (const [variant, r] of [['', result], [' with long values', lengthen(result)]]) {
      for (const table of await widerTables(r)) found.push(`${file}${variant}: ${table}`)
    }
  }
  assert.deepEqual(found, [])
})
