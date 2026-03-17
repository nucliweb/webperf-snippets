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
    const fcpTime = fcpEntry.startTime;
    const rating = valueToRating(fcpTime);
    const {icon: icon, color: color} = RATING[rating];
    const navEntry = performance.getEntriesByType("navigation")[0];
    const ttfb = navEntry?.responseStart ?? 0;
    const resources = performance.getEntriesByType("resource");
    const blockingResources = resources.filter(r => r.renderBlockingStatus === "blocking");
    const lastBlockingEnd = blockingResources.length ? Math.max(...blockingResources.map(r => r.responseEnd)) : ttfb;
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
  const fcpTimeSync = fcpEntrySync.startTime;
  const ratingSync = valueToRating(fcpTimeSync);
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
    }
  };
})();
