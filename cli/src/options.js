import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadSnippet } from "./load-snippet.js";
import { resolveSnippetName } from "./snippet-names.js";
import { VIEWPORT_PRESETS } from "./runner.js";
import { readInteractionScript } from "./interactions.js";
import { WORKFLOWS } from "./workflows/index.js";
import { validateReportUrl } from "./report-to.js";
import { parseHeader } from "./headers.js";
import { NETWORK_PRESETS, parseCpuFactor } from "./throttling.js";
import { parseOwnDomains } from "./own-domains.js";
import { MEDIAN_METRICS } from "./runs.js";
import { loadMatrix } from "./matrix.js";
import { parseFailOn } from "./blocking.js";
import { MEASURED_BY, parseBudgets, unmeasuredMetrics } from "./budgets.js";
import { isHttpUrl } from "./url.js";
import { loadBaseline, parseThreshold, thresholdsWith } from "./baseline.js";
import { parseLiveBaseline } from "./live-baseline.js";
import { USAGE } from "./usage.js";

// What the command line asks for, read and checked before any browser opens. A wrong use of an option
// throws a UsageError with the line to print, which the command answers with exit code 2. The first
// problem wins, in the order the options are checked here.
export class UsageError extends Error {}

function buildSnippetItem(values) {
  let path;
  try {
    path = resolveSnippetName(values.snippet);
  } catch (err) {
    throw new UsageError(err.message);
  }
  return [{ id: values.snippet, path, source: loadSnippet(path) }];
}

// The count given to --runs, or null when it is not a whole number from 1 to 9
function parseRunCount(raw) {
  return /^[1-9]$/.test(raw.trim()) ? Number(raw) : null;
}

// What to run instead, when a budget names a metric the run does not measure
function budgetUsage(metric, run) {
  const workflows = Object.values(WORKFLOWS)
    .filter((w) => w.steps.some((step) => MEASURED_BY[metric].includes(step.path)))
    .map((w) => w.id);
  const instead = [...workflows.map((id) => `--workflow ${id}`), `--snippet ${MEASURED_BY[metric][0].split("/").pop()}`].join(" or ");
  return `--budget-${metric.toLowerCase()} needs a run that measures ${metric}, and ${run} does not. Use ${instead}`;
}

