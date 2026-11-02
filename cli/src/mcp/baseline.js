import { loadBaseline, compareRun, parseThreshold, thresholdsWith } from "../baseline.js";
import { describeRegressions } from "../reporters/baseline-view.js";

// The baseline of run_snippet and run_workflow, as --baseline of the CLI: the runId of an earlier run of
// the connection, or the path of a page the CLI wrote with --json. The comparison is the one of the CLI
// (baseline.js), so both give the same verdict for the same two pages.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read and checked before the page loads, as the CLI does before the browser opens: a wrong baseline
// fails at once. Throws an error whose message says what to do.
export function prepareBaseline({ baseline, thresholds = [] }, runs) {
  const parsed = thresholdsWith(thresholds.map(parseThreshold));
  // An id of a run the connection no longer keeps is not a file to look for: runs.page says so
  if (runs.has(baseline) || UUID.test(baseline)) return { data: runs.page(baseline), source: { runId: baseline }, thresholds: parsed };
  const { kind, data } = loadBaseline(baseline);
  if (kind === "matrix") throw new Error(`${baseline} is the baseline of a matrix: this server measures one page; compare it with webperf-snippets --matrix <file> --baseline ${baseline}`);
  return { data, source: { file: baseline }, thresholds: parsed };
}

// The page of this run against its baseline: the `baseline` of the JSON of the CLI, named by its runId or
// its file, with the lines --fail-on-regression would print for it
export function compareWithBaseline({ data, source, thresholds }, current) {
  const { file, ...comparison } = compareRun(data, current, { file: source.file, thresholds });
  return { ...source, ...comparison, regressions: describeRegressions(comparison) };
}
