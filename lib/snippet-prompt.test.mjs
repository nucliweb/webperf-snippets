import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promptKind, buildPrompt, cliVersion, PLAYWRIGHT } from './snippet-prompt.mjs'
import { resolveSnippetName } from '../cli/src/snippet-names.js'
import { interactionWorkflow } from '../cli/src/workflows/interaction.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = (path) => readFileSync(join(ROOT, 'snippets', `${path}.js`), 'utf8')
const prompt = (path, docsPath = `/${path}`) =>
  buildPrompt({ path, source: source(path), docsPath, cliVersion: '9.9.9' })

const allSnippets = readdirSync(join(ROOT, 'snippets'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .flatMap((d) =>
    readdirSync(join(ROOT, 'snippets', d.name))
      .filter((f) => f.endsWith('.js'))
      .map((f) => `${d.name}/${f.slice(0, -3)}`)
  )

test('a snippet that answers on load is one-shot', () => {
  assert.equal(promptKind('Loading/TTFB', source('Loading/TTFB')), 'one-shot')
  assert.equal(promptKind('Media/Oversized-Images', source('Media/Oversized-Images')), 'one-shot')
})

test('a tracking snippet that needs no click or key is tracking', () => {
  assert.equal(promptKind('Interaction/LongTask', source('Interaction/LongTask')), 'tracking')
  assert.equal(promptKind('Interaction/Scroll-Performance', source('Interaction/Scroll-Performance')), 'tracking')
})

test('INP and the snippets that measure clicks and key presses need input', () => {
  for (const path of ['CoreWebVitals/INP', 'Interaction/Interactions', 'Interaction/Input-Latency-Breakdown']) {
    assert.equal(promptKind(path, source(path)), 'tracking-input', path)
  }
})

test('every step the interaction workflow marks as needing input needs input in the prompt too', () => {
  for (const step of interactionWorkflow.steps.filter((s) => s.needsInput)) {
    assert.equal(promptKind(step.path, source(step.path)), 'tracking-input', step.path)
  }
})

test('Back-Forward-Cache gives a partial result', () => {
  assert.equal(promptKind('Loading/Back-Forward-Cache', source('Loading/Back-Forward-Cache')), 'partial')
})

test('the snippets an agent cannot run meaningfully are excluded and have no prompt', () => {
  for (const path of [
    'DevTools-Overrides/Fetch-XHR-Timeline-inject',
    'DevTools-Overrides/Fetch-XHR-Timeline-read',
    'Interaction/Long-Animation-Frames-Helpers',
    'Resources/Network-Bandwidth-Connection-Quality',
  ]) {
    assert.equal(promptKind(path, source(path)), 'excluded', path)
    assert.equal(prompt(path), null, path)
  }
})

test('the prompt pins the CLI, names the snippet and links the docs, the source and the contract', () => {
  const p = prompt('Loading/TTFB-Sub-Parts', '/Loading/TTFB')
  assert.match(p, /npx -y -p webperf-snippets@9\.9\.9 -p playwright@1\.63 webperf-snippets <url> --snippet TTFB-Sub-Parts --json/)
  assert.match(p, /npx -y playwright@1\.63 install chromium/)
  assert.match(p, /warning .* is expected/)
  assert.match(p, /https:\/\/webperf-snippets\.nucliweb\.net\/Loading\/TTFB\b/)
  assert.match(p, /https:\/\/github\.com\/nucliweb\/webperf-snippets\/blob\/main\/snippets\/Loading\/TTFB-Sub-Parts\.js/)
  assert.match(p, /snippets\/SCHEMA\.md/)
})

test('the prompt tells the agent to run the CLI, not to rewrite the snippet or guess, and to stop on failure', () => {
  const p = prompt('Loading/TTFB')
  assert.match(p, /Do not rewrite the snippet/)
  assert.match(p, /estimate the result/)
  assert.match(p, /stop and report/i)
  assert.match(p, /Ask for the URL/)
})

test('a one-shot prompt has no interaction script', () => {
  assert.doesNotMatch(prompt('Loading/TTFB'), /--interact-script/)
})

test('a tracking prompt runs a scroll script and no clicks', () => {
  const p = prompt('Interaction/LongTask')
  assert.match(p, /--snippet LongTask --interact-script interactions\.json --json/)
  assert.match(p, /"action": "scroll"/)
  assert.doesNotMatch(p, /"action": "click"/)
})

test('a prompt that needs input asks for real selectors and ends the script with a wait', () => {
  const p = prompt('CoreWebVitals/INP')
  assert.match(p, /--snippet INP --interact-script interactions\.json --json/)
  assert.match(p, /"action": "click"/)
  assert.match(p, /selectors? (that exist|of the page)/i)
  const steps = JSON.parse(p.match(/```json\n([\s\S]*?)```/)[1]).interactions
  assert.equal(steps.at(-1).action, 'wait')
})

test('the Back-Forward-Cache prompt says the result is partial and points to DevTools', () => {
  const p = prompt('Loading/Back-Forward-Cache')
  assert.match(p, /not a guarantee/)
  assert.match(p, /Application.*Back\/forward cache/)
})

test('every prompt names a snippet the CLI resolves to the same path', () => {
  for (const path of allSnippets) {
    const p = prompt(path)
    if (p === null) continue
    const name = p.match(/--snippet (\S+)/)[1]
    assert.equal(resolveSnippetName(name), path, path)
  }
})

test('the CLI version is the one in cli/package.json', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'cli', 'package.json'), 'utf8'))
  assert.equal(cliVersion(), pkg.version)
})

test('the pinned Playwright is the one the repository tests the CLI with', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))
  const installed = lock.packages['node_modules/playwright'].version
  assert.ok(installed.startsWith(`${PLAYWRIGHT}.`), `package-lock has ${installed}, the prompt pins ${PLAYWRIGHT}`)
})

test('the prompt does not assume fields or sections that only some snippets have', () => {
  const p = prompt('CoreWebVitals/INP')
  assert.match(p, /`issues`, when present/)
  assert.match(p, /`corsLimitedAnalysis: true`, when present/)
  assert.doesNotMatch(p, /Understanding the results/)
})

test('the prompt asks for a next snippet only when the documentation links one', () => {
  assert.match(prompt('Loading/TTFB'), /If the documentation links a snippet/)
})

test('a prompt that needs input allows a page with only clicks', () => {
  assert.match(prompt('CoreWebVitals/INP'), /no text field, use only clicks/)
})
