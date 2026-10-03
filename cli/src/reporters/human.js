import { styleText } from "node:util";
import { fieldDataView } from "../crux.js";

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
    const shown = items.slice(0, MAX_ITEMS);
    for (const item of shown) {
      const name = item.shortName ?? item.resource ?? item.url ?? item.src ?? item.selector ?? item.filename ?? item.target ?? "";
      const tag = item.type ?? item.tag ?? item.strategy ?? item.media ?? item.kind ?? "";
      const timing = item.responseEndMs != null ? `${item.responseEndMs}ms` : item.durationMs != null ? `${item.durationMs}ms` : "";
      const cols = [tag, name, item.detail, timing].filter(Boolean).join("  ");
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
  const numbers = Object.entries(r.details ?? {})
    .filter(([, value]) => typeof value === "number")
    .slice(0, 3)
    .map(([key, value]) => `${key} ${value}`);
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

  if (r.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") {
    return renderFontsResult(r);
  }

  if (Array.isArray(r.issues)) {
    return renderAuditResult(r, verbose);
  }

  if (r.value === undefined && (r.count !== undefined || r.details)) {
    return renderSummaryResult(r);
  }

  const icon = RATING_ICON[r.rating] ?? "·";
  const valueText = paint(r.rating, formatValue(r.value, r.unit));
  const ratingText = styleText("dim", r.rating ?? "");
  const detail = r.details?.element ? styleText("dim", r.details.element) : "";

  let out = `  ${icon} ${pad(r.id, 16)} ${pad(valueText, 10)} ${pad(ratingText, 20)} ${detail}`;

  if (r.metric === "LCP" && r.details?.subParts) {
    const sp = r.details.subParts;
    const rows = [
      ["TTFB", sp.ttfb],
      ["Resource Load Delay", sp.resourceLoadDelay],
      ["Resource Load Time", sp.resourceLoadTime],
      ["Element Render Delay", sp.elementRenderDelay],
    ];
    out += "\n";
    out += rows
      .map(([name, info]) => {
        const status = info.overTarget ? styleText("red", "🔴") : styleText("green", "✓");
        return `       ${status} ${pad(name, 22)} ${pad(`${info.value}ms`, 8)} ${pad(`${info.percent}%`, 6)}`;
      })
      .join("\n");
    if (r.details.slowestPhase) {
      out += `\n       ${styleText("blue", "→ Slowest:")} ${r.details.slowestPhase}`;
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

export function reportHuman({ url, navMs, results, pageErrors, verbose, crux }) {
  const lines = [];
  lines.push(styleText(["bold"], `WebPerf Snippets — ${url}`));
  lines.push(styleText("dim", `Navigated in ${navMs}ms`));
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
  return lines.join("\n");
}
