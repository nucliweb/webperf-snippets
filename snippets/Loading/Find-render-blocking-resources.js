// Find render-blocking resources
// https://webperf-snippets.nucliweb.net

(() => {
  // Check browser support
  const testEntry = performance.getEntriesByType("resource")[0];
  if (testEntry && !("renderBlockingStatus" in testEntry)) {
    console.log(
      "%c⚠️ renderBlockingStatus not supported in this browser",
      "color: #f59e0b; font-weight: bold;"
    );
    console.log("This API is currently Chromium-only (Chrome 107+, Edge 107+).");
    console.log("Try using Chrome or Edge to analyze render-blocking resources.");
    return { script: "Find-render-blocking-resources", status: "unsupported", error: "renderBlockingStatus API requires Chrome 107+" };
  }

  const blockingResources = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.renderBlockingStatus === "blocking")
    .map((entry) => {
      const url = new URL(entry.name);
      return {
        name: entry.name,
        shortName: url.pathname.split("/").pop() || url.pathname,
        type: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        responseEnd: entry.responseEnd,
        size: entry.transferSize || 0,
      };
    })
    .sort((a, b) => b.responseEnd - a.responseEnd);

  console.group("%c🚧 Render-Blocking Resources", "font-weight: bold; font-size: 14px;");

  if (blockingResources.length === 0) {
    console.log(
      "%c✅ No render-blocking resources found!",
      "color: #22c55e; font-weight: bold;"
    );
    console.log("The page has no resources blocking initial render.");
    console.log("");
    console.log("%c💡 This could mean:", "font-weight: bold;");
    console.log("   • CSS is inlined or loaded asynchronously");
    console.log("   • Scripts use async or defer attributes");
    console.log("   • Critical resources are optimized");
  } else {
    // Calculate metrics
    const lastBlockingEnd = Math.max(...blockingResources.map((r) => r.responseEnd));
    const totalSize = blockingResources.reduce((sum, r) => sum + r.size, 0);
    const byType = blockingResources.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});

    // Summary
    console.log(
      `%c⚠️ Found ${blockingResources.length} render-blocking resource(s)`,
      "color: #ef4444; font-weight: bold; font-size: 14px;"
    );
    console.log("");

    console.log("%c📊 Impact Summary:", "font-weight: bold;");
    console.log(`   Rendering blocked until: ${lastBlockingEnd.toFixed(0)}ms`);
    console.log(`   Total blocking resources: ${blockingResources.length}`);
    if (totalSize > 0) {
      const sizeKB = (totalSize / 1024).toFixed(1);
      console.log(`   Total size: ${sizeKB} KB`);
    }
    console.log(`   By type: ${Object.entries(byType).map(([k, v]) => `${k} (${v})`).join(", ")}`);

    // Timeline visualization
    console.log("");
    console.log("%c⏱️ Timeline (sorted by completion):", "font-weight: bold;");

    const formatBar = (end, max) => {
      const pct = (end / max) * 100;
      const width = Math.round(pct / 5);
      return "█".repeat(width) + "░".repeat(20 - width);
    };

    blockingResources.forEach((r) => {
      const bar = formatBar(r.responseEnd, lastBlockingEnd);
      const sizeInfo = r.size > 0 ? ` (${(r.size / 1024).toFixed(1)} KB)` : "";
      console.log(
        `   ${r.type.padEnd(8)} ${r.responseEnd.toFixed(0).padStart(5)}ms ${bar} ${r.shortName}${sizeInfo}`
      );
    });

    // Table with details
    console.log("");
    console.log("%c📋 Details:", "font-weight: bold;");
    const tableData = blockingResources.map((r) => ({
      Type: r.type,
      "Response End": r.responseEnd.toFixed(0) + "ms",
      Duration: r.duration.toFixed(0) + "ms",
      Size: r.size > 0 ? (r.size / 1024).toFixed(1) + " KB" : "N/A",
      Resource: r.name.length > 60 ? "..." + r.name.slice(-57) : r.name,
    }));
    console.table(tableData);

    // Recommendations
    console.log("");
    console.log("%c📝 How to fix:", "color: #3b82f6; font-weight: bold;");
    console.log("");

    if (byType.script) {
      console.log("%c   Scripts:", "font-weight: bold;");
      console.log("   • Add 'defer' for scripts that don't need to run immediately");
      console.log("   • Add 'async' for independent scripts (analytics, etc.)");
      console.log("   • Move non-critical scripts to end of <body>");
      console.log('%c   <script src="app.js" defer></script>', "font-family: monospace; color: #22c55e;");
      console.log("");
    }

    if (byType.link || byType.css) {
      console.log("%c   CSS:", "font-weight: bold;");
      console.log("   • Inline critical CSS in <head>");
      console.log("   • Load non-critical CSS asynchronously with media='print' trick");
      console.log("   • Use <link rel='preload'> for critical stylesheets");
      console.log('%c   <link rel="preload" href="style.css" as="style" onload="this.rel=\'stylesheet\'">', "font-family: monospace; color: #22c55e;");
      console.log("");
    }

    if (byType.font) {
      console.log("%c   Fonts:", "font-weight: bold;");
      console.log("   • Use font-display: swap in @font-face");
      console.log("   • Preload critical fonts");
      console.log("   • Consider system font stack for initial render");
      console.log('%c   <link rel="preload" href="font.woff2" as="font" type="font/woff2" crossorigin>', "font-family: monospace; color: #22c55e;");
      console.log("");
    }
  }

  console.groupEnd();

  const lastBlockingEnd = blockingResources.length ? Math.max(...blockingResources.map((r) => r.responseEnd)) : 0;
  const totalSizeBytes = blockingResources.reduce((sum, r) => sum + r.size, 0);
  const byType = blockingResources.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});
  return {
    script: "Find-render-blocking-resources",
    status: "ok",
    count: blockingResources.length,
    details: {
      totalBlockingUntilMs: Math.round(lastBlockingEnd),
      totalSizeBytes,
      byType,
    },
    items: blockingResources.map((r) => ({
      type: r.type,
      url: r.name,
      shortName: r.shortName,
      responseEndMs: Math.round(r.responseEnd),
      durationMs: Math.round(r.duration),
      sizeBytes: r.size,
    })),
  };
})();
