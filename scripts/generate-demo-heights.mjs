#!/usr/bin/env node
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Measures the height each demo of public/demos reports (`demoHeight`) in the column
// the Demo component gets on a page, and writes components/demo-heights.json. The
// component reserves that height before the demo loads, so the page does not shift.
// Run it after adding a demo or changing its layout and commit what it writes.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const OUTPUT = join(ROOT, 'components', 'demo-heights.json')

// Width of the content column, which is the width of the iframe: 343 px on a 375 px
// viewport and 672 px on a 1280 px one (also on 1024 px, with the sidebar and no TOC).
const COLUMNS = { mobile: 343, desktop: 672 }

// A demo that animates on load reports several heights; wait until it stops.
const QUIET_MS = 1500
const MAX_WAIT_MS = 10000

const demos = readdirSync(join(PUBLIC, 'demos'))
  .filter((file) => file.endsWith('.html'))
  .sort()

const harness = (demo, width) => `<!doctype html><html><body style="margin:0">
<iframe src="/demos/${demo}" style="display:block;border:0;width:${width}px;height:400px"></iframe>
<script>
window.__heights = []; window.__last = 0;
addEventListener('message', (e) => {
  if (typeof e.data?.demoHeight === 'number') { __heights.push(e.data.demoHeight); __last = performance.now(); }
});
</script></body></html>`

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/harness') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(harness(url.searchParams.get('demo'), Number(url.searchParams.get('width'))))
  }
  const file = join(PUBLIC, decodeURIComponent(url.pathname))
  if (!file.startsWith(PUBLIC) || !existsSync(file)) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  createReadStream(file).pipe(res)
})
await new Promise((resolve) => server.listen(0, resolve))
const base = `http://localhost:${server.address().port}`

const browser = await chromium.launch()

async function measure(demo, width) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  await page.goto(`${base}/harness?demo=${demo}&width=${width}`, { waitUntil: 'load' })
  await page.waitForFunction(
    ({ quiet }) => window.__heights.length > 0 && performance.now() - window.__last > quiet,
    { quiet: QUIET_MS },
    { timeout: MAX_WAIT_MS, polling: 100 },
  )
  const heights = await page.evaluate(() => window.__heights)
  await page.close()
  // The tallest height: the reserved space has to hold the demo at every moment of its load.
  return Math.max(...heights)
}

const result = {}
try {
  await Promise.all(
    demos.map(async (demo) => {
      const entry = {}
      for (const [key, width] of Object.entries(COLUMNS)) entry[key] = await measure(demo, width)
      result[demo] = entry
    }),
  )
} finally {
  await browser.close()
  server.close()
}

const sorted = Object.fromEntries(demos.map((demo) => [demo, result[demo]]))
writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2) + '\n')
console.log(`Wrote the heights of ${demos.length} demos to components/demo-heights.json`)
