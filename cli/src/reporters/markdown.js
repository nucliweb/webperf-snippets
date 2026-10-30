import { fieldDataView } from "../crux.js";
import { describeResult } from "../view.js";
import { isSummaryResult, summaryNumbers } from "./summary-view.js";
import { describeThrottling } from "../throttling.js";
import { describeRuns, describeAgreement } from "../runs.js";
import { matrixView } from "./matrix-view.js";
import { baselineView } from "./baseline-view.js";
import { budgetRows, matrixBudgetFailures } from "./budgets-view.js";

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

// A tracking snippet with nothing recorded, such as INP without interactions, measured nothing
function renderNotMeasuredRow(r) {
  return `| ${r.id} | · not measured | ${r.message ?? "nothing recorded"} |`;
}

// A result with a count and no value: its count, and its first numbers as the human report gives them
function renderSummaryRow(r) {
  return `| ${r.id} | · ${r.count ?? ""} | ${summaryNumbers(r).join(" · ")} |`;
}

function renderRow(r) {
  if (r.status === "skipped") return renderSkippedRow(r);
  if (r.status === "error") return renderErrorRow(r);
  if (r.status === "tracking") return renderNotMeasuredRow(r);
  if (Array.isArray(r.issues)) return renderAuditRow(r);
  if (isSummaryResult(r)) return renderSummaryRow(r);
  return renderMetricRow(r);
}

function sectionHeader(results) {
  if (results.some((r) => Array.isArray(r.issues))) {
    return ["| Check | Status | Issues |", "|-------|--------|--------|"];
  }
  return ["| Metric | Value | Status |", "|--------|-------|--------|"];
}

// Text from the page in a list item: the characters that markdown reads as emphasis or code, escaped
const md = (text) => String(text).replace(/[\\`*_[\]]/g, "\\$&");

// A field of the view as a list item, with the labels and formats of the extension: a nested table is
// a line per row, and the fields of an object are items under it
function detailLines(field, indent = "") {
  if (field.format === "table") {
    return [`${indent}- **${md(field.label)}**:`, ...field.rows.map((row) => `${indent}  - ${row.cells.map((c) => md(c.text)).filter(Boolean).join(" · ")}`)];
  }
  if (field.format === "fields") {
    return [`${indent}- **${md(field.label)}**:`, ...field.fields.flatMap((f) => detailLines(f, `${indent}  `))];
  }
  return [`${indent}- **${md(field.label)}**: ${md(field.text)}`];
}

// The details of each result, folded under its id, so the comment of a pull request stays short
function renderDetails(results) {
  return results.flatMap((r) => {
    const { details } = describeResult(r);
    if (details.length === 0) return [];
    return ["", `<details><summary>${r.id}</summary>`, "", ...details.flatMap((f) => detailLines(f)), "", "</details>"];
  });
}

function renderSection(title, results) {
  return [
    `### ${title}`,
    ...sectionHeader(results),
    ...results.map(renderRow),
    ...renderDetails(results),
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

// The median, min and max of each metric across the runs, and how much they agree
function renderRuns(runs) {
  const lines = ["| Metric | Median | Min | Max | Runs |", "|--------|--------|-----|-----|------|"];
  for (const [metric, value] of Object.entries(runs.summary)) {
    const { median, min, max, unit } = value;
    lines.push(`| ${metric} | ${formatValue(median, unit)} | ${formatValue(min, unit)} | ${formatValue(max, unit)} | ${describeAgreement(value) || "·"} |`);
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
// Every budget the run was given, passed or not: the comment of a pull request says which one failed
function renderBudgets(budgets) {
  const rows = budgetRows(budgets, formatValue).map((row) => `| ${row.metric} | ${row.value} | ${row.budget} | ${row.passed ? "✅" : "❌"} ${row.verdict} |`);
  return ["", "### Budgets", "| Metric | Value | Budget | Verdict |", "|--------|-------|--------|---------|", ...rows];
}

export function reportMarkdown({ url, navMs, results, pageErrors, crux, throttling, runs, baseline, budgets, title = `WebPerf Results — ${url}` }) {
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

  if (budgets?.length) lines.push(...renderBudgets(budgets));
  if (baseline) lines.push(...renderBaseline(baseline));

  return lines.join("\n");
}

// A table with the rated median of each combination, the errors that decide the exit code, and the
// report of the median run of each combination folded into a details block, to keep a pull request
// comment readable.
export function reportMatrixMarkdown(report) {
  const { file, summary, hasVariants, metrics, rows, errors, comparison, legend } = matrixView(report);
  // With --baseline, a change column follows each metric
  const metricHeadings = metrics.flatMap((m) => (comparison ? [m, "Δ"] : [m]));
  const headings = ["Page", "Device", ...(hasVariants ? ["Variant"] : []), ...metricHeadings];
  const row = (parts) => `|${parts.map((part) => (part ? ` ${part} ` : " ")).join("|")}|`;

  const lines = [`## WebPerf Results — ${file}`, `> ${summary}`, ""];
  lines.push(row(headings));
  lines.push(`|${headings.map((h) => "-".repeat(h.length + 2)).join("|")}|`);
  for (const { combination: c, cells, changes } of rows) {
    const drawn = cells
      ? cells.flatMap((cell, i) => {
          const value = cell ? `${RATING_ICON[cell.rating] ?? "·"} ${formatValue(cell.median, cell.unit)}${cell.spread ? ` ${cell.spread}` : ""}` : "·";
          return changes ? [value, changes[i].text] : [value];
        })
      : ["❌ every run failed", ...metricHeadings.slice(1).map(() => "")];
    lines.push(row([c.name, c.device, ...(hasVariants ? [c.variant] : []), ...drawn]));
  }
  if (legend) lines.push("", `> ${legend}`);

  if (errors.length) {
    lines.push("", "### Errors", ...errors.map((e) => `- ${e}`));
  }

  const budgetFailures = matrixBudgetFailures(report.combinations, formatValue);
  if (budgetFailures) {
    lines.push("", "### Budgets", ...(budgetFailures.length ? budgetFailures.map((f) => `- ❌ ${f}`) : ["✅ Every budget passed"]));
  }

  if (comparison) {
    lines.push("", `### Compared with \`${comparison.file}\``);
    if (comparison.warnings.length) lines.push(...comparison.warnings.flatMap((w, i) => [...(i ? [">"] : []), `> ⚠️ ${w}`]), "");
    const ids = (list) => list.map((id) => `\`${id}\``).join(", ");
    const items = [
      ...comparison.newErrors.map((e) => `- New error: ${e}`),
      ...comparison.fixedErrors.map((e) => `- Fixed: ${e}`),
      ...(comparison.added.length ? [`- Added: ${ids(comparison.added)}`] : []),
      ...(comparison.missing.length ? [`- Missing: ${ids(comparison.missing)}`] : []),
    ];
    lines.push(...(items.length ? items : ["The same combinations, no new or fixed errors."]));
  }

  for (const c of report.combinations.filter((c) => !c.error)) {
    lines.push("", `<details><summary>${c.id}</summary>`, "", reportMarkdown({ ...c, title: null }), "", "</details>");
  }
  return lines.join("\n");
}
