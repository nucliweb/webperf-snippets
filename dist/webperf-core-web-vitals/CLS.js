(() => {
  let cls = 0;
  const valueToRating = score => score <= 0.1 ? "good" : score <= 0.25 ? "needs-improvement" : "poor";
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
  const logCLS = () => {
    const rating = valueToRating(cls);
    const {icon: icon, color: color} = RATING[rating];
  };
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
    logCLS();
  });
  observer.observe({
    type: "layout-shift",
    buffered: true
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      logCLS();
    }
  });
  window.getCLS = () => {
    logCLS();
    const rating = valueToRating(cls);
    return {
      script: "CLS",
      status: "ok",
      metric: "CLS",
      value: Math.round(cls * 10000) / 10000,
      unit: "score",
      rating: rating,
      thresholds: {
        good: 0.1,
        needsImprovement: 0.25
      }
    };
  };
  const clsSync = performance.getEntriesByType("layout-shift").reduce((sum, e) => !e.hadRecentInput ? sum + e.value : sum, 0);
  const clsRating = valueToRating(clsSync);
  return {
    script: "CLS",
    status: "ok",
    metric: "CLS",
    value: Math.round(clsSync * 10000) / 10000,
    unit: "score",
    rating: clsRating,
    thresholds: {
      good: 0.1,
      needsImprovement: 0.25
    },
    message: "CLS tracking active. Call getCLS() for updated value after page interactions.",
    getDataFn: "getCLS"
  };
})();
