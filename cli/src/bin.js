#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadSnippet } from "./load-snippet.js";
import { resolveSnippetName } from "./snippet-names.js";
import { runSnippets, runMeasurement, VIEWPORT_PRESETS } from "./runner.js";
import { WORKFLOWS } from "./workflows/index.js";
import { RULES } from "./decision-tree.js";
import { reportHuman, reportMatrixHuman } from "./reporters/human.js";
import { reportJson } from "./reporters/json.js";
import { reportMarkdown } from "./reporters/markdown.js";
import { cliVersion, reportTo, validateReportUrl } from "./report-to.js";
import { fetchCrux, formFactorFor } from "./crux.js";
import { MissingBrowserError } from "./browser.js";
import { parseHeader } from "./headers.js";
import { NETWORK_PRESETS, parseCpuFactor } from "./throttling.js";
import { parseOwnDomains } from "./own-domains.js";
import { MEDIAN_METRICS, summarizeRuns } from "./runs.js";
import { loadMatrix } from "./matrix.js";
import { blockingErrors } from "./blocking.js";


const USAGE = `webperf-snippets <url> [options]
webperf-snippets --matrix <file> [options]
webperf-snippets mcp

Run curated WebPerf Snippets headlessly via Playwright.

Commands:
  mcp                   Start the MCP server over stdio, for AI agents
                        (claude mcp add webperf -- npx -y webperf-snippets mcp)

Options:
  --workflow <name>     Workflow to run (default: core-web-vitals)
                        Workflows: core-web-vitals, audit, loading, interaction
  --snippet <name>      Run a single snippet by name, alias or Category/Name path
                        Any of the 56 snippets, such as Compression-Audit
                        Aliases: LCP, CLS, INP, LCP-Subparts, fonts,
                                 render-blocking, resource-hints, preload-scripts,
                                 priority-hints, critical-css, ttfb,
                                 script-parties, script-loading,
                                 lazy-atf, lazy-conflict, eager-below-fold
  --json                Output JSON instead of formatted text
  --markdown            Output GitHub-renderable markdown (for PR comments)
  --viewport <preset>   Viewport preset: mobile (default), tablet, desktop
  --wait <ms>           Post-load wait before evaluating (default: 3000)
  --cpu <factor>        Slow the CPU down by this factor, such as 4 (no throttling by default)
  --network <preset>    Throttle the network as DevTools does: fast-4g, slow-4g, 3g
  --budget-lcp <ms>     Exit 1 if LCP exceeds this value
  --budget-cls <score>  Exit 1 if CLS exceeds this value
  --interact-script <path>  JSON file with interactions to run after the load; the
                            Interaction snippets are installed first and read last
                            Actions: scroll, click, hover, type, wait
  --storage-state <path>    Playwright storage state (cookies + localStorage) to
                            measure pages that require authentication
  --header "Name: value"    Request header for the origin of the URL only, such as
                            the token of an access proxy. Repeat it for more headers
  --own-domains <list>      Domains of the site to count as first party, such as its
                            own CDN, comma-separated or repeated
  --runs <n>                Measure the page n times (1 to 9), one after the other, and
                            report the median run
  --matrix <file>           Measure every URL of a JSON file on every device and in every
                            variant it lists, and report a table of the medians
  --median-by <metric>      Metric that picks the median run: LCP, FCP, TTFB, CLS, INP,
                            navMs (default: the first of LCP, FCP, TTFB, navMs measured)
  --crux-key <key>          Add CrUX field data (p75) next to the measured values.
                            Also read from the CRUX_API_KEY environment variable
  --report-to <url>         POST the results to this https URL after the run
                            (without it the CLI makes no external calls)
  --api-key <key>           Sent as "Authorization: Bearer <key>" with --report-to.
                            Prefer the PERF_REVIEWS_API_KEY environment variable
  --verbose             Show all items, even for passing checks
  --headed              Show the browser window (debug)
  -h, --help            Show this help

Examples:
  npx webperf-snippets https://example.com
  npx webperf-snippets https://example.com --workflow audit
  npx webperf-snippets https://example.com --json
  npx webperf-snippets https://example.com --snippet LCP-Subparts
  npx webperf-snippets https://example.com --snippet render-blocking
  npx webperf-snippets https://example.com --snippet fonts
  npx webperf-snippets https://example.com --snippet Compression-Audit
  npx webperf-snippets https://example.com --budget-lcp 2500
  npx webperf-snippets https://example.com --cpu 4 --network slow-4g
  npx webperf-snippets https://example.com --workflow loading --own-domains cdn.example.net
  npx webperf-snippets https://example.com --runs 5 --budget-lcp 2500
  npx webperf-snippets --matrix matrix.json --runs 3 --budget-lcp 2500
  npx webperf-snippets https://example.com --snippet INP --interact-script interactions.json
  npx webperf-snippets https://example.com/dashboard --storage-state auth.json
  npx webperf-snippets https://review.example.com --header "CF-Access-Client-Id: $CF_ID" --header "CF-Access-Client-Secret: $CF_SECRET"
`;

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function buildSnippetItem(values) {
  let path;
  try {
    path = resolveSnippetName(values.snippet);
  } catch (err) {
    fail(err.message);
  }
  return [{ id: values.snippet, path, source: loadSnippet(path) }];
}

