// Measure TTFB with threshold indicator
// https://webperf-snippets.nucliweb.net

(() => {
  new PerformanceObserver((entryList) => {
    const [pageNav] = entryList.getEntriesByType("navigation");
    const ttfb = pageNav.responseStart;

    let rating, color;
    if (ttfb <= 800) {
      rating = "Good";
      color = "#22c55e";
    } else if (ttfb <= 1800) {
      rating = "Needs Improvement";
      color = "#f59e0b";
    } else {
      rating = "Poor";
      color = "#ef4444";
    }

    console.log(
      `%cTTFB: ${ttfb.toFixed(0)}ms (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );
  }).observe({
    type: "navigation",
    buffered: true,
  });

  // Synchronous return for agent
  const [nav] = performance.getEntriesByType("navigation");
  if (!nav) return { script: "TTFB", status: "error", error: "No navigation entry" };
  const value = Math.round(nav.responseStart);
  const rating = value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
  return { script: "TTFB", status: "ok", metric: "TTFB", value, unit: "ms", rating,
    thresholds: { good: 800, needsImprovement: 1800 } };
})();
