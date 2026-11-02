import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, markdownSummary } from './summary.mjs'

const runOf = (arm, n, { pass = true, input = 1000, output = 100, turns = 5, durationMs = 10000, snippetRuns = [], ownCode = 0 } = {}) => ({
  arm, case: 'lcp', run: n,
  checks: [{ id: 'lcp-element', pass }, { id: 'slow-phase', pass: true }, { id: 'measured', pass: true, detail: { published: snippetRuns.length, ownCode, otherTools: [] } }],
  tokens: { input, output }, turns, durationMs, snippetRuns,
})

test('summarize groups by case and arm, counts correct diagnoses and takes the medians', () => {
  const [row] = summarize([
    runOf('webperf', 1, { input: 1000 }),
    runOf('webperf', 2, { input: 3000, pass: false }),
    runOf('webperf', 3, { input: 2000 }),
  ])
  assert.deepEqual(row, {
    case: 'lcp', arm: 'webperf', runs: 3, diagnosis: 2,
    medianInput: 2000, medianOutput: 100, medianTurns: 5, medianSeconds: 10,
    published: 0, ownCode: 0, sentCodeBytes: 0, tools: null,
  })
})

test('summarize counts the runs that chose the right tools apart from the diagnosis', () => {
  const withTools = (n, order, avoided = true) => {
    const run = runOf('webperf', n)
    return { ...run, checks: [...run.checks, { id: 'tool-order', pass: order }, { id: 'avoided-tools', pass: avoided }] }
  }
  const [row] = summarize([withTools(1, true), withTools(2, false), withTools(3, true, false)])
  assert.equal(row.diagnosis, 3)
  assert.equal(row.tools, 1)
  const md = markdownSummary([row], { model: 'sonnet', repeat: 3, devtools: 'chrome-devtools-mcp@1.11.0' })
  assert.match(md, /\| lcp \| webperf \| 3\/3 \| 1\/3 \|/)
  assert.match(markdownSummary(summarize([runOf('webperf', 1)]), { model: 'sonnet', repeat: 1, devtools: 'x' }), /\| lcp \| webperf \| 1\/1 \| - \|/)
})

test('summarize counts the runs with published snippets, the own code and the script bytes sent', () => {
  const [row] = summarize([
    runOf('devtools-skill', 1, { snippetRuns: [{ via: 'evaluate_script', sent: 'code', bytes: 9000 }], ownCode: 1 }),
    runOf('devtools-skill', 2, { snippetRuns: [{ via: 'evaluate_script', sent: 'path', bytes: 0 }] }),
  ])
  assert.equal(row.published, 2)
  assert.equal(row.ownCode, 1)
  assert.equal(row.sentCodeBytes, 9000)
})

test('markdownSummary writes one row per case and arm', () => {
  const md = markdownSummary(summarize([runOf('webperf', 1), runOf('devtools', 1)]), { model: 'sonnet', repeat: 1, devtools: 'chrome-devtools-mcp@1.11.0' })
  assert.match(md, /\| lcp \| webperf \| 1\/1 \|/)
  assert.match(md, /\| lcp \| devtools \| 1\/1 \|/)
  assert.match(md, /chrome-devtools-mcp@1\.11\.0/)
})
