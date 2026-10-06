import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTranscript, cliRuns, mentionsValue, gradeRun } from './grade.mjs'

// stream-json lines as `claude -p --output-format stream-json` prints them
const toolUse = (id, name, input) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
const toolResult = (id, content) =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } })
const usage = { input_tokens: 6, cache_creation_input_tokens: 4000, cache_read_input_tokens: 18000, output_tokens: 567 }
const result = (text) => JSON.stringify({ type: 'result', result: text, usage, total_cost_usd: 0.12, duration_ms: 30000, num_turns: 5 })

const PKG = 'webperf-snippets@0.4.1'
const lcpJson = (value, rating = 'good') =>
  JSON.stringify({ url: 'http://localhost/x', results: [{ id: 'LCP', script: 'LCP', status: 'ok', value, unit: 'ms', rating }] }, null, 2)
const lcpCommand = `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets http://localhost/x --snippet LCP --json`

const LCP_CASE = { snippet: 'LCP', expect: { status: ['ok'], reference: { value: 40, tolerance: 200 } } }

test('parseTranscript pairs each tool call with its output and keeps the final report', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: 'ls' }), toolResult('a', 'file.txt'), result('Done')].join('\n'))
  assert.deepEqual(t.calls, [{ name: 'Bash', input: { command: 'ls' }, output: 'file.txt' }])
  assert.equal(t.report, 'Done')
})

test('parseTranscript counts the input tokens with the cached ones, and keeps the API cost apart', () => {
  const t = parseTranscript(result('Done'))
  assert.deepEqual(t.tokens, { input: 22006, output: 567 })
  assert.equal(t.apiCostUsd, 0.12)
})

test('parseTranscript joins the text blocks of a tool output', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: 'ls' }), toolResult('a', [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }])].join('\n'))
  assert.equal(t.calls[0].output, 'one\ntwo')
})

test('cliRuns reads the JSON of a run even after npx warnings', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: lcpCommand }), toolResult('a', `npm warn exec something\n${lcpJson(36)}`)].join('\n'))
  const [run] = cliRuns(t, 'LCP')
  assert.equal(run.result.value, 36)
})

test('cliRuns ignores the install of Chromium and other commands', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: 'npx -y playwright@1.63 install chromium' }), toolResult('a', 'ok')].join('\n'))
  assert.deepEqual(cliRuns(t, 'LCP'), [])
})

test('mentionsValue accepts milliseconds and seconds', () => {
  assert.ok(mentionsValue('LCP is 36 ms, good', 36))
  assert.ok(mentionsValue('LCP: 36ms', 36))
  assert.ok(mentionsValue('LCP is 2.45 s', 2448))
  assert.ok(mentionsValue('LCP is 2,448 ms', 2448))
  assert.ok(!mentionsValue('LCP is 360 ms', 36))
})

const run = (lines) => gradeRun(LCP_CASE, parseTranscript(lines.join('\n')), { pkg: PKG })
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.pass]))

test('an agent that runs the CLI and reports its value passes every check', () => {
  const checks = run([toolUse('a', 'Bash', { command: lcpCommand }), toolResult('a', lcpJson(36)), result('LCP is 36 ms (good), the hero image.')])
  assert.deepEqual(byId(checks), {
    'runs-cli': true,
    'no-own-measurement': true,
    'cli-result': true,
    'matches-reference': true,
    'reports-value': true,
    'reports-rating': true,
  })
})

test('a run without the pinned Playwright does not count as running the CLI', () => {
  const checks = run([toolUse('a', 'Bash', { command: `npx -y ${PKG} http://localhost/x --snippet LCP --json` }), toolResult('a', lcpJson(36)), result('36 ms good')])
  assert.equal(byId(checks)['runs-cli'], false)
})

test('measuring with its own observer fails, even if the CLI ran too', () => {
  const checks = run([
    toolUse('a', 'Write', { file_path: '/tmp/m.js', content: 'new PerformanceObserver(() => {})' }),
    toolUse('b', 'Bash', { command: lcpCommand }),
    toolResult('b', lcpJson(36)),
    result('36 ms good'),
  ])
  assert.equal(byId(checks)['no-own-measurement'], false)
})

test('a report with another value or rating fails', () => {
  const checks = run([toolUse('a', 'Bash', { command: lcpCommand }), toolResult('a', lcpJson(36)), result('LCP is about 1.2 s, needs improvement')])
  assert.equal(byId(checks)['reports-value'], false)
  assert.equal(byId(checks)['reports-rating'], false)
})

test('a value far from the reference fails, which points to another page or snippet', () => {
  const checks = run([toolUse('a', 'Bash', { command: lcpCommand }), toolResult('a', lcpJson(3000, 'needs-improvement')), result('3000 ms needs improvement')])
  assert.equal(byId(checks)['matches-reference'], false)
})

test('the checks of the interactions file look at the file the agent left', () => {
  const inpCase = {
    snippet: 'INP',
    interactive: true,
    expect: { status: ['ok', 'tracking'], noTyping: true, minInteractions: 1 },
  }
  const inpJson = JSON.stringify({ results: [{ id: 'INP', status: 'ok', value: 224, rating: 'needs-improvement', details: { totalInteractions: 2 } }] })
  const command = `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets http://localhost/x --snippet INP --interact-script interactions.json --json`
  const t = parseTranscript([toolUse('a', 'Bash', { command }), toolResult('a', inpJson), result('INP 224 ms, needs improvement')].join('\n'))
  const interactions = { interactions: [{ action: 'click', selector: '#load-more' }, { action: 'type', selector: 'input', text: 'x' }] }
  const checks = gradeRun(inpCase, t, { pkg: PKG, interactions, missingSelectors: ['input'] })
  const ids = byId(checks)
  assert.equal(ids['runs-cli'], true)
  assert.equal(ids['selectors-exist'], false)
  assert.equal(ids['no-typing'], false)
  assert.equal(ids['records-interactions'], true)
})
