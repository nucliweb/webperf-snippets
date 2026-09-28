// CLS Quick Check
// https://webperf-snippets.nucliweb.net

(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("layout-shift")) {
    console.warn("⚠️ layout-shift entries are not supported in this browser.");
    return { script: "CLS", status: "unsupported", error: "layout-shift entries not supported in this browser" };
  }
  // CLS is the largest session window: shifts less than 1s apart, in a window of at most 5s.
  let cls = 0;
  let sessionValue = 0;
  let sessionFirst = null;
  let sessionLast = null;

  const addShift = (entry) => {
    if (entry.hadRecentInput) return;
    if (
      sessionLast &&
      entry.startTime - sessionLast.startTime < 1000 &&
      entry.startTime - sessionFirst.startTime < 5000
    ) {
      sessionValue += entry.value;
    } else {
      sessionValue = entry.value;
      sessionFirst = entry;
    }
    sessionLast = entry;
    cls = Math.max(cls, sessionValue);
  };

  const valueToRating = (score) =>
    score <= 0.1 ? "good" : score <= 0.25 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const logCLS = () => {
    const rating = valueToRating(cls);
    const { icon, color } = RATING[rating];
    console.log(
      `%cCLS: ${icon} ${cls.toFixed(4)} (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) addShift(entry);
    logCLS();
  });

  observer.observe({ type: "layout-shift", buffered: true });

  // Update on visibility change (final CLS)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      console.log("%c📊 Final CLS (on page hide):", "font-weight: bold;");
      logCLS();
    }
  });

  // Expose function for manual check
  window.getCLS = () => {
    logCLS();
    const rating = valueToRating(cls);
    return {
      script: "CLS",
      status: "ok",
      metric: "CLS",
      value: Math.round(cls * 10000) / 10000,
      unit: "score",
      rating,
      thresholds: { good: 0.1, needsImprovement: 0.25 },
    };
  };

  console.log(
    "   Call %cgetCLS()%c anytime to check current value.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );

  // Return for agent. Chrome only exposes layout-shift entries through a PerformanceObserver,
  // so wait for the buffered observer above to deliver them.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const clsSync = cls;
  const clsRating = valueToRating(clsSync);
  return {
    script: "CLS",
    status: "ok",
    metric: "CLS",
    value: Math.round(clsSync * 10000) / 10000,
    unit: "score",
    rating: clsRating,
    thresholds: { good: 0.1, needsImprovement: 0.25 },
    message: "CLS tracking active. Call getCLS() for updated value after page interactions.",
    getDataFn: "getCLS",
  };
})();
