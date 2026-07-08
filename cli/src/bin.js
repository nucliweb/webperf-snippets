#!/usr/bin/env node
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

const WORKFLOWS = {
  "core-web-vitals": cwvWorkflow,
  audit: auditWorkflow,
  loading: loadingWorkflow,
};

const SNIPPET_ALIASES = {
  LCP: "CoreWebVitals/LCP",
  CLS: "CoreWebVitals/CLS",
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
                        Aliases: LCP, CLS, LCP-Subparts, fonts,
                                 render-blocking, resource-hints, preload-scripts,
                                 priority-hints, critical-css, ttfb,
                                 script-parties, script-loading,
                                 lazy-atf, lazy-conflict, eager-below-fold
  --json                Output JSON instead of formatted text
  --markdown            Output GitHub-renderable markdown (for PR comments)
  --viewport <preset>   Viewport preset: mobile (default), tablet, desktop
  --wait <ms>           Post-load wait before evaluating (default: 3000)
  --evaluate-timeout <ms> Post-load evaluation timeout (default: 10000)
  --budget-lcp <ms>     Exit 1 if LCP exceeds this value
  --budget-cls <score>  Exit 1 if CLS exceeds this value
  --interact-script <path>  JSON file with interactions to run before evaluation
                            Actions: scroll, click, hover, type, wait
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
        "evaluate-timeout": { type: "string" },
        "budget-lcp": { type: "string" },
        "budget-cls": { type: "string" },
        viewport: { type: "string" },
        "interact-script": { type: "string" },
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
  const evaluateTimeout = values["evaluate-timeout"] ? Number(values["evaluate-timeout"]) : 10000;
  const viewportName = values.viewport ?? "mobile";
  const viewport = VIEWPORT_PRESETS[viewportName];
  if (!viewport) {
    fail(`Unknown viewport preset: "${viewportName}". Choose from: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`);
  }

  const interactScript = values["interact-script"];

  let payload;
  if (values.snippet) {
    const items = buildSnippetItem(values);
    payload = await runSnippets({ url, items, waitMs, evaluateTimeout, headless: !values.headed, viewport, interactScript });
  } else {
    const workflowName = values.workflow ?? "core-web-vitals";
    const workflow = WORKFLOWS[workflowName];
    if (!workflow) fail(`Unknown workflow: ${workflowName}`);
    payload = await runMeasurement({ url, workflow, rules: RULES, waitMs, evaluateTimeout, headless: !values.headed, viewport, interactScript });
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
