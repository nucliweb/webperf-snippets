import { fieldDataView } from "../crux.js";

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

function renderRow(r) {
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

export function reportMarkdown({ url, navMs, results, pageErrors, crux }) {
  const lines = [];
  lines.push(`## WebPerf Results — ${url}`);
  lines.push(`> Navigated in ${navMs}ms`);
  lines.push("");

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

  return lines.join("\n");
}
