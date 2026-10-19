import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snippetRuns, gradeRun } from './grade.mjs'

const CATALOG = ['CoreWebVitals/LCP', 'CoreWebVitals/LCP-Subparts', 'CoreWebVitals/INP', 'Interaction/Interactions']

const transcript = (calls, report = '') => ({ calls, report, tokens: { input: 1000, output: 100 }, durationMs: 1000, turns: 3 })
const call = (name, input = {}, output = '') => ({ name, input, output })
const failedDiagnosis = (checks) => checks.filter((c) => c.id !== 'measured' && !c.pass).map((c) => c.id).sort()

const LCP_CASE = {
  id: 'lcp-slow-image',
  expect: { diagnosis: [{ id: 'lcp-element', pattern: /hero\.png|<img|\bimage\b/i }, { id: 'slow-phase', pattern: /resource load|load (time|duration)/i }] },
}

test('snippetRuns finds the snippets run through the webperf MCP server', () => {
  const runs = snippetRuns(transcript([call('mcp__webperf__run_snippet', { snippet: 'LCP-Subparts' }), call('mcp__webperf__run_workflow', { workflow: 'core-web-vitals' }), call('mcp__webperf__list_snippets')]), CATALOG)
  assert.deepEqual(runs, [
    { via: 'run_snippet', snippet: 'LCP-Subparts' },
    { via: 'run_workflow', snippet: 'core-web-vitals' },
  ])
})

test('snippetRuns recognizes a published script sent as code to evaluate_script', () => {
  const code = '// snippets/CoreWebVitals/LCP-Subparts.js | sha256:abc\n(async()=>{return{script:"LCP-Subparts",status:"ok"}})()'
  const runs = snippetRuns(transcript([call('mcp__chrome-devtools__evaluate_script', { function: code })]), CATALOG)
  assert.deepEqual(runs, [{ via: 'evaluate_script', snippet: 'LCP-Subparts', sent: 'code', bytes: code.length }])
})

test('snippetRuns recognizes a published script passed by path to evaluate_script', () => {
  const runs = snippetRuns(transcript([call('mcp__chrome-devtools__evaluate_script', { sourcePath: '/x/skills/webperf-core-web-vitals/scripts/LCP.js' })]), CATALOG)
  assert.deepEqual(runs, [{ via: 'evaluate_script', snippet: 'LCP', sent: 'path', bytes: 0 }])
})

test('snippetRuns leaves out code the agent wrote itself', () => {
  const runs = snippetRuns(transcript([call('mcp__chrome-devtools__evaluate_script', { function: '() => performance.getEntriesByType("navigation")' })]), CATALOG)
  assert.deepEqual(runs, [])
})

test('gradeRun passes the diagnosis when the report names the element and the slow phase', () => {
  const checks = gradeRun(LCP_CASE, transcript([], 'The LCP element is the <img> hero.png. Most of the time is resource load time (2.1 s).'), CATALOG)
  assert.deepEqual(failedDiagnosis(checks), [])
})

test('gradeRun fails each part of the diagnosis the report misses', () => {
  const checks = gradeRun(LCP_CASE, transcript([], 'The page has a slow server response.'), CATALOG)
  assert.deepEqual(failedDiagnosis(checks), ['lcp-element', 'slow-phase'])
})

test('gradeRun reports how the agent measured: published snippets, its own code and the other tools', () => {
  const t = transcript([
    call('mcp__chrome-devtools__navigate_page', { url: 'http://x' }),
    call('mcp__chrome-devtools__evaluate_script', { function: '() => 1' }),
    call('mcp__chrome-devtools__evaluate_script', { sourcePath: '/s/scripts/LCP.js' }),
    call('mcp__chrome-devtools__performance_start_trace', {}),
  ])
  const { measured } = Object.fromEntries(gradeRun(LCP_CASE, t, CATALOG).map((c) => [c.id, c]))
  assert.deepEqual(measured.detail, { published: 1, ownCode: 1, otherTools: ['navigate_page', 'performance_start_trace'] })
  assert.equal(measured.pass, true)
})

test('gradeRun fails the measured check when the agent measured nothing', () => {
  const { measured } = Object.fromEntries(gradeRun(LCP_CASE, transcript([], 'LCP is probably the image.'), CATALOG).map((c) => [c.id, c]))
  assert.equal(measured.pass, false)
})
