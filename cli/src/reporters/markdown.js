import { fieldDataView } from "../crux.js";
import { describeThrottling } from "../throttling.js";
import { describeRuns } from "../runs.js";
import { matrixView } from "./matrix-view.js";
import { baselineView } from "./baseline-view.js";

const RATING_ICON = {
  good: "✅",
  "needs-improvement": "⚠️",
  poor: "❌",
};

function formatValue(value, unit) {
  if (unit === "ms") return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
  if (unit === "score") return value.toFixed(4);
  return String(value);
}

function renderMetricRow(r) {
  const value = formatValue(r.value, r.unit);
  const icon = RATING_ICON[r.rating] ?? "·";
  return `| ${r.id} | ${value} | ${icon} ${r.rating} |`;
}

function renderAuditRow(r) {
  const errors = (r.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (r.issues ?? []).filter((i) => i.severity === "warning");
  const icon = errors.length ? "🔴" : warnings.length ? "🟡" : "🟢";
  const label = errors.length ? "fail" : warnings.length ? "warning" : "pass";
  const detail = r.issues?.length ? r.issues.map((i) => i.message).join("; ") : "No issues";
  return `| ${r.id} | ${icon} ${label} | ${detail} |`;
}

function renderErrorRow(r) {
  return `| ${r.id} | ❌ error | ${r.error} |`;
}

function renderSkippedRow(r) {
  return `| ${r.id} | ⏭ skipped | ${r.reason} |`;
}

function renderRow(r) {
  if (r.status === "skipped") return renderSkippedRow(r);
  if (r.status === "error") return renderErrorRow(r);
  if (Array.isArray(r.issues)) return renderAuditRow(r);
  return renderMetricRow(r);
}

function sectionHeader(results) {
  if (results.some((r) => Array.isArray(r.issues))) {
    return ["| Check | Status | Issues |", "|-------|--------|--------|"];
  }
  return ["| Metric | Value | Status |", "|--------|-------|--------|"];
}

function renderSection(title, results) {
  return [
    `### ${title}`,
    ...sectionHeader(results),
    ...results.map(renderRow),
  ].join("\n");
}

function renderFieldData(crux, results) {
  if (crux.unavailable) return [`> Field data: not available (${crux.unavailable})`];
  const { title, rows } = fieldDataView(crux, results);
  return [
    `### ${title}`,
    "| Metric | Field p75 | Status | Synthetic |",
    "|--------|-----------|--------|-----------|",
    ...rows.map((row) => {
      const synthetic = row.synthetic == null ? "n/a" : formatValue(row.synthetic, row.unit);
      return `| ${row.metric} | ${formatValue(row.p75, row.unit)} | ${RATING_ICON[row.rating] ?? "·"} ${row.rating} | ${synthetic} |`;
    }),
  ];
}

// The median, min and max of each metric across the runs
function renderRuns(runs) {
  const lines = ["| Metric | Median | Min | Max |", "|--------|--------|-----|-----|"];
  for (const [metric, { median, min, max, unit }] of Object.entries(runs.summary)) {
    lines.push(`| ${metric} | ${formatValue(median, unit)} | ${formatValue(min, unit)} | ${formatValue(max, unit)} |`);
  }
  return lines;
}

const VERDICT_ICON = { regressed: "❌", improved: "✅", unchanged: "➖", "not measured": "·" };

// The comparison with --baseline. The warnings go in the comment itself: whoever reads the pull
// request does not see the stderr of the CI.
function renderBaseline(comparison) {
  const view = baselineView(comparison);
  const lines = ["", `### Compared with \`${view.file}\``, `> ${view.summary}`];
  for (const warning of view.warnings) lines.push(">", `> ⚠️ ${warning}`);
  lines.push("", "| Metric | Baseline | Now | Change | Verdict |", "|--------|----------|-----|--------|---------|");
  for (const row of view.rows) {
    const value = (v) => (v == null ? "·" : formatValue(v, row.unit));
    const verdict = `${VERDICT_ICON[row.verdict]} ${row.verdict}${row.note ? ` (${row.note})` : ""}`;
    lines.push(`| ${row.metric} | ${value(row.baseline)} | ${value(row.current)} | ${row.change ?? "·"} | ${verdict} |`);
  }
  if (view.newErrors.length) lines.push("", "#### New errors", ...view.newErrors.map((e) => `- \`${e.id}\`: ${e.message}`));
  if (view.fixedErrors.length) lines.push("", "#### Fixed errors", ...view.fixedErrors.map((e) => `- \`${e.id}\`: ${e.message}`));
  return lines;
}

// With a null title, the report has no heading, as inside the details block of a matrix
export function reportMarkdown({ url, navMs, results, pageErrors, crux, throttling, runs, baseline, title = `WebPerf Results — ${url}` }) {
  const lines = [];
  if (title) lines.push(`## ${title}`);
  lines.push(`> Navigated in ${navMs}ms`);
  if (throttling) lines.push(">", `> Throttling: ${describeThrottling(throttling)}`);
  if (runs) lines.push(">", `> ${describeRuns(runs)}`);
  lines.push("");
  if (runs) lines.push(...renderRuns(runs), "");

  const initial = results.filter((r) => !r.reason);
  if (initial.length > 0) {
    lines.push(renderSection("Results", initial));
  }

  // Group follow-ups by their triggering reason.
  const byReason = new Map();
  for (const r of results.filter((r) => r.reason)) {
    if (!byReason.has(r.reason)) byReason.set(r.reason, []);
    byReason.get(r.reason).push(r);
  }
  for (const [reason, group] of byReason) {
    lines.push("");
    lines.push(renderSection(`Follow-up *(${reason})*`, group));
  }

  if (crux) {
    lines.push("");
    lines.push(...renderFieldData(crux, results));
  }

  if (pageErrors?.length) {
    lines.push("");
    lines.push("### ⚠ Page Errors");
    for (const err of pageErrors) lines.push(`- ${err}`);
  }

  if (baseline) lines.push(...renderBaseline(baseline));

  return lines.join("\n");
}

// A table with the rated median of each combination, the errors that decide the exit code, and the
// report of the median run of each combination folded into a details block, to keep a pull request
// comment readable.
export function reportMatrixMarkdown(report) {
  const { file, summary, hasVariants, metrics, rows, errors } = matrixView(report);
  const headings = ["Page", "Device", ...(hasVariants ? ["Variant"] : []), ...metrics];
  const row = (parts) => `|${parts.map((part) => (part ? ` ${part} ` : " ")).join("|")}|`;

  const lines = [`## WebPerf Results — ${file}`, `> ${summary}`, ""];
  lines.push(row(headings));
  lines.push(`|${headings.map((h) => "-".repeat(h.length + 2)).join("|")}|`);
  for (const { combination: c, cells } of rows) {
    const drawn = cells
      ? cells.map((cell) => (cell ? `${RATING_ICON[cell.rating] ?? "·"} ${formatValue(cell.median, cell.unit)}` : "·"))
      : ["❌ every run failed", ...metrics.slice(1).map(() => "")];
    lines.push(row([c.name, c.device, ...(hasVariants ? [c.variant] : []), ...drawn]));
  }

  if (errors.length) {
    lines.push("", "### Errors", ...errors.map((e) => `- ${e}`));
  }

  for (const c of report.combinations.filter((c) => !c.error)) {
    lines.push("", `<details><summary>${c.id}</summary>`, "", reportMarkdown({ ...c, title: null }), "", "</details>");
  }
  return lines.join("\n");
}
