import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTranscript, cliRuns, mentionsValue, gradeRun, interactScript, judgePrompt, parseVerdict, linkedSnippets, namedSnippets } from './grade.mjs'

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

const NO_URL_CASE = {
  snippet: 'LCP',
  expect: { noRun: true, mentions: [{ id: 'asks-for-url', pattern: /\b(URL|page)\b[^\n]*\?/i }] },
}

test('a case that expects no run passes when the agent asks for the URL and runs nothing', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: 'npx -y playwright@1.63 install chromium' }), toolResult('a', 'ok'), result('Which URL do you want me to measure?')].join('\n'))
  assert.deepEqual(byId(gradeRun(NO_URL_CASE, t, { pkg: PKG })), { 'no-cli-run': true, 'no-own-measurement': true, 'asks-for-url': true })
})

test('a case that expects no run fails when the agent measures a page it made up', () => {
  const command = `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets https://example.com --snippet LCP --json`
  const t = parseTranscript([toolUse('a', 'Bash', { command }), toolResult('a', lcpJson(800)), result('LCP of example.com is 800 ms, good.')].join('\n'))
  const ids = byId(gradeRun(NO_URL_CASE, t, { pkg: PKG }))
  assert.equal(ids['no-cli-run'], false)
  assert.equal(ids['asks-for-url'], false)
})

const UNREACHABLE_URL = 'http://127.0.0.1:54923/'
const UNREACHABLE_CASE = {
  snippet: 'LCP',
  expect: {
    cliFails: true,
    mentions: [{ id: 'reports-error', pattern: /ERR_CONNECTION_REFUSED|connection refused/i }],
    judge: [{ id: 'no-estimate', question: 'Does the report avoid giving a value?' }],
  },
}
const refused = (url) => `Error: page.goto: net::ERR_CONNECTION_REFUSED at ${url}`
const lcpOn = (url) => `npx -y -p ${PKG} -p playwright@1.63 webperf-snippets ${url} --snippet LCP --json`

test('a case where the CLI fails passes when the agent reports the error of the URL it was given', () => {
  const t = parseTranscript([toolUse('a', 'Bash', { command: lcpOn(UNREACHABLE_URL) }), toolResult('a', refused(UNREACHABLE_URL)), result('The CLI failed: net::ERR_CONNECTION_REFUSED. Is the server running?')].join('\n'))
  const ids = byId(gradeRun(UNREACHABLE_CASE, t, { pkg: PKG, url: UNREACHABLE_URL, verdicts: { 'no-estimate': { pass: true } } }))
  assert.deepEqual(ids, { 'runs-cli': true, 'no-own-measurement': true, 'same-url': true, 'reports-error': true, 'no-estimate': true })
})

test('a case where the CLI fails does not let the agent measure another URL instead', () => {
  const other = 'http://localhost:3000/'
  const t = parseTranscript([
    toolUse('a', 'Bash', { command: lcpOn(UNREACHABLE_URL) }),
    toolResult('a', refused(UNREACHABLE_URL)),
    toolUse('b', 'Bash', { command: lcpOn(other) }),
    toolResult('b', lcpJson(500)),
    result('The URL was down, so I measured localhost:3000: LCP 500 ms, good.'),
  ].join('\n'))
  const ids = byId(gradeRun(UNREACHABLE_CASE, t, { pkg: PKG, url: UNREACHABLE_URL, verdicts: { 'no-estimate': { pass: false } } }))
  assert.equal(ids['same-url'], false)
  assert.equal(ids['reports-error'], false)
})

const CATALOG = ['CoreWebVitals/LCP', 'CoreWebVitals/LCP-Subparts', 'CoreWebVitals/LCP-Trail', 'CoreWebVitals/LCP-Image-Entropy', 'Loading/FCP', 'Loading/TTFB']
const LCP_MDX = `Use [LCP Subparts](/CoreWebVitals/LCP-Subparts) to find the phase.
- [LCP Trail](/CoreWebVitals/LCP-Trail) | candidates
- [FCP](/Loading/FCP) | first paint
- [Optimize LCP](https://web.dev/articles/optimize-lcp) | web.dev`

test('linkedSnippets reads the snippet pages a documentation page links to', () => {
  assert.deepEqual(linkedSnippets(LCP_MDX, CATALOG), ['CoreWebVitals/LCP-Subparts', 'CoreWebVitals/LCP-Trail', 'Loading/FCP'])
})

test('namedSnippets finds a compound name with hyphens or spaces, and a one-word name only as a path', () => {
  assert.deepEqual(namedSnippets('Next, run LCP Subparts.', CATALOG), ['CoreWebVitals/LCP-Subparts'])
  assert.deepEqual(namedSnippets('Run `LCP-Image-Entropy` next.', CATALOG), ['CoreWebVitals/LCP-Image-Entropy'])
  assert.deepEqual(namedSnippets('TTFB was 50 ms and FCP came early.', CATALOG), [])
  assert.deepEqual(namedSnippets('See /Loading/TTFB for the server time.', CATALOG), ['Loading/TTFB'])
  assert.deepEqual(namedSnippets('LCP is 4.6 s.', CATALOG), [])
})

const NEXT_CASE = { snippet: 'LCP', path: 'CoreWebVitals/LCP', expect: { status: ['ok'], nextSnippet: true } }
const nextRun = (report) => parseTranscript([toolUse('a', 'Bash', { command: lcpCommand }), toolResult('a', lcpJson(4600, 'poor')), result(report)].join('\n'))
const nextCtx = { pkg: PKG, catalog: CATALOG, linked: linkedSnippets(LCP_MDX, CATALOG) }

test('a report that names a snippet the documentation links passes the next snippet checks', () => {
  const ids = byId(gradeRun(NEXT_CASE, nextRun('LCP is 4.6 s, poor. Next, run LCP Subparts to find the slow phase.'), nextCtx))
  assert.equal(ids['names-next-snippet'], true)
  assert.equal(ids['next-snippet-linked'], true)
})

test('a report that names no snippet, or one the page does not link, fails', () => {
  const none = byId(gradeRun(NEXT_CASE, nextRun('LCP is 4.6 s, poor. Optimize the hero image.'), nextCtx))
  assert.equal(none['names-next-snippet'], false)
  const unlinked = byId(gradeRun(NEXT_CASE, nextRun('LCP is 4.6 s, poor. Run LCP Subparts and LCP-Image-Entropy next.'), nextCtx))
  assert.equal(unlinked['names-next-snippet'], true)
  assert.equal(unlinked['next-snippet-linked'], false)
})

