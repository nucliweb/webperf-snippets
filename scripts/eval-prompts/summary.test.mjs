import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, belowRate, markdownSummary } from './summary.mjs'

const run = (evalCase, checks, tokens = { input: 20000, output: 500 }) => ({
  case: evalCase,
  checks: Object.entries(checks).map(([id, pass]) => ({ id, pass, detail: pass ? '' : `${id} failed` })),
  tokens,
  durationMs: 15000,
})

const RUNS = [
  run('lcp', { 'runs-cli': true, 'reports-value': true }),
  run('lcp', { 'runs-cli': true, 'reports-value': false }),
  run('lcp', { 'runs-cli': true, 'reports-value': true }),
  run('next', { 'names-next-snippet': false }, { input: 26000, output: 800 }),
  run('next', { 'names-next-snippet': true }, { input: 28000, output: 800 }),
  run('next', { 'names-next-snippet': false }, { input: 27000, output: 800 }),
]

test('summarize counts the passes of each check of each case, with the details of the failures', () => {
  const [lcp, next] = summarize(RUNS)
  assert.equal(lcp.case, 'lcp')
  assert.deepEqual(lcp.checks, [
    { id: 'runs-cli', passed: 3, total: 3, details: [] },
    { id: 'reports-value', passed: 2, total: 3, details: ['reports-value failed'] },
  ])
  assert.deepEqual(next.tokens, { input: 27000, output: 800 })
  assert.equal(next.seconds, 15)
})

test('belowRate lists the checks that pass less often than the rate', () => {
  assert.deepEqual(belowRate(summarize(RUNS), 0.66), [{ case: 'next', id: 'names-next-snippet', passed: 1, total: 3 }])
  assert.deepEqual(belowRate(summarize(RUNS), 1).map((c) => c.id), ['reports-value', 'names-next-snippet'])
})

test('markdownSummary gives a table per case and the checks below the rate', () => {
  const md = markdownSummary(summarize(RUNS), 0.66, { pkg: 'webperf-snippets@0.4.1', model: 'sonnet' })
  assert.match(md, /webperf-snippets@0\.4\.1/)
  assert.match(md, /\| `reports-value` \| 2\/3 \|/)
  assert.match(md, /### next \(27\.0k tokens in, 0\.8k out, 15 s\)/)
  assert.match(md, /Below 66 %: `next` `names-next-snippet` \(1\/3\)/)
})

test('markdownSummary says so when every check reaches the rate', () => {
  assert.match(markdownSummary(summarize(RUNS.slice(0, 3)), 0.66, { pkg: 'p', model: 'm' }), /Every check passes at least 66 %/)
})
