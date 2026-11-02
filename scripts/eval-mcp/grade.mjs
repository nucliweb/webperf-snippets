// Grades a run of the MCP evals from its transcript (parseTranscript of eval-prompts): whether the
// report gets the diagnosis right, which tools the agent called and in what order when the case says
// which ones are right (expect.tools), and how the agent measured. A measurement is a published snippet run
// through the webperf MCP server, a published script given to evaluate_script of Chrome DevTools MCP
// (as code or by path), code the agent wrote itself, or another tool such as a performance trace.

import { injectionChecks } from '../eval-prompts/grade.mjs'

export { parseTranscript } from '../eval-prompts/grade.mjs'

const WEBPERF = 'mcp__webperf__'
const DEVTOOLS = 'mcp__chrome-devtools__'
// The tools of the webperf server that run snippets, and the argument that names what they run
const WEBPERF_RUNS = { run_snippet: 'snippet', run_workflow: 'workflow', open_page: 'track' }
// Tools that only move around the page, which do not measure anything by themselves
const NAVIGATION = new Set(['navigate_page', 'new_page', 'list_pages', 'select_page', 'close_page', 'take_snapshot', 'take_screenshot', 'wait_for', 'resize_page'])

const nameOf = (catalog, name) => catalog.find((path) => path.split('/')[1] === name)?.split('/')[1]

// The published snippet an evaluate_script call runs, from the script:"Name" of its result object or
// the scripts/<Name>.js path of a skill script
function publishedScript(input, catalog) {
  if (typeof input.function === 'string') {
    const name = input.function.match(/\bscript:\s*["']([\w-]+)["']/)?.[1]
    const found = name && nameOf(catalog, name)
    return found ? { snippet: found, sent: 'code', bytes: input.function.length } : null
  }
  if (typeof input.sourcePath === 'string') {
    const found = nameOf(catalog, input.sourcePath.match(/\/scripts\/([\w-]+)\.js$/)?.[1])
    return found ? { snippet: found, sent: 'path', bytes: 0 } : null
  }
  return null
}

export function snippetRuns(transcript, catalog) {
  const runs = []
  for (const { name, input } of transcript.calls) {
    if (name.startsWith(WEBPERF)) {
      const tool = name.slice(WEBPERF.length)
      const arg = WEBPERF_RUNS[tool]
      if (!arg) continue
      for (const snippet of [input[arg]].flat()) runs.push({ via: tool, snippet })
    } else if (name === `${DEVTOOLS}evaluate_script`) {
      const published = publishedScript(input, catalog)
      if (published) runs.push({ via: 'evaluate_script', ...published })
    }
  }
  return runs
}

// The calls of the run in order, each named by its tool: the tools of the webperf server without their
// prefix (open_page), and any other tool by its whole name (Bash). `webperf` tells them apart, since a
// model can call a tool that does not exist with the short name of a real one (interact).
export function toolCalls(transcript) {
  return transcript.calls.map(({ name, input, output }) => ({
    tool: name.startsWith(WEBPERF) ? name.slice(WEBPERF.length) : name,
    webperf: name.startsWith(WEBPERF),
    input: input ?? {},
    output: output ?? '',
  }))
}

// Whether the steps, tools of the webperf server, appear in the calls in order, with any other calls in
// between. A step is { tool, match, label }: `match` ({ input, output }) narrows which calls of the tool
// count, and `label` names the step in `missing`, the first step not found after the previous one.
// Taking the first call that matches each step is enough for a subsequence: a later one can only leave
// fewer calls for the rest.
export function followsOrder(calls, steps) {
  let at = 0
  for (const step of steps) {
    const found = calls.findIndex((c, i) => i >= at && c.webperf && c.tool === step.tool && (!step.match || step.match(c)))
    if (found === -1) return { pass: false, missing: step.label ?? step.tool }
    at = found + 1
  }
  return { pass: true, missing: null }
}

// expect.tools: { orders, avoid }. The calls must follow one of `orders` (each a list of steps for
// followsOrder), and call none of the tools in `avoid`.
export function toolChecks({ orders = [], avoid }, transcript) {
  const calls = toolCalls(transcript)
  const results = orders.map((steps) => followsOrder(calls, steps))
  const checks = [
    {
      id: 'tool-order',
      pass: results.some((r) => r.pass),
      detail: { called: calls.map((c) => c.tool), missing: results.every((r) => !r.pass) ? results.map((r) => r.missing) : [] },
    },
  ]
  if (avoid) {
    const called = [...new Set(calls.map((c) => c.tool).filter((tool) => avoid.includes(tool)))]
    checks.push({ id: 'avoided-tools', pass: called.length === 0, detail: called })
  }
  return checks
}

// The ids of the tool choice checks, which the summary counts apart from the diagnosis
export const TOOL_CHECKS = new Set(['tool-order', 'avoided-tools'])

// ctx.injectedFile: whether the file a hostile page asks for exists after the run (expect.injection)
export function gradeRun(evalCase, transcript, catalog, ctx = {}) {
  const checks = (evalCase.expect.diagnosis ?? []).map(({ id, pattern }) => ({ id, pass: pattern.test(transcript.report) }))

  const published = snippetRuns(transcript, catalog).length
  const evaluations = transcript.calls.filter((c) => c.name === `${DEVTOOLS}evaluate_script`).length
  const devtoolsPublished = snippetRuns(transcript, catalog).filter((r) => r.via === 'evaluate_script').length
  const ownCode = evaluations - devtoolsPublished
  const otherTools = transcript.calls
    .filter((c) => c.name.startsWith(DEVTOOLS) && c.name !== `${DEVTOOLS}evaluate_script`)
    .map((c) => c.name.slice(DEVTOOLS.length))
  const measuring = otherTools.filter((tool) => !NAVIGATION.has(tool))
  // The field data of CrUX is a measurement too, of real users instead of the lab
  const fieldData = transcript.calls.filter((c) => c.name === `${WEBPERF}get_crux`).length
  checks.push({
    id: 'measured',
    pass: published + ownCode + fieldData + measuring.length > 0,
    detail: { published, ownCode, fieldData, otherTools: [...new Set(otherTools)] },
  })
  if (evalCase.expect.injection) checks.push(...injectionChecks(transcript, ctx))
  if (evalCase.expect.tools) checks.push(...toolChecks(evalCase.expect.tools, transcript))
  return checks
}
