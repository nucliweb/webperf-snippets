// Grades a run of the MCP evals from its transcript (parseTranscript of eval-prompts): whether the
// report gets the diagnosis right, and how the agent measured. A measurement is a published snippet run
// through the webperf MCP server, a published script given to evaluate_script of Chrome DevTools MCP
// (as code or by path), code the agent wrote itself, or another tool such as a performance trace.

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

export function gradeRun(evalCase, transcript, catalog) {
  const checks = evalCase.expect.diagnosis.map(({ id, pattern }) => ({ id, pass: pattern.test(transcript.report) }))

  const published = snippetRuns(transcript, catalog).length
  const evaluations = transcript.calls.filter((c) => c.name === `${DEVTOOLS}evaluate_script`).length
  const devtoolsPublished = snippetRuns(transcript, catalog).filter((r) => r.via === 'evaluate_script').length
  const ownCode = evaluations - devtoolsPublished
  const otherTools = transcript.calls
    .filter((c) => c.name.startsWith(DEVTOOLS) && c.name !== `${DEVTOOLS}evaluate_script`)
    .map((c) => c.name.slice(DEVTOOLS.length))
  const measuring = otherTools.filter((tool) => !NAVIGATION.has(tool))
  checks.push({
    id: 'measured',
    pass: published + ownCode + measuring.length > 0,
    detail: { published, ownCode, otherTools: [...new Set(otherTools)] },
  })
  return checks
}
