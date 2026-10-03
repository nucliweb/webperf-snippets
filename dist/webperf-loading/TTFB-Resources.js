(() => {
  const OWN_DOMAINS = [];
  const waitTime = entry => entry.responseStart - entry.requestStart;
  const hasTiming = entry => entry.responseStart > 0;
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const secondLevelSuffixes = [ "ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch" ];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  function isFirstParty(hostname) {
    const root = getRootDomain(hostname);
    if (root === getRootDomain(location.hostname)) return true;
    return OWN_DOMAINS.some(d => getRootDomain(String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]) === root);
  }
  function logOwnDomainsHint(thirdPartyCount) {
    if (OWN_DOMAINS.length === 0 && thirdPartyCount > 0) void 0;
  }
  const isThirdPartyUrl = name => {
    try {
      return !isFirstParty(new URL(name).hostname);
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
    const thirdPartyCount = resourcesData.filter(r => r.thirdParty).length;
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
    logOwnDomainsHint(thirdPartyCount);
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
    corsLimitedAnalysis: corsRestrictedCount > 0,
    details: {
      corsRestrictedCount: corsRestrictedCount
    }
  };
  const ttfbVals = resourcesSync.map(r => r.ttfbMs);
  const MAX_ITEMS = 50;
  return {
    script: "TTFB-Resources",
    status: "ok",
    count: resourcesSync.length,
    corsLimitedAnalysis: corsRestrictedCount > 0,
    details: {
      avgTtfbMs: Math.round(ttfbVals.reduce((a, b) => a + b, 0) / ttfbVals.length),
      maxTtfbMs: Math.max(...ttfbVals),
      minTtfbMs: Math.min(...ttfbVals),
      thirdPartyCount: resourcesSync.filter(r => r.isThirdParty).length,
      slowCount: resourcesSync.filter(r => r.ttfbMs > 500).length,
      corsRestrictedCount: corsRestrictedCount
    },
    items: resourcesSync.slice(0, MAX_ITEMS)
  };
})();
