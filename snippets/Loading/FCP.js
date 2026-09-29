// FCP Analysis
// First Contentful Paint with render-blocking phase breakdown
// https://webperf-snippets.nucliweb.net

(() => {
  const valueToRating = (ms) =>
    ms <= 1800 ? "good" : ms <= 3000 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const ms = (val) => `${Math.round(val)}ms`;

  new PerformanceObserver((list) => {
    const fcpEntry = list.getEntriesByName("first-contentful-paint")[0];
    if (!fcpEntry) return;

    const navEntry = performance.getEntriesByType("navigation")[0];
    // Prerendered pages: measure from activation, not from the start of the prerender
    const activationStart = navEntry?.activationStart || 0;
    const fcpTime = Math.max(0, fcpEntry.startTime - activationStart);
    const rating = valueToRating(fcpTime);
    const { icon, color } = RATING[rating];

    const ttfb = Math.max(0, (navEntry?.responseStart ?? 0) - activationStart);

    // Render-blocking resources (Chrome 107+, requires renderBlockingStatus API)
    const resources = performance.getEntriesByType("resource");
    const blockingResources = resources.filter(
      (r) => r.renderBlockingStatus === "blocking"
    );

    const lastBlockingEnd = blockingResources.length
      ? Math.max(...blockingResources.map((r) => r.responseEnd)) - activationStart
      : ttfb;

    console.group(
      `%cFCP: ${icon} ${(fcpTime / 1000).toFixed(2)}s (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    // Phase breakdown
    console.log("");
    console.log("%cPhase Breakdown:", "font-weight: bold;");
    console.log(`   TTFB:                  ${ms(ttfb)}`);
    if (blockingResources.length > 0) {
      console.log(
        `   Render-blocking load:  ${ms(Math.max(0, lastBlockingEnd - ttfb))}`
      );
    }
    console.log(
      `   Render delay:          ${ms(Math.max(0, fcpTime - lastBlockingEnd))}`
    );

    // Render-blocking summary
    console.log("");
    if (blockingResources.length > 0) {
      const totalBlockingTime = Math.max(0, lastBlockingEnd - ttfb);
      console.log(
        `%c⚠ ${blockingResources.length} render-blocking resource(s) — adding ${ms(totalBlockingTime)} before paint`,
        "color: #FFA400; font-weight: bold;"
      );
      blockingResources
        .sort((a, b) => b.responseEnd - a.responseEnd)
        .forEach((r) => {
          const filename = r.name.split("/").pop().split("?")[0] || r.name;
          const type = r.initiatorType === "link" ? "CSS" : "JS";
          console.log(`   [${type}] ${ms(r.duration)}  ${filename}`);
        });
      console.log("");
      console.log(
        "%c→ Find Render-Blocking Resources: %chttps://webperf-snippets.nucliweb.net/Loading/Find-render-blocking-resources",
        "color: #3b82f6;",
        "color: #3b82f6; text-decoration: underline;"
      );
    } else {
      console.log(
        "%c✓ No render-blocking resources detected",
        "color: #22c55e;"
      );
    }

    console.groupEnd();
  }).observe({ type: "paint", buffered: true });

  // Synchronous return for agent
  const fcpEntrySync = performance.getEntriesByName("first-contentful-paint")[0];
  if (!fcpEntrySync) return { script: "FCP", status: "error", error: "No FCP entry yet" };
  const navEntrySync = performance.getEntriesByType("navigation")[0];
  const activationStartSync = navEntrySync?.activationStart || 0;
  const fcpTimeSync = Math.max(0, fcpEntrySync.startTime - activationStartSync);
  const ratingSync = valueToRating(fcpTimeSync);

  // Phases, measured from activation like the value: TTFB, then the wait for the last
  // render-blocking resource, then the rest until the paint
  const ttfbSync = Math.max(0, (navEntrySync?.responseStart ?? 0) - activationStartSync);
  const blockingSync = performance
    .getEntriesByType("resource")
    .filter((r) => r.renderBlockingStatus === "blocking");
  const lastBlockingEndSync = Math.max(
    ttfbSync,
    ...blockingSync.map((r) => r.responseEnd - activationStartSync)
  );
  const ttfbMs = Math.round(ttfbSync);
  const renderBlockingLoadMs = Math.round(lastBlockingEndSync - ttfbSync);
  const renderDelayMs = Math.max(0, Math.round(fcpTimeSync) - ttfbMs - renderBlockingLoadMs);

  return {
    script: "FCP",
    status: "ok",
    metric: "FCP",
    value: Math.round(fcpTimeSync),
    unit: "ms",
    rating: ratingSync,
    thresholds: { good: 1800, needsImprovement: 3000 },
    details: {
      ttfbMs,
      renderBlockingLoadMs,
      renderDelayMs,
      blockingResourceCount: blockingSync.length,
    },
    // Render-blocking resources, the last to finish first (at most 50)
    items: [...blockingSync]
      .sort((a, b) => b.responseEnd - a.responseEnd)
      .slice(0, 50)
      .map((r) => ({
        url: r.name.split("/").pop().split("?")[0] || r.name,
        type: r.initiatorType === "link" ? "CSS" : "JS",
        durationMs: Math.round(r.duration),
      })),
  };
})();
