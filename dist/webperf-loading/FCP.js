(() => {
  const valueToRating = ms => ms <= 1800 ? "good" : ms <= 3000 ? "needs-improvement" : "poor";
  const RATING = {
    good: {
      icon: "🟢",
      color: "#0CCE6A"
    },
    "needs-improvement": {
      icon: "🟡",
      color: "#FFA400"
    },
    poor: {
      icon: "🔴",
      color: "#FF4E42"
    }
  };
  new PerformanceObserver(list => {
    const fcpEntry = list.getEntriesByName("first-contentful-paint")[0];
    if (!fcpEntry) return;
    const navEntry = performance.getEntriesByType("navigation")[0];
    const activationStart = navEntry?.activationStart || 0;
    const fcpTime = Math.max(0, fcpEntry.startTime - activationStart);
    const rating = valueToRating(fcpTime);
    const {icon: icon, color: color} = RATING[rating];
    const ttfb = Math.max(0, (navEntry?.responseStart ?? 0) - activationStart);
    const resources = performance.getEntriesByType("resource");
    const blockingResources = resources.filter(r => r.renderBlockingStatus === "blocking");
    const lastBlockingEnd = blockingResources.length ? Math.max(...blockingResources.map(r => r.responseEnd)) - activationStart : ttfb;
    if (blockingResources.length > 0) void 0;
    if (blockingResources.length > 0) {
      Math.max(0, lastBlockingEnd - ttfb);
      blockingResources.sort((a, b) => b.responseEnd - a.responseEnd).forEach(r => {
        r.name.split("/").pop().split("?")[0] || r.name;
        r.initiatorType;
      });
    } else void 0;
  }).observe({
    type: "paint",
    buffered: true
  });
  const fcpEntrySync = performance.getEntriesByName("first-contentful-paint")[0];
  if (!fcpEntrySync) return {
    script: "FCP",
    status: "error",
    error: "No FCP entry yet"
  };
  const navEntrySync = performance.getEntriesByType("navigation")[0];
  const activationStartSync = navEntrySync?.activationStart || 0;
  const fcpTimeSync = Math.max(0, fcpEntrySync.startTime - activationStartSync);
  const ratingSync = valueToRating(fcpTimeSync);
  const ttfbSync = Math.max(0, (navEntrySync?.responseStart ?? 0) - activationStartSync);
  const blockingSync = performance.getEntriesByType("resource").filter(r => r.renderBlockingStatus === "blocking");
  const lastBlockingEndSync = Math.max(ttfbSync, ...blockingSync.map(r => r.responseEnd - activationStartSync));
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
    thresholds: {
      good: 1800,
      needsImprovement: 3000
    },
    details: {
      ttfbMs: ttfbMs,
      renderBlockingLoadMs: renderBlockingLoadMs,
      renderDelayMs: renderDelayMs,
      blockingResourceCount: blockingSync.length
    },
    items: [ ...blockingSync ].sort((a, b) => b.responseEnd - a.responseEnd).slice(0, 50).map(r => ({
      url: r.name.split("/").pop().split("?")[0] || r.name,
      type: r.initiatorType === "link" ? "CSS" : "JS",
      durationMs: Math.round(r.duration)
    }))
  };
})();