// The count given to --runs, or null when it is not a whole number from 1 to 9
function parseRunCount(raw) {
  return /^[1-9]$/.test(raw.trim()) ? Number(raw) : null;
}

function checkBudgets({ results, runs }, values) {
  const violations = [];
  const lcpBudget = values["budget-lcp"] ? Number(values["budget-lcp"]) : null;
  const clsBudget = values["budget-cls"] ? Number(values["budget-cls"]) : null;

  // With several runs the budgets compare the median of each metric, not one sample
  if (runs) {
    const lcp = runs.summary.LCP?.median;
    const cls = runs.summary.CLS?.median;
    if (lcp != null && lcpBudget != null && lcp > lcpBudget) violations.push(`LCP ${lcp}ms exceeds budget ${lcpBudget}ms`);
    if (cls != null && clsBudget != null && cls > clsBudget) violations.push(`CLS ${cls} exceeds budget ${clsBudget}`);
    return violations;
  }

  for (const r of results) {
    if (r.status !== "ok") continue;
    if (r.metric === "LCP" && lcpBudget != null && r.value > lcpBudget) {
      violations.push(`LCP ${r.value}ms exceeds budget ${lcpBudget}ms`);
    }
    if (r.metric === "CLS" && clsBudget != null && r.value > clsBudget) {
      violations.push(`CLS ${r.value} exceeds budget ${clsBudget}`);
    }
  }
  return violations;
}

