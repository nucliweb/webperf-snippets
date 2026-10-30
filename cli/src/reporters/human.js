import { styleText } from "node:util";
import { describeResult } from "../view.js";
import { isSummaryResult, summaryNumbers } from "./summary-view.js";
import { fieldDataView } from "../crux.js";
import { describeThrottling } from "../throttling.js";
import { describeRuns, describeAgreement } from "../runs.js";
import { matrixView } from "./matrix-view.js";
import { baselineView } from "./baseline-view.js";
import { budgetRows, matrixBudgetFailures } from "./budgets-view.js";

const RATING_ICON = {
  good: "🟢",
  "needs-improvement": "🟡",
  poor: "🔴",
};

const RATING_STYLE = {
  good: "green",
  "needs-improvement": "yellow",
  poor: "red",
};

function formatValue(value, unit) {
  if (unit === "ms") {
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
  }
  if (unit === "score") return value.toFixed(4);
  return String(value);
}

function paint(rating, text) {
  return styleText(RATING_STYLE[rating] ?? "white", text);
}

function pad(text, len) {
  const visibleLen = text.replace(/\[\d+m/g, "").length;
  return text + " ".repeat(Math.max(0, len - visibleLen));
}

const DISPLAY_WARN = new Set(["block", "auto", "unknown"]);

function renderFontsResult(r) {
  const d = r.details ?? {};
  const lines = [];

  lines.push(styleText("bold", `  Fonts — preloaded: ${d.preloadedCount ?? 0}  loaded: ${d.loadedCount ?? 0}  used above fold: ${d.usedAboveFoldCount ?? 0}`));

  if (r.items?.length) {
    lines.push("");
    lines.push(styleText("dim", "  Loaded fonts:"));
    lines.push(styleText("dim", `    ${"Family".padEnd(20)} ${"Weight".padEnd(8)} ${"Style".padEnd(10)} Display`));
    for (const f of r.items) {
      const displayWarning = DISPLAY_WARN.has(f.display) ? styleText("yellow", ` ⚠ ${f.display}`) : styleText("green", ` ${f.display}`);
      lines.push(`    ${f.family.padEnd(20)} ${f.weight.padEnd(8)} ${f.style.padEnd(10)}${displayWarning}`);
    }
  }

  if (r.usedFonts?.length) {
    lines.push("");
    lines.push(styleText("dim", "  Used above fold:"));
    lines.push(styleText("dim", `    ${"Family".padEnd(20)} ${"Weight".padEnd(8)} ${"Style".padEnd(10)} Elements`));
    const sorted = [...r.usedFonts].sort((a, b) => b.elements - a.elements);
    for (const f of sorted) {
      lines.push(`    ${f.family.padEnd(20)} ${f.weight.padEnd(8)} ${f.style.padEnd(10)} ${f.elements}`);
    }
  }

  if (r.issues?.length) {
    lines.push("");
    lines.push(styleText("dim", "  Issues:"));
    for (const issue of r.issues) {
      const color = issue.severity === "error" ? "red" : "yellow";
      lines.push(`    ${styleText(color, issue.severity === "error" ? "✗" : "⚠")} ${issue.message}`);
    }
  } else {
    lines.push("");
    lines.push(`    ${styleText("green", "✓")} Font loading looks optimized`);
  }

  return lines.join("\n");
}

function renderAuditResult(r, verbose) {
  const lines = [];
  const id = r.id ?? r.script;
  const errors = (r.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (r.issues ?? []).filter((i) => i.severity === "warning");

  const icon = errors.length ? "🔴" : warnings.length ? "🟡" : "🟢";
  const countSuffix = r.count > 0 ? styleText("dim", ` (${r.count})`) : "";
  lines.push(`  ${icon} ${id}${countSuffix}`);

  if (r.issues?.length) {
    for (const issue of r.issues) {
      const color = issue.severity === "error" ? "red" : issue.severity === "warning" ? "yellow" : "blue";
      const sym = issue.severity === "error" ? "✗" : issue.severity === "warning" ? "⚠" : "ℹ";
      lines.push(`     ${styleText(color, sym)} ${issue.message}`);
    }
  } else {
    lines.push(`     ${styleText("green", "✓")} No issues`);
  }

  const isGreen = errors.length === 0 && warnings.length === 0;
  const MAX_ITEMS = 10;
  const items = r.items ?? [];
  if (items.length > 0 && (!isGreen || verbose)) {
    lines.push("");
    // The cells of each row as the view gives them: the file of a URL, the values in their units
    const { rows, constants } = describeResult(r);
    // The values that are the same in every row, once above them, as in the extension
    if (constants.length) lines.push(`     ${styleText("dim", constants.map((c) => `${c.label} ${c.text}`).join(" · "))}`);
    for (const row of rows.slice(0, MAX_ITEMS)) {
      const cols = row.cells.map((c) => c.text).filter(Boolean).join("  ");
      if (cols) lines.push(`     ${styleText("dim", `· ${cols}`)}`);
    }
    if (items.length > MAX_ITEMS) {
      lines.push(`     ${styleText("dim", `… and ${items.length - MAX_ITEMS} more`)}`);
    }
  }

  if (r.reason) {
    lines.push(`     ${styleText("dim", `↳ ${r.reason}`)}`);
  }

  return lines.join("\n");
}

// A result with a count and details but no value and no issues, such as the long tasks: the count,
// then the first numbers of its details.
function renderSummaryResult(r) {
  const numbers = summaryNumbers(r);
  const summary = [r.count !== undefined ? String(r.count) : null, ...numbers].filter(Boolean).join("  ·  ");
  return `  ${RATING_ICON[r.rating] ?? "·"} ${pad(r.id, 16)} ${styleText("dim", summary)}`;
}

function renderResult(r, verbose) {
  if (r.status === "skipped") {
    return `  ${styleText("dim", "-")} ${pad(r.id, 16)} ${styleText("dim", `skipped: ${r.reason}`)}`;
  }

  if (r.status === "error") {
    return `  ${styleText("red", "✗")} ${pad(r.id, 16)} ${styleText("dim", r.error)}`;
  }

  // A tracking snippet with nothing recorded, such as INP without interactions, measured nothing
  if (r.status === "tracking") {
    return `  ${styleText("dim", "·")} ${pad(r.id, 16)} ${styleText("dim", `not measured: ${r.message ?? "nothing recorded"}`)}`;
  }

  if (r.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") {
    return renderFontsResult(r);
  }

  if (Array.isArray(r.issues)) {
    return renderAuditResult(r, verbose);
  }

  if (isSummaryResult(r)) {
    return renderSummaryResult(r);
  }

  const icon = RATING_ICON[r.rating] ?? "·";
  const valueText = paint(r.rating, formatValue(r.value, r.unit));
  const ratingText = styleText("dim", r.rating ?? "");
  const detail = r.details?.element ? styleText("dim", r.details.element) : "";

  let out = `  ${icon} ${pad(r.id, 16)} ${pad(valueText, 10)} ${pad(ratingText, 20)} ${detail}`;

  if (r.metric === "LCP" && r.details?.subParts) {
    const sp = r.details.subParts;
    const view = describeResult(r);
    // The phases with the labels of the view, and the slowest one by its label, not its key
    const phases = view.details.find((d) => d.key === "subParts" && d.format === "phases");
    const rows = (phases?.parts ?? []).map((p) => [p.label, sp[p.key]]);
    out += "\n";
    out += rows
      .map(([name, info]) => {
        const status = info.overTarget ? styleText("red", "🔴") : styleText("green", "✓");
        const row = `       ${status} ${pad(name, 22)} ${pad(`${info.value}ms`, 8)} ${pad(`${info.percent}%`, 6)}`;
        // The Resource Load Time splits into the wait for the server and the download, when the snippet measures it
        return info.waiting == null
          ? row
          : `${row}\n         ${styleText("dim", `${info.waiting}ms waiting for the server, ${info.download}ms downloading`)}`;
      })
      .join("\n");
    const slowest = view.details.find((d) => d.key === "slowestPhase");
    if (slowest) {
      out += `\n       ${styleText("blue", "→ Slowest:")} ${slowest.text}`;
    }
  }

  if (r.reason) {
    out += `\n     ${styleText("dim", `↳ ${r.reason}`)}`;
  }

  return out;
}

function renderFieldData(crux, results) {
  if (crux.unavailable) return [styleText("dim", `Field data: not available (${crux.unavailable})`)];
  const { title, rows } = fieldDataView(crux, results);
  const lines = [styleText("bold", title)];
  for (const row of rows) {
    const icon = RATING_ICON[row.rating] ?? "·";
    const synthetic = row.synthetic == null ? "n/a" : formatValue(row.synthetic, row.unit);
    lines.push(
      `  ${icon} ${pad(row.metric, 6)} ${pad(paint(row.rating, formatValue(row.p75, row.unit)), 10)} ${pad(styleText("dim", row.rating), 20)} ${styleText("dim", `(synthetic: ${synthetic})`)}`
    );
  }
  return lines;
}

// The runs line, and the median, min and max of each metric across the runs, with how much they agree
function renderRuns(runs) {
  const lines = [styleText("dim", describeRuns(runs))];
  for (const [metric, value] of Object.entries(runs.summary)) {
    const { median, min, max, unit } = value;
    const cell = (label, v) => pad(`${label} ${formatValue(v, unit)}`, 16);
    lines.push(styleText("dim", `  ${pad(metric, 6)}${cell("median", median)}${cell("min", min)}${cell("max", max)}${describeAgreement(value)}`.trimEnd()));
  }
  return lines;
}

const VERDICT_STYLE = { regressed: "red", improved: "green", unchanged: "dim", "not measured": "dim", new: "cyan" };

// Every budget the run was given, passed or not, so the report says which one decided the exit code
function renderBudgets(budgets) {
  const lines = ["", styleText("bold", "Budgets")];
  for (const row of budgetRows(budgets, formatValue)) {
    const mark = row.passed ? styleText("green", "✓") : styleText("red", "✗");
    lines.push(`  ${mark} ${pad(row.metric, 6)}${pad(row.value, 10)}${pad(`budget ${row.budget}`, 18)}${styleText(row.passed ? "green" : "red", row.verdict)}`);
  }
  return lines;
}

// The comparison with --baseline, after the report: its warnings first, since they say how far to
// trust the table, then a row per metric and the errors that appeared or went away
function renderBaseline(comparison) {
  const view = baselineView(comparison);
  const lines = ["", styleText("bold", `Compared with ${view.file} (${view.summary})`)];
  for (const warning of view.warnings) lines.push(`  ${styleText("yellow", `Warning: ${warning}`)}`);
  lines.push(styleText("dim", `  ${pad("Metric", 9)}${pad("Baseline", 11)}${pad("Now", 10)}Change`));
  for (const row of view.rows) {
    const value = (v) => (v == null ? "·" : formatValue(v, row.unit));
    const verdict = row.note ? `${row.verdict} (${row.note})` : row.verdict;
    lines.push(`  ${pad(row.metric, 9)}${pad(value(row.baseline), 11)}${pad(value(row.current), 10)}${pad(row.change ?? "", 20)}${styleText(VERDICT_STYLE[row.verdict], verdict)}`);
  }
  for (const e of view.newErrors) lines.push(`  ${styleText("red", "+ new error")}  ${e.id}: ${e.message}`);
  for (const e of view.fixedErrors) lines.push(`  ${styleText("green", "− fixed")}      ${e.id}: ${e.message}`);
  return lines;
}

export function reportHuman({ url, navMs, results, pageErrors, verbose, crux, throttling, runs, baseline, budgets, title = `WebPerf Snippets — ${url}` }) {
  const lines = [];
  lines.push(styleText(["bold"], title));
  lines.push(styleText("dim", `Navigated in ${navMs}ms`));
  if (throttling) lines.push(styleText("dim", `Throttling: ${describeThrottling(throttling)}`));
  if (runs) lines.push(...renderRuns(runs));
  lines.push("");
  for (const r of results) lines.push(renderResult(r, verbose));
  if (crux) {
    lines.push("");
    lines.push(...renderFieldData(crux, results));
  }
  if (pageErrors?.length) {
    lines.push("");
    lines.push(styleText("yellow", "Page errors during run:"));
    for (const err of pageErrors) lines.push(`  ${styleText("dim", err)}`);
  }
  if (budgets?.length) lines.push(...renderBudgets(budgets));
  if (baseline) lines.push(...renderBaseline(baseline));
  return lines.join("\n");
}

// One row per combination with the rated median of each metric, and below it the errors that decide
// the exit code. With verbose, the report of the median run of each combination follows.
export function reportMatrixHuman(report) {
  const { file, summary, hasVariants, metrics, rows, errors, comparison, legend } = matrixView(report);
  const columns = [["name", "Page"], ["device", "Device"], ...(hasVariants ? [["variant", "Variant"]] : [])];
  const widths = columns.map(([key, label]) => Math.max(...report.combinations.map((c) => c[key].length), label.length) + 3);
  const identity = (values) => values.map((value, i) => pad(value, widths[i])).join("");

  const lines = [];
  lines.push(styleText(["bold"], `WebPerf Snippets — ${file} (${summary})`));
  lines.push("");
  // With --baseline, a change column follows each metric
  const headings = metrics.map((m) => pad(m, 14) + (comparison ? pad("Δ", 12) : "")).join("");
  lines.push(styleText("dim", `  ${identity(columns.map(([, label]) => label))}${headings.trimEnd()}`));
  for (const { combination: c, cells, changes } of rows) {
    const row = `  ${identity(columns.map(([key]) => c[key]))}`;
    if (!cells) {
      lines.push(row + styleText("red", "✗ every run failed"));
      continue;
    }
    const drawn = cells.map((cell, i) => {
      const width = legend ? 18 : 14;
      const value = cell ? pad(paint(cell.rating, `${RATING_ICON[cell.rating] ?? "·"} ${formatValue(cell.median, cell.unit)}${cell.spread ? ` ${cell.spread}` : ""}`), width) : pad("·", width);
      return value + (changes ? pad(styleText(VERDICT_STYLE[changes[i].verdict], changes[i].text), 12) : "");
    });
    lines.push(row + drawn.join("").trimEnd());
  }
  if (legend) lines.push(styleText("dim", `  ${legend}`));

  if (errors.length) {
    lines.push("");
    lines.push(styleText("red", "Errors:"));
    for (const e of errors) lines.push(`  ${styleText("red", "✗")} ${e}`);
  }

  const budgetFailures = matrixBudgetFailures(report.combinations, formatValue);
  if (budgetFailures) {
    lines.push("", styleText("bold", "Budgets"));
    for (const f of budgetFailures) lines.push(`  ${styleText("red", "✗")} ${f}`);
    if (!budgetFailures.length) lines.push(`  ${styleText("green", "✓ Every budget passed")}`);
  }

  if (comparison) {
    lines.push("", styleText("bold", `Compared with ${comparison.file}`));
    for (const warning of comparison.warnings) lines.push(`  ${styleText("yellow", `Warning: ${warning}`)}`);
    for (const e of comparison.newErrors) lines.push(`  ${styleText("red", "+ new error")}  ${e}`);
    for (const e of comparison.fixedErrors) lines.push(`  ${styleText("green", "− fixed")}      ${e}`);
    if (comparison.added.length) lines.push(`  Added: ${comparison.added.join(", ")}`);
    if (comparison.missing.length) lines.push(`  Missing: ${comparison.missing.join(", ")}`);
    if (!comparison.warnings.length && !comparison.newErrors.length && !comparison.fixedErrors.length && !comparison.added.length && !comparison.missing.length) {
      lines.push(styleText("dim", "  The same combinations, no new or fixed errors, and no warnings"));
    }
  }

  if (report.verbose) {
    for (const c of report.combinations.filter((c) => !c.error)) {
      lines.push("", reportHuman({ ...c, verbose: true, title: `${c.id} — ${c.url}` }));
    }
  }
  return lines.join("\n");
}
