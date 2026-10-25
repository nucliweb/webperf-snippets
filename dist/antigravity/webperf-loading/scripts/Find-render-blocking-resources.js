(() => {
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
  const testEntry = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e))[0];
  if (testEntry && !("renderBlockingStatus" in testEntry)) {
    return {
      script: "Find-render-blocking-resources",
      status: "unsupported",
      error: "renderBlockingStatus API requires Chrome 107+"
    };
  }
  const blockingResources = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e)).filter(entry => entry.renderBlockingStatus === "blocking").map(entry => {
    const url = new URL(entry.name);
    return {
      name: entry.name,
      shortName: url.pathname.split("/").pop() || url.pathname,
      type: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      responseEnd: entry.responseEnd,
      size: entry.transferSize || 0
    };
  }).sort((a, b) => b.responseEnd - a.responseEnd);
  const lastBlockingEnd = blockingResources.length ? Math.max(...blockingResources.map(r => r.responseEnd)) : 0;
  const totalSizeBytes = blockingResources.reduce((sum, r) => sum + r.size, 0);
  const byType = blockingResources.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});
  if (blockingResources.length === 0) {
  } else {
    if (totalSizeBytes > 0) {
      (totalSizeBytes / 1024).toFixed(1);
    }
    const formatBar = (end, max) => {
      const pct = end / max * 100;
      const width = Math.round(pct / 5);
      return "█".repeat(width) + "░".repeat(20 - width);
    };
    blockingResources.forEach(r => {
      formatBar(r.responseEnd, lastBlockingEnd);
      r.size > 0 && (r.size / 1024).toFixed(1);
    });
    blockingResources.map(r => ({
      Type: r.type,
      "Response End": r.responseEnd.toFixed(0) + "ms",
      Duration: r.duration.toFixed(0) + "ms",
      Size: r.size > 0 ? (r.size / 1024).toFixed(1) + " KB" : "N/A",
      Resource: r.name.length > 60 ? "..." + r.name.slice(-57) : r.name
    }));
    if (byType.script) {
    }
    if (byType.link || byType.css) {
    }
    if (byType.font) {
    }
  }
  return {
    script: "Find-render-blocking-resources",
    status: "ok",
    count: blockingResources.length,
    details: {
      totalBlockingUntilMs: Math.round(lastBlockingEnd),
      totalSizeBytes: totalSizeBytes,
      byType: byType
    },
    items: blockingResources.map(r => ({
      type: r.type,
      url: r.name,
      shortName: r.shortName,
      responseEndMs: Math.round(r.responseEnd),
      durationMs: Math.round(r.duration),
      sizeBytes: r.size
    })),
    issues: blockingResources.length > 0 ? [ {
      code: "render-blocking",
      severity: "error",
      message: `${blockingResources.length} render-blocking resource(s) delay rendering until ${Math.round(lastBlockingEnd)}ms`
    } ] : []
  };
})();
