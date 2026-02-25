// Critical CSS Detection
// Analyzes render-blocking stylesheets, inline CSS budget, and loading strategy
// https://webperf-snippets.nucliweb.net

(() => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  const criticalBudget = 14 * 1024; // 14 KB (first TCP round-trip)

  // --- External stylesheets ---
  const linkStylesheets = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  );

  const perfEntries = performance.getEntriesByType("resource");

  const externalCSSData = linkStylesheets.map((link) => {
    const href = link.href;
    const media = link.getAttribute("media") || "all";

    // A stylesheet is render-blocking when it applies to screen without deferral
    const isRenderBlocking =
      media === "all" ||
      media === "" ||
      media === "screen" ||
      (media.toLowerCase().includes("screen") &&
        !media.toLowerCase().includes("print"));

    const perfEntry = perfEntries.find((e) => e.name === href);
    const transferSize = perfEntry ? perfEntry.transferSize : 0;
    const decodedSize = perfEntry ? perfEntry.decodedBodySize : 0;

    const preloadLink = document.querySelector(
      `link[rel="preload"][as="style"][href="${href}"]`
    );

    let ruleCount = 0;
    let corsBlocked = false;
    try {
      const sheet = Array.from(document.styleSheets).find(
        (s) => s.href === href
      );
      if (sheet && sheet.cssRules) ruleCount = sheet.cssRules.length;
    } catch (_) {
      corsBlocked = true;
    }

    return {
      filename: href.split("/").pop().split("?")[0] || href,
      href,
      media,
      isRenderBlocking,
      transferSize,
      decodedSize,
      ruleCount,
      corsBlocked,
      preloaded: preloadLink !== null,
    };
  });

  // --- Inline styles ---
  const inlineStyles = Array.from(document.querySelectorAll("style")).map(
    (style, i) => {
      const content = style.innerHTML;
      const size = new Blob([content]).size;
      const ruleCount = (content.match(/\{[^}]*\}/g) || []).length;
      return {
        index: i + 1,
        size,
        ruleCount,
        inHead: style.closest("head") !== null,
      };
    }
  );

  // --- Totals ---
  const renderBlockingCSS = externalCSSData.filter((s) => s.isRenderBlocking);
  const nonBlockingCSS = externalCSSData.filter((s) => !s.isRenderBlocking);
  const totalInlineBytes = inlineStyles.reduce((sum, s) => sum + s.size, 0);
  const totalRenderBlockingDecoded = renderBlockingCSS.reduce(
    (sum, s) => sum + s.decodedSize,
    0
  );
  const totalExternalTransfer = externalCSSData.reduce(
    (sum, s) => sum + s.transferSize,
    0
  );

  // --- Output ---
  console.group(
    "%c🎯 Critical CSS Detection",
    "font-weight: bold; font-size: 14px;"
  );

  console.log("");
  console.log("%cPage CSS Summary:", "font-weight: bold;");
  console.log(`   External stylesheets:        ${externalCSSData.length}`);
  console.log(`   Render-blocking:             ${renderBlockingCSS.length}`);
  console.log(`   Non-blocking (media query):  ${nonBlockingCSS.length}`);
  console.log(`   Inline <style> blocks:       ${inlineStyles.length}`);
  console.log(`   Total external CSS (wire):   ${formatBytes(totalExternalTransfer)}`);
  console.log(`   Total inline CSS:            ${formatBytes(totalInlineBytes)}`);

  // Render-blocking stylesheets
  if (renderBlockingCSS.length > 0) {
    console.log("");
    console.group(
      `%c🚫 Render-Blocking Stylesheets (${renderBlockingCSS.length})`,
      "color: #ef4444; font-weight: bold;"
    );

    console.table(
      renderBlockingCSS.map((s) => ({
        File: s.filename,
        Media: s.media,
        "Transfer Size": formatBytes(s.transferSize),
        "Decoded Size": formatBytes(s.decodedSize),
        Rules: s.corsBlocked ? "CORS blocked" : s.ruleCount,
        Preloaded: s.preloaded ? "✅ Yes" : "❌ No",
      }))
    );

    const budgetPct = Math.min(
      (totalRenderBlockingDecoded / criticalBudget) * 100,
      200
    );
    const barWidth = Math.min(Math.round(budgetPct / 10), 20);
    const bar = "█".repeat(barWidth) + "░".repeat(20 - barWidth);
    console.log(
      `\n   Total render-blocking: ${formatBytes(totalRenderBlockingDecoded)}`
    );
    console.log(`   vs. 14 KB budget:      [${bar}] ${budgetPct.toFixed(0)}%`);

    console.groupEnd();
  } else {
    console.log("");
    console.log(
      "%c✅ No render-blocking stylesheets detected.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Non-blocking stylesheets
  if (nonBlockingCSS.length > 0) {
    console.log("");
    console.group(
      `%c✅ Non-Blocking Stylesheets (${nonBlockingCSS.length})`,
      "color: #22c55e; font-weight: bold;"
    );
    console.table(
      nonBlockingCSS.map((s) => ({
        File: s.filename,
        Media: s.media,
        "Transfer Size": formatBytes(s.transferSize),
        Rules: s.corsBlocked ? "CORS blocked" : s.ruleCount,
      }))
    );
    console.groupEnd();
  }

  // Inline styles
  if (inlineStyles.length > 0) {
    console.log("");
    const inlineBudgetPct = ((totalInlineBytes / criticalBudget) * 100).toFixed(0);
    const inlineRating =
      totalInlineBytes <= criticalBudget * 0.5
        ? { label: "Good", color: "#22c55e" }
        : totalInlineBytes <= criticalBudget
        ? { label: "Acceptable", color: "#f59e0b" }
        : { label: "Too Large", color: "#ef4444" };

    console.group(
      `%c📝 Inline CSS (${inlineStyles.length} block${inlineStyles.length > 1 ? "s" : ""})`,
      "color: #3b82f6; font-weight: bold;"
    );
    console.log(`   Total size:    ${formatBytes(totalInlineBytes)}`);
    console.log(`   Budget used:   ${inlineBudgetPct}% of 14 KB`);
    console.log(
      `   Rating:        %c${inlineRating.label}`,
      `color: ${inlineRating.color}; font-weight: bold;`
    );
    console.table(
      inlineStyles.map((s) => ({
        "#": s.index,
        Location: s.inHead ? "head" : "body",
        Size: formatBytes(s.size),
        "Rules (~)": s.ruleCount,
      }))
    );
    console.groupEnd();
  }

  // Issues
  const issues = [];

  if (renderBlockingCSS.length > 0 && inlineStyles.length === 0) {
    issues.push({
      severity: "high",
      message: "No critical CSS inlined — all CSS loads via render-blocking requests",
      suggestion:
        'Extract above-the-fold styles into a <style> tag in <head> and defer the rest',
    });
  }

  if (totalRenderBlockingDecoded > criticalBudget) {
    issues.push({
      severity: "high",
      message: `Render-blocking CSS (${formatBytes(totalRenderBlockingDecoded)}) exceeds the 14 KB critical budget`,
      suggestion:
        "Inline critical CSS and defer non-critical stylesheets using the media/onload pattern",
    });
  }

  const largeUnpreloaded = renderBlockingCSS.filter(
    (s) => !s.preloaded && s.transferSize > 10 * 1024
  );
  if (largeUnpreloaded.length > 0) {
    issues.push({
      severity: "medium",
      message: `${largeUnpreloaded.length} large render-blocking stylesheet(s) without preload`,
      details: largeUnpreloaded.map(
        (s) => `• ${s.filename} (${formatBytes(s.transferSize)})`
      ),
      suggestion: 'Add <link rel="preload" as="style" href="..."> to start download earlier',
    });
  }

  if (totalInlineBytes > criticalBudget) {
    issues.push({
      severity: "high",
      message: `Inline CSS (${formatBytes(totalInlineBytes)}) exceeds the 14 KB critical budget`,
      suggestion:
        "Keep inline critical CSS under 14 KB. Move non-critical styles to an external deferred file.",
    });
  }

  const bodyInlineStyles = inlineStyles.filter((s) => !s.inHead);
  if (bodyInlineStyles.length > 0) {
    issues.push({
      severity: "medium",
      message: `${bodyInlineStyles.length} inline style block(s) found in <body>`,
      suggestion:
        "Move critical styles to <head> to avoid potential render-blocking reflows",
    });
  }

  if (issues.length > 0) {
    console.log("");
    console.group("%c⚠️ Issues Found", "color: #f59e0b; font-weight: bold;");
    issues.forEach((issue) => {
      const icon =
        issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`\n${icon} ${issue.message}`);
      if (issue.details) issue.details.forEach((d) => console.log(`   ${d}`));
      console.log(`   → ${issue.suggestion}`);
    });
    console.groupEnd();
  } else {
    console.log("");
    console.log(
      "%c✅ No critical CSS issues detected.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Best practices
  console.log("");
  console.group(
    "%c📖 Critical CSS Best Practices",
    "color: #3b82f6; font-weight: bold;"
  );
  console.log("");
  console.log("• Inline critical above-the-fold CSS in <head> (target: < 14 KB)");
  console.log("• Defer non-critical CSS:");
  console.log(
    '  <link rel="stylesheet" href="styles.css" media="print" onload="this.media=\'all\'">'
  );
  console.log('• Preload critical external CSS: <link rel="preload" as="style" href="...">');
  console.log("• Use Chrome DevTools Coverage tab (Ctrl+Shift+P → Coverage) to find unused CSS");
  console.log("• Automate critical CSS extraction with tools like critical or Critters");
  console.groupEnd();

  console.groupEnd();

  return {
    renderBlocking: renderBlockingCSS,
    nonBlocking: nonBlockingCSS,
    inline: inlineStyles,
    totals: {
      externalTransferBytes: totalExternalTransfer,
      renderBlockingDecodedBytes: totalRenderBlockingDecoded,
      inlineBytes: totalInlineBytes,
    },
  };
})();
