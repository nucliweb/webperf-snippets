(() => {
  const waitTime = entry => entry.responseStart - entry.requestStart;
  const hasTiming = entry => entry.responseStart > 0;
  const isThirdPartyUrl = name => {
    try {
      return new URL(name).hostname !== location.hostname;
    } catch {
      return false;
    }
  };
  new PerformanceObserver(entryList => {
    const entries = entryList.getEntries();
    const restrictedCount = entries.filter(entry => !hasTiming(entry)).length;
    const resourcesData = entries.filter(hasTiming).map(entry => {
      const isThirdParty = isThirdPartyUrl(entry.name);
      return {
        ttfb: waitTime(entry),
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
    if (restrictedCount > 0) void 0;
    if (slowResources > 0) void 0;
    resourcesData.slice(0, 25).map(resource => ({
      "TTFB (ms)": resource.ttfb.toFixed(0),
      "Duration (ms)": resource.duration.toFixed(0),
      Type: resource.type,
      "3rd Party": resource.thirdParty ? "Yes" : "",
      Resource: resource.resource
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
  const allResources = performance.getEntriesByType("resource");
  const corsRestrictedCount = allResources.filter(entry => !hasTiming(entry)).length;
  const resourcesSync = allResources.filter(hasTiming).map(entry => ({
    url: entry.name,
    ttfbMs: Math.round(waitTime(entry)),
    durationMs: Math.round(entry.duration),
    type: entry.initiatorType,
    isThirdParty: isThirdPartyUrl(entry.name)
  })).sort((a, b) => b.ttfbMs - a.ttfbMs);
  if (resourcesSync.length === 0) return {
    script: "TTFB-Resources",
    status: "error",
    error: "No resources with TTFB data available",
    details: {
      corsRestrictedCount: corsRestrictedCount
    }
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
      slowCount: resourcesSync.filter(r => r.ttfbMs > 500).length,
      corsRestrictedCount: corsRestrictedCount
    },
    items: resourcesSync
  };
})();
