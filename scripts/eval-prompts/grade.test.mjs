import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTranscript, cliRuns, mentionsValue, gradeRun, interactScript, judgePrompt, parseVerdict } from './grade.mjs'

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

test('interactScript finds the file the agent passed to the CLI, wherever it saved it', () => {
  const run = (command) => parseTranscript([toolUse('a', 'Bash', { command }), toolResult('a', '{}')].join('\n'))
  const cli = 'npx -y -p p webperf-snippets http://x --snippet INP'
  assert.equal(interactScript(run(`${cli} --interact-script /tmp/wps/interactions.json --json`), 'INP', '/work'), '/tmp/wps/interactions.json')
  assert.equal(interactScript(run(`${cli} --interact-script interactions.json --json`), 'INP', '/work'), '/work/interactions.json')
  assert.equal(interactScript(run(`${cli} --interact-script "my steps.json" --json`), 'INP', '/work'), '/work/my steps.json')
  assert.equal(interactScript(run(`cd /tmp/wps && ${cli} --interact-script interactions.json --json`), 'INP', '/work'), '/tmp/wps/interactions.json')
  assert.equal(interactScript(run(`cd steps; ${cli} --interact-script interactions.json --json`), 'INP', '/work'), '/work/steps/interactions.json')
  assert.equal(interactScript(run(`${cli} --json`), 'INP', '/work'), null)
})

test('mentionsValue accepts milliseconds and seconds', () => {
  assert.ok(mentionsValue('LCP is 36 ms, good', 36))
  assert.ok(mentionsValue('LCP: 36ms', 36))
  assert.ok(mentionsValue('LCP is 2.45 s', 2448))
  assert.ok(mentionsValue('LCP is 2,448 ms', 2448))
  assert.ok(!mentionsValue('LCP is 360 ms', 36))
})

test('mentionsValue reads a score with the decimals the report uses, from two on', () => {
  assert.ok(mentionsValue('CLS is 0.7606 (poor)', 0.7606, 'score'))
  assert.ok(mentionsValue('CLS is 0.76, poor', 0.7606, 'score'))
  assert.ok(!mentionsValue('CLS is 0.8, poor', 0.7606, 'score'))
  assert.ok(!mentionsValue('CLS is 0.25', 0.7606, 'score'))
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

test('a score result is checked against its reference and in the report without a time unit', () => {
  const clsCase = { snippet: 'Layout-Shift-Loading-and-Interaction', interactive: true, expect: { status: ['ok'], reference: { value: 0.7606, tolerance: 0.05 } } }
  const clsJson = JSON.stringify({ results: [{ id: 'Layout-Shift-Loading-and-Interaction', status: 'ok', value: 0.7606, unit: 'score', rating: 'poor', details: { countedShifts: 3 } }] })
  const command = `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets http://localhost/x --snippet Layout-Shift-Loading-and-Interaction --interact-script interactions.json --json`
  const t = parseTranscript([toolUse('a', 'Bash', { command }), toolResult('a', clsJson), result('CLS is 0.76, poor: three promo blocks push the text down.')].join('\n'))
  const interactions = { interactions: [{ action: 'scroll', y: 600 }, { action: 'wait', ms: 1000 }] }
  const ids = byId(gradeRun(clsCase, t, { pkg: PKG, interactions, missingSelectors: [] }))
  assert.equal(ids['matches-reference'], true)
  assert.equal(ids['reports-value'], true)
  assert.equal(ids['reports-rating'], true)
})

const BFCACHE_CASE = {
  snippet: 'Back-Forward-Cache',
  expect: {
    status: ['ok'],
    details: { eligibility: 'no-blockers-detected' },
    mentions: [{ id: 'points-to-devtools', pattern: /DevTools[\s\S]*back[\s/-]*forward cache|back[\s/-]*forward cache[\s\S]*DevTools/i }],
    judge: [{ id: 'no-eligibility-claim', question: 'Does the report avoid saying that the page is eligible?' }],
  },
}
const bfcacheRun = (details, report) => {
  const command = `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets http://localhost/x --snippet Back-Forward-Cache --json`
  const json = JSON.stringify({ results: [{ id: 'Back-Forward-Cache', status: 'ok', details, issues: [] }] })
  return parseTranscript([toolUse('a', 'Bash', { command }), toolResult('a', json), result(report)].join('\n'))
}

test('the details of the result and the mentions of the report are checked as the case expects', () => {
  const good = bfcacheRun({ eligibility: 'no-blockers-detected' }, 'No blockers on load. For the full test, use Chrome DevTools, Application, Back/forward cache.')
  const ids = byId(gradeRun(BFCACHE_CASE, good, { pkg: PKG, verdicts: { 'no-eligibility-claim': { pass: true } } }))
  assert.equal(ids['matches-details'], true)
  assert.equal(ids['points-to-devtools'], true)
  assert.equal(ids['no-eligibility-claim'], true)

  const bad = bfcacheRun({ eligibility: 'blocked' }, 'The page is eligible for the bfcache.')
  const badIds = byId(gradeRun(BFCACHE_CASE, bad, { pkg: PKG, verdicts: { 'no-eligibility-claim': { pass: false } } }))
  assert.equal(badIds['matches-details'], false)
  assert.equal(badIds['points-to-devtools'], false)
  assert.equal(badIds['no-eligibility-claim'], false)
})

test('a judged check without a verdict fails', () => {
  const t = bfcacheRun({ eligibility: 'no-blockers-detected' }, 'Use DevTools, Back/forward cache.')
  assert.equal(byId(gradeRun(BFCACHE_CASE, t, { pkg: PKG }))['no-eligibility-claim'], false)
})

test('judgePrompt gives the judge the question, the CLI result and the report', () => {
  const prompt = judgePrompt('Does it hedge?', { status: 'ok', details: { eligibility: 'no-blockers-detected' } }, 'The report')
  assert.match(prompt, /Does it hedge\?/)
  assert.match(prompt, /no-blockers-detected/)
  assert.match(prompt, /The report/)
  assert.match(prompt, /PASS or FAIL/)
})

test('parseVerdict reads the first line and keeps the reason', () => {
  assert.deepEqual(parseVerdict('PASS\nIt says the result is partial.'), { pass: true, reason: 'It says the result is partial.' })
  assert.deepEqual(parseVerdict('FAIL: it calls the page eligible'), { pass: false, reason: 'it calls the page eligible' })
  assert.equal(parseVerdict('I think so').pass, false)
})
