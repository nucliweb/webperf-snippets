import { styleText, stripVTControlCharacters } from "node:util";
import { describeResult } from "../view.js";
import { overviewLine } from "../overview.js";
import { isSummaryResult, summaryNumbers } from "./summary-view.js";
import { fieldDataView, historyView, subPartsView, navigationView } from "../crux.js";
import { describeThrottling } from "../throttling.js";
import { describeRuns, describeAgreement } from "../runs.js";
import { matrixView } from "./matrix-view.js";
import { baselineView } from "./baseline-view.js";
import { budgetRows, matrixBudgetFailures } from "./budgets-view.js";
import { formatValue } from "./format.js";
import { ANY_TERMINAL, fit, pad, room } from "./terminal.js";

const RATING_ICON = {
  good: "🟢",
  "needs-improvement": "🟡",
  poor: "🔴",
};

// The same ratings where an emoji is not drawn: the marks of the issues of an audit
const RATING_MARK = {
  good: "✓",
  "needs-improvement": "⚠",
  poor: "✗",
};

const iconOf = (rating, terminal) => (terminal.emoji ? RATING_ICON : RATING_MARK)[rating] ?? "·";

const RATING_STYLE = {
  good: "green",
  "needs-improvement": "yellow",
  poor: "red",
};

function paint(rating, text) {
  return styleText(RATING_STYLE[rating] ?? "white", text);
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

function renderAuditResult(r, verbose, terminal) {
  const lines = [];
  const id = r.id ?? r.script;
  const errors = (r.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (r.issues ?? []).filter((i) => i.severity === "warning");

  const icon = iconOf(errors.length ? "poor" : warnings.length ? "needs-improvement" : "good", terminal);
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
    if (constants.length) lines.push(`     ${styleText("dim", fit(constants.map((c) => `${c.label} ${c.text}`).join(" · "), room(terminal, 5)))}`);
    for (const row of rows.slice(0, MAX_ITEMS)) {
      const cols = row.cells.map((c) => c.text).filter(Boolean).join("  ");
      if (cols) lines.push(`     ${styleText("dim", `· ${fit(cols, room(terminal, 7))}`)}`);
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
function renderSummaryResult(r, terminal) {
  const numbers = summaryNumbers(r);
  const summary = [r.count !== undefined ? String(r.count) : null, ...numbers].filter(Boolean).join("  ·  ");
  return `  ${iconOf(r.rating, terminal)} ${pad(r.id, 16)} ${styleText("dim", summary)}`;
}

function renderResult(r, verbose, terminal) {
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

  // The browser lacks the API the snippet reads, so there is no value to show
  if (r.status === "unsupported") {
    return `  ${styleText("dim", "·")} ${pad(r.id, 16)} ${styleText("dim", `not supported: ${r.error ?? "the browser lacks the API"}`)}`;
  }

  if (r.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") {
    return renderFontsResult(r);
  }

  if (Array.isArray(r.issues)) {
    return renderAuditResult(r, verbose, terminal);
  }

  if (isSummaryResult(r)) {
    return renderSummaryResult(r, terminal);
  }

  const icon = iconOf(r.rating, terminal);
  const valueText = paint(r.rating, formatValue(r.value, r.unit));
  const ratingText = styleText("dim", r.rating ?? "");
  const head = `  ${icon} ${pad(r.id, 16)} ${pad(valueText, 10)} ${pad(ratingText, 20)} `;
  // The selector of the element takes what is left of the line: one that wraps breaks the columns
  const detail = r.details?.element ? styleText("dim", fit(r.details.element, room(terminal, stripVTControlCharacters(head).length))) : "";

  let out = head + detail;

  if (r.metric === "LCP" && r.details?.subParts) {
    const sp = r.details.subParts;
    const view = describeResult(r);
    // The phases with the labels of the view, and the slowest one by its label, not its key
    const phases = view.details.find((d) => d.key === "subParts" && d.format === "phases");
    const rows = (phases?.parts ?? []).map((p) => [p.label, sp[p.key]]);
    out += "\n";
    out += rows
      .map(([name, info]) => {
        const status = info.overTarget ? styleText("red", iconOf("poor", terminal)) : styleText("green", "✓");
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

function renderFieldData(crux, results, terminal) {
  const trend = crux.history ? ["", ...renderFieldTrend(crux.history)] : [];
  if (crux.unavailable) return [styleText("dim", `Field data: not available (${crux.unavailable})`), ...trend];
  const { title, rows } = fieldDataView(crux, results);
  const lines = [styleText("bold", title)];
  for (const row of rows) {
    const icon = iconOf(row.rating, terminal);
    const synthetic = row.synthetic == null ? "n/a" : formatValue(row.synthetic, row.unit);
    lines.push(
      `  ${icon} ${pad(row.metric, 6)} ${pad(paint(row.rating, formatValue(row.p75, row.unit)), 10)} ${pad(styleText("dim", row.rating), 20)} ${styleText("dim", `(synthetic: ${synthetic})`)}`
    );
  }
  return [...lines, ...renderFieldSubParts(crux, results), ...renderNavigations(crux), ...trend];
}

// "TTFB  1.53s  lab 400ms  real users wait longer for the server…"
function renderFieldSubParts(crux, results) {
  const view = subPartsView(crux, results);
  if (!view) return [];
  return [
    "",
    styleText("bold", "LCP sub-parts (CrUX p75 against the lab)"),
    ...view.rows.map(
      (row) => `  ${pad(row.label, 14)}${pad(formatValue(row.field, "ms"), 10)}${pad(`lab ${row.lab === null ? "n/a" : formatValue(row.lab, "ms")}`, 12)}${row.note ?? ""}`.trimEnd()
    ),
    ...view.caveats.map((caveat) => styleText("dim", `  ${caveat}`)),
  ];
}

function renderNavigations(crux) {
  const view = navigationView(crux);
  if (!view) return [];
  return ["", styleText("dim", view.line), ...(view.hint ? [`  ${view.hint}`] : [])];
}

// "LCP  2.88s → 3.10s  ▲ +7.7%  worsening  ▁▅█"
function renderFieldTrend(history) {
  if (history.unavailable) return [styleText("dim", `Field data trend: not available (${history.unavailable})`)];
  const { title, rows } = historyView(history);
  const style = { improving: "green", worsening: "red" };
  return [
    styleText("bold", title),
    ...rows.map(
      (row) =>
        `  ${pad(row.metric, 6)}${pad(`${formatValue(row.first, row.unit)} → ${formatValue(row.last, row.unit)}`, 20)}${pad(row.change, 10)}${pad(style[row.trend] ? styleText(style[row.trend], row.trend) : row.trend, 12)}${row.sparkline}`
    ),
  ];
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

const VERDICT_STYLE = { regressed: "red", improved: "green", unchanged: "dim", inconclusive: "yellow", "not measured": "dim", new: "cyan" };

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
  const lines = ["", styleText("bold", `Compared with ${view.source} (${view.summary})`)];
  if (view.extended) lines.push(styleText("dim", `  ${view.extended}`));
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

export function reportHuman({ url, navMs, overview, results, pageErrors, verbose, crux, throttling, runs, baseline, budgets, terminal = ANY_TERMINAL, title = `WebPerf Snippets — ${url}` }) {
  const lines = [];
  lines.push(styleText(["bold"], title));
  lines.push(styleText("dim", `Navigated in ${navMs}ms`));
  if (throttling) lines.push(styleText("dim", `Throttling: ${describeThrottling(throttling)}`));
  if (runs) lines.push(...renderRuns(runs));
  lines.push("");
  const summary = overviewLine({ overview, results });
  if (summary) lines.push(summary, "");
  for (const r of results) lines.push(renderResult(r, verbose, terminal));
  if (crux) {
    lines.push("");
    lines.push(...renderFieldData(crux, results, terminal));
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
  const { terminal = ANY_TERMINAL } = report;
  const { file, summary, hasVariants, metrics, rows, errors, comparison, legend } = matrixView(report);
  const columns = [["name", "Page"], ["device", "Device"], ...(hasVariants ? [["variant", "Variant"]] : [])];
  const widths = columns.map(([key, label]) => Math.max(...report.combinations.map((c) => c[key].length), label.length) + 3);
  // A median that carries its CV needs a wider cell, and with --baseline a change follows each metric
  const cellWidth = legend ? 18 : 14;
  const changeWidth = comparison ? 12 : 0;
  // On a terminal narrower than the table, the names of the pages give up the columns it lacks
  const others = 2 + widths.slice(1).reduce((sum, width) => sum + width, 0) + metrics.length * (cellWidth + changeWidth);
  if (terminal.columns && widths[0] + others > terminal.columns) widths[0] = Math.max(terminal.columns - others, 11);
  const identity = (values) => values.map((value, i) => pad(fit(value, widths[i] - 3), widths[i])).join("");

  const lines = [];
  lines.push(styleText(["bold"], `WebPerf Snippets — ${file} (${summary})`));
  lines.push("");
  const headings = metrics.map((m) => pad(m, cellWidth) + (comparison ? pad("Δ", changeWidth) : "")).join("");
  lines.push(styleText("dim", `  ${identity(columns.map(([, label]) => label))}${headings.trimEnd()}`));
  for (const { combination: c, cells, changes } of rows) {
    const row = `  ${identity(columns.map(([key]) => c[key]))}`;
    if (!cells) {
      lines.push(row + styleText("red", "✗ every run failed"));
      continue;
    }
    const drawn = cells.map((cell, i) => {
      const value = cell ? pad(paint(cell.rating, `${iconOf(cell.rating, terminal)} ${formatValue(cell.median, cell.unit)}${cell.spread ? ` ${cell.spread}` : ""}`), cellWidth) : pad("·", cellWidth);
      return value + (changes ? pad(styleText(VERDICT_STYLE[changes[i].verdict], changes[i].text), changeWidth) : "");
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
      lines.push("", reportHuman({ ...c, verbose: true, terminal, title: `${c.id} — ${c.url}` }));
    }
  }
  return lines.join("\n");
}
