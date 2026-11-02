import { randomUUID } from "node:crypto";

// A failure of get_details the model can act on: a run that is not kept, or a snippet it did not run
export class RunError extends Error {}

// What an agent needs from a result to decide what to do next; the rest (details, items, thresholds)
// is in get_details, from the same run
const SUMMARY_FIELDS = ["id", "script", "status", "metric", "value", "unit", "rating", "error", "message", "reason"];
const ISSUE_FIELDS = ["code", "severity", "message", "target"];

const pick = (object, fields) => Object.fromEntries(fields.filter((f) => object[f] !== undefined).map((f) => [f, object[f]]));

export function summarize(result) {
  const summary = pick(result, SUMMARY_FIELDS);
  if (result.issues?.length) summary.issues = result.issues.map((issue) => pick(issue, ISSUE_FIELDS));
  return summary;
}

// About 2,000 tokens. Below it the whole objects cost the agent less than the turn it would spend on
// get_details for what a summary leaves out: in the MCP evals of 2026-10-29, summaries of small results
// made the agent call get_details in 4 of 9 runs, and each turn sent 8 to 12k tokens of context again.
export const FULL_UP_TO_CHARS = 8000;

// The results of a call as the agent asked for them; with auto, whole when they are small, and summaries
// with get_details for the rest when they are large
export function shapeResults(results, detail = "auto", maxFullChars = FULL_UP_TO_CHARS) {
  const full = detail === "full" || (detail === "auto" && JSON.stringify(results).length <= maxFullChars);
  return full ? { detail: "full", results } : { detail: "summary", results: results.map(summarize) };
}

// The full results of the last runs of an MCP connection, by run id, so get_details answers with the
// values the summary came from: measuring again would give other ones. A run of a page load also keeps
// its page (url, navMs, pageErrors, conditions), so a later run can take it as its baseline.
export function createRuns({ max = 20 } = {}) {
  const runs = new Map();
  const unknown = (runId) =>
    new RunError(`Unknown runId ${runId}: this server keeps the last ${max} runs of the connection. Run the tool again for a new one.`);

  function keep(results, page) {
    const runId = randomUUID();
    runs.set(runId, { results, page, at: new Date().toISOString() });
    // A Map keeps the order of insertion, so the first key is the oldest run
    if (runs.size > max) runs.delete(runs.keys().next().value);
    return runId;
  }

  function get(runId, snippet) {
    const run = runs.get(runId);
    if (!run) throw unknown(runId);
    const { results } = run;
    const result = results.find((r) => r.id === snippet) ?? results.find((r) => r.script === snippet);
    if (!result) throw new RunError(`${snippet} is not in run ${runId}, which has: ${results.map((r) => r.id).join(", ")}.`);
    return result;
  }

  // A run as the JSON of the CLI gives a page, which is what a baseline is
  function page(runId) {
    const run = runs.get(runId);
    if (!run) throw unknown(runId);
    if (!run.page) throw new RunError(`Run ${runId} read an open page; a baseline is a run of run_snippet or run_workflow.`);
    return { ...run.page, results: run.results };
  }

  // The runs that can be a baseline, the oldest first, with the number of measurements of each when it
  // has several: the statistics of a comparison need five a side
  const pages = () =>
    [...runs]
      .filter(([, run]) => run.page)
      .map(([runId, { page, at }]) => ({ runId, url: page.url, conditions: page.conditions, at, ...(page.runs ? { runs: page.runs.count } : {}) }));

  // A measurement of several runs keeps the results of the median one, as the JSON of the CLI does
  const medianRun = (runId) => runs.get(runId)?.page?.runs?.medianRun;

  const has = (runId) => runs.has(runId);

  return { keep, get, page, pages, medianRun, has };
}
