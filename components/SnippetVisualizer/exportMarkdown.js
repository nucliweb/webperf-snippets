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

function fontsMarkdown(result) {
  const d = result.details ?? {};
  const lines = [
    `## Fonts Analysis — ${result.script}`,
    `> Preloaded: **${d.preloadedCount ?? 0}** · Loaded: **${d.loadedCount ?? 0}** · Used above fold: **${d.usedAboveFoldCount ?? 0}**`,
  ];

  if (result.items?.length) {
    lines.push("", "### Loaded Fonts", "| Family | Weight | Style | Display |", "|--------|--------|-------|---------|");
    for (const f of result.items) {
      lines.push(`| ${f.family} | ${f.weight} | ${f.style} | ${f.display} |`);
    }
  }

  if (result.usedFonts?.length) {
    lines.push("", "### Used Above Fold", "| Family | Weight | Style | Elements |", "|--------|--------|-------|----------|");
    for (const f of [...result.usedFonts].sort((a, b) => b.elements - a.elements)) {
      lines.push(`| ${f.family} | ${f.weight} | ${f.style} | ${f.elements} |`);
    }
  }

  if (result.issues?.length) {
    lines.push("", "### Issues");
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      lines.push(`- ${icon} ${issue.message}`);
    }
  } else {
    lines.push("", "✅ Font loading looks optimized");
  }

  return lines.join("\n");
}

function cwvMarkdown(result) {
  const icon = RATING_ICON[result.rating] ?? "·";
  const value = formatValue(result.value, result.unit);
  const lines = [`## ${result.script ?? result.metric} — ${value} ${icon} ${result.rating}`];

  const sp = result.details?.subParts;
  if (sp) {
    lines.push("", "### LCP Sub-Parts", "| Phase | Value | % | Status |", "|-------|-------|---|--------|");
    for (const [phase, info] of [
      ["TTFB", sp.ttfb],
      ["Resource Load Delay", sp.resourceLoadDelay],
      ["Resource Load Time", sp.resourceLoadTime],
      ["Element Render Delay", sp.elementRenderDelay],
    ]) {
      if (!info) continue;
      lines.push(`| ${phase} | ${info.value}ms | ${info.percent}% | ${info.overTarget ? "🔴" : "✅"} |`);
    }
    if (result.details.slowestPhase) {
      lines.push("", `→ Slowest phase: **${result.details.slowestPhase}**`);
    }
  }

  return lines.join("\n");
}

function auditMarkdown(result) {
  const lines = [`## ${result.script}`];
  if (result.count != null) lines.push(`> ${result.count} item(s) found`);
  if (result.corsLimitedAnalysis === true) {
    lines.push("> ⚠️ Partial analysis: cross-origin resources without Timing-Allow-Origin hid their sizes or timings, so the totals are a lower bound.");
  }

  if (result.issues?.length) {
    lines.push("", "### Issues");
    for (const issue of result.issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`- ${icon} ${issue.message}`);
    }
  } else {
    lines.push("", "✅ No issues found");
  }

  const items = result.items ?? [];
  if (items.length) {
    const keys = Object.keys(items[0]).slice(0, 5);
    lines.push("", `### Items (${items.length})`);
    lines.push(`| ${keys.join(" | ")} |`);
    lines.push(`| ${keys.map(() => "---").join(" | ")} |`);
    for (const item of items) {
      lines.push(`| ${keys.map((k) => String(item[k] ?? "")).join(" | ")} |`);
    }
  }

  return lines.join("\n");
}

export function exportMarkdown(result) {
  if (result.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") return fontsMarkdown(result);
  if (result.rating != null) return cwvMarkdown(result);
  return auditMarkdown(result);
}
