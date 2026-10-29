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

// The full results of the last runs of an MCP connection, by run id, so get_details answers with the
// values the summary came from: measuring again would give other ones
export function createRuns({ max = 20 } = {}) {
  const runs = new Map();

  function keep(results) {
    const runId = randomUUID();
    runs.set(runId, results);
    // A Map keeps the order of insertion, so the first key is the oldest run
    if (runs.size > max) runs.delete(runs.keys().next().value);
    return runId;
  }

  function get(runId, snippet) {
    const results = runs.get(runId);
    if (!results) {
      throw new RunError(`Unknown runId ${runId}: this server keeps the last ${max} runs of the connection. Run the tool again for a new one.`);
    }
    const result = results.find((r) => r.id === snippet) ?? results.find((r) => r.script === snippet);
    if (!result) throw new RunError(`${snippet} is not in run ${runId}, which has: ${results.map((r) => r.id).join(", ")}.`);
    return result;
  }

  return { keep, get };
}
