#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadSnippet } from "./load-snippet.js";
import { runSnippets, runMeasurement, VIEWPORT_PRESETS } from "./runner.js";
import { cwvWorkflow } from "./workflows/cwv.js";
import { auditWorkflow } from "./workflows/audit.js";
import { loadingWorkflow } from "./workflows/loading.js";
import { RULES } from "./decision-tree.js";
import { reportHuman } from "./reporters/human.js";
import { reportJson } from "./reporters/json.js";
import { reportMarkdown } from "./reporters/markdown.js";
import { cliVersion, reportTo, validateReportUrl } from "./report-to.js";

const WORKFLOWS = {
  "core-web-vitals": cwvWorkflow,
  audit: auditWorkflow,
  loading: loadingWorkflow,
};

const SNIPPET_ALIASES = {
  LCP: "CoreWebVitals/LCP",
  CLS: "CoreWebVitals/CLS",
  INP: "CoreWebVitals/INP",
  "LCP-Subparts": "CoreWebVitals/LCP-Subparts",
  fonts: "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
  "Fonts-Preloaded-Loaded-and-used-above-the-fold":
    "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
  // Tier 1 — Loading
  "render-blocking": "Loading/Find-render-blocking-resources",
  "Find-render-blocking-resources": "Loading/Find-render-blocking-resources",
  "resource-hints": "Loading/Resource-Hints-Validation",
  "Resource-Hints-Validation": "Loading/Resource-Hints-Validation",
  "preload-scripts": "Loading/Validate-Preload-Async-Defer-Scripts",
  "Validate-Preload-Async-Defer-Scripts": "Loading/Validate-Preload-Async-Defer-Scripts",
  "priority-hints": "Loading/Priority-Hints-Audit",
  "Priority-Hints-Audit": "Loading/Priority-Hints-Audit",
  "critical-css": "Loading/Critical-CSS-Detection",
  "Critical-CSS-Detection": "Loading/Critical-CSS-Detection",
  ttfb: "Loading/TTFB-Sub-Parts",
  "TTFB-Sub-Parts": "Loading/TTFB-Sub-Parts",
  "script-parties": "Loading/First-And-Third-Party-Script-Info",
  "First-And-Third-Party-Script-Info": "Loading/First-And-Third-Party-Script-Info",
  "script-loading": "Loading/Script-Loading",
  "Script-Loading": "Loading/Script-Loading",
  // Tier 2 — Media
  "lazy-atf": "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "Find-Above-The-Fold-Lazy-Loaded-Images": "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "lazy-conflict": "Loading/Find-Images-With-Lazy-and-Fetchpriority",
  "Find-Images-With-Lazy-and-Fetchpriority": "Loading/Find-Images-With-Lazy-and-Fetchpriority",
  "eager-below-fold": "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
  "Find-non-Lazy-Loaded-Images-outside-of-the-viewport":
    "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
};