// `args` are the arguments after the command, and `env` the environment that can hold the CrUX key.
// Returns { command: "help" } or { command: "version" }, or the options of a page or of a matrix: the
// values as parseArgs gives them, for the flags that need no check, and everything that does, resolved.
export function parseOptions(args, env = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        workflow: { type: "string" },
        snippet: { type: "string" },
        json: { type: "boolean" },
        markdown: { type: "boolean" },
        wait: { type: "string" },
        "budget-lcp": { type: "string" },
        "budget-fcp": { type: "string" },
        "budget-ttfb": { type: "string" },
        "budget-cls": { type: "string" },
        "budget-inp": { type: "string" },
        viewport: { type: "string" },
        cpu: { type: "string" },
        network: { type: "string" },
        "interact-script": { type: "string" },
        "storage-state": { type: "string" },
        header: { type: "string", multiple: true },
        "own-domains": { type: "string", multiple: true },
        matrix: { type: "string" },
        runs: { type: "string" },
        "median-by": { type: "string" },
        baseline: { type: "string" },
        threshold: { type: "string", multiple: true },
        "fail-on-regression": { type: "boolean" },
        "fail-on-inconclusive": { type: "boolean" },
        "max-runs": { type: "string" },
        "fail-on": { type: "string" },
        "crux-key": { type: "string" },
        "crux-history": { type: "string" },
        "report-to": { type: "string" },
        "api-key": { type: "string" },
        verbose: { type: "boolean" },
        "no-color": { type: "boolean" },
        headed: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    throw new UsageError(err.message);
  }

  const { values, positionals } = parsed;

  if (values.help) return { command: "help" };
  if (values.version) return { command: "version" };

  const url = positionals[0];
  const matrixPath = values.matrix;
  if (url && matrixPath) throw new UsageError("Use a URL or --matrix, not both");
  // To stderr, as every usage error: a pipe or a redirect of stdout gets no usage text as a report
  if (!url && !matrixPath) throw new UsageError(USAGE.trimEnd());
  // Without the URL itself, which can carry a token in its query, as a header can
  if (url && !isHttpUrl(url)) throw new UsageError("The URL must be an http or https URL, such as https://example.com or http://localhost:3000");
  if (matrixPath && values.viewport) throw new UsageError("--viewport does not apply to --matrix: set the viewport of each device in the file");

  if (values.json && values.markdown) throw new UsageError("Use --json or --markdown, not both");

  // Number("") is 0 and Number("abc") is NaN, which the wait takes as no wait: only digits are a wait
  if (values.wait != null && !/^\d+$/.test(values.wait)) {
    throw new UsageError(`Invalid --wait "${values.wait}". Use a number of milliseconds, such as 3000, or 0 for no wait`);
  }
  const waitMs = values.wait != null ? Number(values.wait) : 3000;
  const viewportName = values.viewport ?? "mobile";
  const viewport = VIEWPORT_PRESETS[viewportName];
  if (!viewport) {
    throw new UsageError(`Unknown viewport preset: "${viewportName}". Choose from: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`);
  }

  const cpu = values.cpu != null ? parseCpuFactor(values.cpu) : undefined;
  if (cpu === null) throw new UsageError(`Invalid CPU factor "${values.cpu}". Use a number of at least 1, such as 4`);
  const network = values.network;
  if (network != null && !NETWORK_PRESETS[network]) {
    throw new UsageError(`Unknown network preset: "${network}". Choose from: ${Object.keys(NETWORK_PRESETS).join(", ")}`);
  }

  const reportUrl = values["report-to"];
  if (reportUrl) {
    const problem = validateReportUrl(reportUrl);
    if (problem) throw new UsageError(problem);
  }

  // The steps are read and checked before the browser opens: a wrong file fails at once
  let interactions;
  if (values["interact-script"] != null) {
    try {
      interactions = readInteractionScript(values["interact-script"]);
    } catch (err) {
      throw new UsageError(err.message);
    }
  }
  const storageState = values["storage-state"];
  if (storageState && !existsSync(storageState)) {
    throw new UsageError(`Storage state file not found: ${storageState}`);
  }

  const headers = {};
  for (const [i, raw] of (values.header ?? []).entries()) {
    const header = parseHeader(raw);
    // Without its text: a header usually carries a token, and stderr ends up in the log of a CI job
    if (!header) throw new UsageError(`Invalid --header (number ${i + 1}): use --header "Name: value". Its text is not shown, as it may hold a secret`);
    headers[header[0]] = header[1];
  }

  const invalidOwnDomains = (values["own-domains"] ?? []).find((raw) => !parseOwnDomains([raw]));
  if (invalidOwnDomains != null) {
    throw new UsageError(`Invalid --own-domains "${invalidOwnDomains}". Use domains separated by commas, such as cdn.example.net,static.example.org`);
  }
  const ownDomains = values["own-domains"] && parseOwnDomains(values["own-domains"]);

  const runCount = values.runs != null ? parseRunCount(values.runs) : undefined;
  if (runCount === null) throw new UsageError(`Invalid --runs "${values.runs}". Use a whole number from 1 to 9`);
  const medianBy = values["median-by"];
  if (medianBy != null && !MEDIAN_METRICS.includes(medianBy)) {
    throw new UsageError(`Unknown --median-by "${medianBy}". Choose from: ${MEDIAN_METRICS.join(", ")}`);
  }
  if (medianBy != null && runCount == null && !matrixPath) throw new UsageError("--median-by needs --runs");

  // The field data: the p75 of the last 28 days with a key, and its trend week by week with --crux-history
  const cruxKey = values["crux-key"] || env.CRUX_API_KEY;
  let cruxWeeks;
  if (values["crux-history"] !== undefined) {
    cruxWeeks = /^\d+$/.test(values["crux-history"]) ? Number(values["crux-history"]) : NaN;
    if (!(cruxWeeks >= 1 && cruxWeeks <= 40)) throw new UsageError(`--crux-history takes 1 to 40 weeks, not "${values["crux-history"]}"`);
    if (!cruxKey) throw new UsageError("--crux-history needs a CrUX key: --crux-key or CRUX_API_KEY");
  }

  // The baseline is read and checked before the browser opens: a wrong file fails at once. A URL is a
  // live baseline, measured in this run with the page
  let baseline;
  let thresholds;
  let live;
  let maxRuns;
  try {
    ({ live, maxRuns } = parseLiveBaseline({ baseline: values.baseline, matrix: matrixPath, runs: runCount, maxRuns: values["max-runs"] }));
  } catch (err) {
    throw new UsageError(err.message);
  }
  if (values.baseline) {
    try {
      if (!live) baseline = loadBaseline(values.baseline);
      thresholds = thresholdsWith((values.threshold ?? []).map(parseThreshold));
    } catch (err) {
      throw new UsageError(err.message);
    }
    if (!matrixPath && baseline?.kind === "matrix") throw new UsageError(`${values.baseline} is the baseline of a matrix: compare it with --matrix`);
    if (matrixPath && baseline?.kind === "page") throw new UsageError(`${values.baseline} is the baseline of a page: compare it with a URL, not --matrix`);
  } else {
    if (values.threshold) throw new UsageError("--threshold needs --baseline");
    if (values["fail-on-regression"]) throw new UsageError("--fail-on-regression needs --baseline");
    if (values["fail-on-inconclusive"]) throw new UsageError("--fail-on-inconclusive needs --baseline");
  }

  let failOn;
  try {
    failOn = parseFailOn(values["fail-on"]);
  } catch (err) {
    throw new UsageError(err.message);
  }

  let budgets;
  try {
    budgets = parseBudgets(values);
  } catch (err) {
    throw new UsageError(err.message);
  }

  // What each page load runs, a snippet or a workflow, under the conditions of the load
  const items = values.snippet ? buildSnippetItem(values) : null;
  const workflow = values.snippet ? null : WORKFLOWS[values.workflow ?? "core-web-vitals"];
  if (!values.snippet && !workflow) throw new UsageError(`Unknown workflow: "${values.workflow}". Choose from: ${Object.keys(WORKFLOWS).join(", ")}`);
  // A budget of a metric that no snippet of the run measures could never pass: a usage error
  const [unmeasured] = unmeasuredMetrics(budgets, items ? [items[0].path] : workflow.steps.map((step) => step.path));
  if (unmeasured) throw new UsageError(budgetUsage(unmeasured, items ? `--snippet ${values.snippet}` : `the ${workflow.id} workflow`));

  // The matrix is read and checked with the options of the command line it takes as defaults
  let matrix;
  if (matrixPath) {
    try {
      matrix = loadMatrix(matrixPath, { cpu, network, storageState, headers, ownDomains, runs: runCount, medianBy });
    } catch (err) {
      throw new UsageError(err.message);
    }
  }

  return {
    command: matrixPath ? "matrix" : "page",
    values,
    url,
    matrixPath,
    matrix,
    waitMs,
    viewportName,
    viewport,
    cpu,
    network,
    reportUrl,
    interactions,
    storageState,
    headers,
    ownDomains,
    runCount,
    medianBy,
    cruxKey,
    cruxWeeks,
    baseline,
    thresholds,
    live,
    maxRuns,
    failOn,
    budgets,
    items,
    workflow,
  };
}