async function main() {
  // The MCP server only loads its SDK when it is asked for
  if (process.argv[2] === "mcp") {
    const { startStdioServer } = await import("./mcp/stdio.js");
    await startStdioServer();
    return;
  }

  let parsed;
  try {
    parsed = parseArgs({
      options: {
        workflow: { type: "string" },
        snippet: { type: "string" },
        json: { type: "boolean" },
        markdown: { type: "boolean" },
        wait: { type: "string" },
        "budget-lcp": { type: "string" },
        "budget-cls": { type: "string" },
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
        "crux-key": { type: "string" },
        "report-to": { type: "string" },
        "api-key": { type: "string" },
        verbose: { type: "boolean" },
        headed: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    fail(err.message);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const url = positionals[0];
  const matrixPath = values.matrix;
  if (url && matrixPath) fail("Use a URL or --matrix, not both");
  if (!url && !matrixPath) {
    process.stdout.write(USAGE);
    process.exit(2);
  }
  if (matrixPath && values.viewport) fail("--viewport does not apply to --matrix: set the viewport of each device in the file");
  if (matrixPath && values.markdown) fail("--markdown does not support --matrix yet: use the human report or --json");

  const waitMs = values.wait ? Number(values.wait) : 3000;
  const viewportName = values.viewport ?? "mobile";
  const viewport = VIEWPORT_PRESETS[viewportName];
  if (!viewport) {
    fail(`Unknown viewport preset: "${viewportName}". Choose from: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`);
  }

  const cpu = values.cpu != null ? parseCpuFactor(values.cpu) : undefined;
  if (cpu === null) fail(`Invalid CPU factor "${values.cpu}". Use a number of at least 1, such as 4`);
  const network = values.network;
  if (network != null && !NETWORK_PRESETS[network]) {
    fail(`Unknown network preset: "${network}". Choose from: ${Object.keys(NETWORK_PRESETS).join(", ")}`);
  }

  const reportUrl = values["report-to"];
  if (reportUrl) {
    if (matrixPath) fail("--report-to does not support --matrix yet");
    const problem = validateReportUrl(reportUrl);
    if (problem) fail(problem);
  }

  const interactScript = values["interact-script"];
  const storageState = values["storage-state"];
  if (storageState && !existsSync(storageState)) {
    fail(`Storage state file not found: ${storageState}`);
  }

  const headers = {};
  for (const raw of values.header ?? []) {
    const header = parseHeader(raw);
    if (!header) fail(`Invalid header "${raw}". Use --header "Name: value"`);
    headers[header[0]] = header[1];
  }

  const invalidOwnDomains = (values["own-domains"] ?? []).find((raw) => !parseOwnDomains([raw]));
  if (invalidOwnDomains != null) {
    fail(`Invalid --own-domains "${invalidOwnDomains}". Use domains separated by commas, such as cdn.example.net,static.example.org`);
  }
  const ownDomains = values["own-domains"] && parseOwnDomains(values["own-domains"]);

  const runCount = values.runs != null ? parseRunCount(values.runs) : undefined;
  if (runCount === null) fail(`Invalid --runs "${values.runs}". Use a whole number from 1 to 9`);
  const medianBy = values["median-by"];
  if (medianBy != null && !MEDIAN_METRICS.includes(medianBy)) {
    fail(`Unknown --median-by "${medianBy}". Choose from: ${MEDIAN_METRICS.join(", ")}`);
  }
  if (medianBy != null && runCount == null && !matrixPath) fail("--median-by needs --runs");

  // What each page load runs, a snippet or a workflow, under the conditions of the load
  const items = values.snippet ? buildSnippetItem(values) : null;
  const workflow = values.snippet ? null : WORKFLOWS[values.workflow ?? "core-web-vitals"];
  if (!values.snippet && !workflow) fail(`Unknown workflow: ${values.workflow}`);
  const measureWith = (conditions) => {
    const options = { waitMs, headless: !values.headed, interactScript, ...conditions };
    return items ? runSnippets({ ...options, items }) : runMeasurement({ ...options, workflow, rules: RULES });
  };

  if (matrixPath) {
    let matrix;
    try {
      matrix = loadMatrix(matrixPath, { cpu, network, storageState, headers, ownDomains, runs: runCount, medianBy });
    } catch (err) {
      fail(err.message);
    }
    await runMatrix(matrixPath, matrix, measureWith, values);
    return;
  }

  const conditions = { url, viewport, storageState, headers, cpu, network, ownDomains };
  let payload;
  if (runCount == null) {
    payload = await measureWith(conditions);
  } else {
    const median = await measureRuns(() => measureWith(conditions), runCount, medianBy, (i) => `[${i}/${runCount}] ${url} · run ${i}/${runCount}`);
    if (!median.payload) throw new Error(`Every run failed: ${median.errors.join("; ")}`);
    payload = { ...median.payload, runs: median.runs };
  }

  const cruxKey = values["crux-key"] || process.env.CRUX_API_KEY;
  const crux = cruxKey ? await fetchCrux({ url, apiKey: cruxKey, formFactor: formFactorFor(viewportName) }) : undefined;
  if (crux) payload.crux = crux;

  let output;
  if (values.markdown) {
    output = reportMarkdown(payload);
  } else if (values.json) {
    output = reportJson(payload);
  } else {
    output = reportHuman({ ...payload, verbose: values.verbose });
  }
  process.stdout.write(output + "\n");

  if (reportUrl) {
    const outcome = await reportTo({
      url: reportUrl,
      apiKey: values["api-key"] || process.env.PERF_REVIEWS_API_KEY,
      body: {
        url,
        workflow: values.snippet ? null : (values.workflow ?? "core-web-vitals"),
        ...(values.snippet ? { snippet: values.snippet } : {}),
        timestamp: new Date().toISOString(),
        navMs: payload.navMs,
        results: payload.results,
        meta: { viewport: viewportName, waitMs, ...(payload.throttling ? { throttling: payload.throttling } : {}), ...(payload.runs ? { runs: payload.runs } : {}), cli_version: cliVersion },
      },
    });
    if (!outcome.ok) {
      process.stderr.write(`Warning: could not report results to ${new URL(reportUrl).origin} (${outcome.warning})\n`);
    } else if (outcome.regressions.length > 0) {
      process.stderr.write(`Regressions detected:\n${outcome.regressions.map((r) => `  - ${typeof r === "string" ? r : JSON.stringify(r)}`).join("\n")}\n`);
    }
  }

  // Exit codes.
  const violations = checkBudgets(payload, values);
  if (violations.length > 0) {
    if (!values.json) {
      for (const v of violations) process.stderr.write(`Budget violation: ${v}\n`);
    }
    process.exit(1);
  }
  process.exit(blockingErrors(payload.results).length > 0 ? 1 : 0);
}

// Measures `count` runs one after the other, never in parallel: they would compete for the CPU and
// skew the timings. Each run is reported on stderr as it starts, so stdout keeps only the report. A
// run that fails is kept as { error } and left out of the median.
async function measureRuns(measure, count, medianBy, progress) {
  const runs = [];
  for (let i = 1; i <= count; i++) {
    process.stderr.write(`${progress(i)}\n`);
    try {
      runs.push(await measure());
    } catch (err) {
      if (err instanceof MissingBrowserError) throw err;
      runs.push({ error: err.message });
    }
  }
  return summarizeRuns(runs, { medianBy });
}

// Every combination of the matrix, in order, each one `matrix.runs` times. Each combination reports
// its median run, and the exit code follows the same rules as one page, for every combination.
async function runMatrix(matrixPath, matrix, measureWith, values) {
  for (const warning of matrix.warnings) process.stderr.write(`Warning: ${warning}\n`);

  const total = matrix.combinations.length * matrix.runs;
  const width = String(total).length;
  let started = 0;
  const combinations = [];
  for (const c of matrix.combinations) {
    const conditions = { url: c.url, viewport: VIEWPORT_PRESETS[c.viewport], storageState: c.storageState, headers: c.headers, cpu: c.cpu, network: c.network, ownDomains: c.ownDomains };
    const median = await measureRuns(() => measureWith(conditions), matrix.runs, matrix.medianBy, (i) => `[${String(++started).padStart(width)}/${total}] ${c.id} · run ${i}/${matrix.runs}`);
    const identity = { id: c.id, name: c.name, device: c.device, variant: c.variant, url: c.url };
    combinations.push(
      median.payload
        ? { ...identity, ...median.payload, runs: median.runs }
        : { ...identity, status: "error", error: `Every run failed: ${median.errors.join("; ")}`, runs: { count: matrix.runs, failed: matrix.runs } }
    );
  }

  const report = { matrix: matrixPath, runs: matrix.runs, combinations };
  process.stdout.write((values.json ? reportJson(report) : reportMatrixHuman(report)) + "\n");

  const violations = combinations.filter((c) => !c.error).flatMap((c) => checkBudgets(c, values).map((v) => `${v} (${c.id})`));
  if (!values.json) {
    for (const v of violations) process.stderr.write(`Budget violation: ${v}\n`);
  }
  const failed = combinations.some((c) => c.error || blockingErrors(c.results).length > 0);
  process.exit(violations.length > 0 || failed ? 1 : 0);
}

main().catch((err) => {
  // A missing Chromium is a step of the setup, not a bug: the message says what to run, without a stack
  process.stderr.write(err instanceof MissingBrowserError ? `${err.message}\n` : `Error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