const USAGE = `webperf-snippets <url> [options]

Run curated WebPerf Snippets headlessly via Playwright.

Options:
  --workflow <name>     Workflow to run (default: core-web-vitals)
                        Workflows: core-web-vitals, audit, loading
  --snippet <name>      Run a single snippet by alias or Category/Name path
                        Aliases: LCP, CLS, INP, LCP-Subparts, fonts,
                                 render-blocking, resource-hints, preload-scripts,
                                 priority-hints, critical-css, ttfb,
                                 script-parties, script-loading,
                                 lazy-atf, lazy-conflict, eager-below-fold
  --json                Output JSON instead of formatted text
  --markdown            Output GitHub-renderable markdown (for PR comments)
  --viewport <preset>   Viewport preset: mobile (default), tablet, desktop
  --wait <ms>           Post-load wait before evaluating (default: 3000)
  --budget-lcp <ms>     Exit 1 if LCP exceeds this value
  --budget-cls <score>  Exit 1 if CLS exceeds this value
  --interact-script <path>  JSON file with interactions to run before evaluation
                            Actions: scroll, click, hover, type, wait
  --storage-state <path>    Playwright storage state (cookies + localStorage) to
                            measure pages that require authentication
  --report-to <url>         POST the results to this https URL after the run
                            (without it the CLI makes no external calls)
  --api-key <key>           Sent as "Authorization: Bearer <key>" with --report-to.
                            Prefer the PERF_REVIEWS_API_KEY environment variable
  --verbose             Show all items, even for passing checks
  --headed              Show the browser window (debug)
  -h, --help            Show this help

Examples:
  npx webperf-snippets https://web.dev
  npx webperf-snippets https://web.dev --workflow audit
  npx webperf-snippets https://web.dev --json
  npx webperf-snippets https://web.dev --snippet LCP-Subparts
  npx webperf-snippets https://web.dev --snippet render-blocking
  npx webperf-snippets https://web.dev --snippet fonts
  npx webperf-snippets https://web.dev --budget-lcp 2500
  npx webperf-snippets https://web.dev --snippet INP --interact-script interactions.json
  npx webperf-snippets https://example.com/dashboard --storage-state auth.json
`;

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function resolveSnippetPath(name) {
  return SNIPPET_ALIASES[name] ?? name;
}

function buildSnippetItem(values) {
  const path = resolveSnippetPath(values.snippet);
  return [{ id: values.snippet, path, source: loadSnippet(path) }];
}

function checkBudgets(results, values) {
  const violations = [];
  const lcpBudget = values["budget-lcp"] ? Number(values["budget-lcp"]) : null;
  const clsBudget = values["budget-cls"] ? Number(values["budget-cls"]) : null;

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
        "interact-script": { type: "string" },
        "storage-state": { type: "string" },
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
  if (!url) {
    process.stdout.write(USAGE);
    process.exit(2);
  }

  const waitMs = values.wait ? Number(values.wait) : 3000;
  const viewportName = values.viewport ?? "mobile";
  const viewport = VIEWPORT_PRESETS[viewportName];
  if (!viewport) {
    fail(`Unknown viewport preset: "${viewportName}". Choose from: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`);
  }

  const reportUrl = values["report-to"];
  if (reportUrl) {
    const problem = validateReportUrl(reportUrl);
    if (problem) fail(problem);
  }

  const interactScript = values["interact-script"];
  const storageState = values["storage-state"];
  if (storageState && !existsSync(storageState)) {
    fail(`Storage state file not found: ${storageState}`);
  }

  let payload;
  if (values.snippet) {
    const items = buildSnippetItem(values);
    payload = await runSnippets({ url, items, waitMs, headless: !values.headed, viewport, interactScript, storageState });
  } else {
    const workflowName = values.workflow ?? "core-web-vitals";
    const workflow = WORKFLOWS[workflowName];
    if (!workflow) fail(`Unknown workflow: ${workflowName}`);
    payload = await runMeasurement({ url, workflow, rules: RULES, waitMs, headless: !values.headed, viewport, interactScript, storageState });
  }

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
        meta: { viewport: viewportName, waitMs, cli_version: cliVersion },
      },
    });
    if (!outcome.ok) {
      process.stderr.write(`Warning: could not report results to ${new URL(reportUrl).origin} (${outcome.warning})\n`);
    } else if (outcome.regressions.length > 0) {
      process.stderr.write(`Regressions detected:\n${outcome.regressions.map((r) => `  - ${typeof r === "string" ? r : JSON.stringify(r)}`).join("\n")}\n`);
    }
  }

  // Exit codes.
  const violations = checkBudgets(payload.results, values);
  if (violations.length > 0) {
    if (!values.json) {
      for (const v of violations) process.stderr.write(`Budget violation: ${v}\n`);
    }
    process.exit(1);
  }

  const anyError = payload.results.some((r) => r.status === "error");
  const anyAuditViolation = payload.results.some(
    (r) => Array.isArray(r.issues) && r.issues.some((i) => i.severity === "error"),
  );
  process.exit(anyError || anyAuditViolation ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
