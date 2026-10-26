#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, listSnippets, startContractServers } from '../cli/tests/helpers/contract.js'
import { loadSnippet } from '../cli/src/load-snippet.js'

// Writes scripts/fixtures/results/: the result of every snippet on the seeded and the heavy pages of
// the CLI contract tests, which scripts/view.test.mjs reads to check the view of real results. A
// tracking snippet gets clicks and a scroll, and then its getter is read, as in the panel. Run it
// after changing what a snippet returns: npm run view:fixtures, or npm run view:fixtures -- <snippet> for
// the fixtures of one snippet, such as Cache-Strategy-Analysis

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'results')
const PAGES = ['seeded', 'heavy']
// One snippet, by its name, or all of them
const only = process.argv[2]
const names = listSnippets().filter((name) => !only || name.endsWith(`/${only}`))
if (names.length === 0) throw new Error(`No snippet named ${only}`)

const servers = await startContractServers()
const browser = await launch()
// The servers listen on a free port, so the fixtures get fixed ones and do not change on every run
const fixPorts = (json) => json.replaceAll(servers.base, 'http://127.0.0.1:8000').replaceAll(servers.otherBase, 'http://127.0.0.1:8001')

try {
  if (!only) rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const pageName of PAGES) {
    for (const name of names) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
      try {
        await page.goto(`${servers.base}/${pageName}`, { waitUntil: 'load' })
        await page.waitForTimeout(800)
        const run = (expression) => page.evaluate(async (e) => JSON.parse(JSON.stringify((await (0, eval)(e)) ?? null)), expression)
        let result = await run(loadSnippet(name).trim().replace(/;\s*$/, ''))
        if (result?.status === 'tracking' && result.getDataFn) {
          // #go is on the seeded page, #slow and #mid on the heavy one
          for (const id of ['#go', '#slow', '#mid']) await page.click(id, { timeout: 500 }).catch(() => {})
          await page.mouse.wheel(0, 600)
          await page.waitForTimeout(600)
          result = await run(`window.${result.getDataFn}()`)
        }
        const id = name.split('/')[1]
        writeFileSync(join(OUT, `${pageName}-${id}.json`), fixPorts(JSON.stringify(result, null, 2)) + '\n')
      } finally {
        await page.close()
      }
    }
  }
  console.log(`Wrote ${PAGES.length * names.length} results to ${OUT}`)
} finally {
  await browser.close()
  await servers.close()
}
