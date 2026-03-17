(() => {
  new PerformanceObserver(entryList => {
    const entries = entryList.getEntries();
    const resourcesData = entries.filter(entry => entry.responseStart > 0).map(entry => {
      const url = new URL(entry.name);
      const isThirdParty = url.hostname !== location.hostname;
      return {
        ttfb: entry.responseStart,
        duration: entry.duration,
        type: entry.initiatorType,
        thirdParty: isThirdParty,
        resource: entry.name.length > 70 ? "..." + entry.name.slice(-67) : entry.name,
        fullUrl: entry.name
      };
    }).sort((a, b) => b.ttfb - a.ttfb);
    if (resourcesData.length === 0) {
      return;
    }
    const ttfbValues = resourcesData.map(r => r.ttfb);
    ttfbValues.reduce((a, b) => a + b, 0), ttfbValues.length;
    Math.max(...ttfbValues);
    Math.min(...ttfbValues);
    resourcesData.filter(r => r.thirdParty).length;
    const slowResources = resourcesData.filter(r => r.ttfb > 500).length;
    if (slowResources > 0) void 0;
    resourcesData.slice(0, 25).map(({fullUrl: fullUrl, ...rest}) => ({
      "TTFB (ms)": rest.ttfb.toFixed(0),
      "Duration (ms)": rest.duration.toFixed(0),
      Type: rest.type,
      "3rd Party": rest.thirdParty ? "Yes" : "",
      Resource: rest.resource
    }));
    if (resourcesData.length > 25) void 0;
    const slowest = resourcesData.slice(0, 5);
    if (slowest[0].ttfb > 500) {
      slowest.forEach((r, i) => {
        r.thirdParty;
      });
    }
  }).observe({
    type: "resource",
    buffered: true
  });
  const resourcesSync = performance.getEntriesByType("resource").filter(entry => entry.responseStart > 0).map(entry => {
    const url = new URL(entry.name);
    return {
      url: entry.name,
      ttfbMs: Math.round(entry.responseStart),
      durationMs: Math.round(entry.duration),
      type: entry.initiatorType,
      isThirdParty: url.hostname !== location.hostname
    };
  }).sort((a, b) => b.ttfbMs - a.ttfbMs);
  if (resourcesSync.length === 0) return {
    script: "TTFB-Resources",
    status: "error",
    error: "No resources with TTFB data available"
  };
  const ttfbVals = resourcesSync.map(r => r.ttfbMs);
  return {
    script: "TTFB-Resources",
    status: "ok",
    count: resourcesSync.length,
    details: {
      avgTtfbMs: Math.round(ttfbVals.reduce((a, b) => a + b, 0) / ttfbVals.length),
      maxTtfbMs: Math.max(...ttfbVals),
      minTtfbMs: Math.min(...ttfbVals),
      thirdPartyCount: resourcesSync.filter(r => r.isThirdParty).length,
      slowCount: resourcesSync.filter(r => r.ttfbMs > 500).length
    },
    items: resourcesSync
  };
})();
