// Measure TTFB for all resources with sorting and summary
// https://webperf-snippets.nucliweb.net

(() => {
  // Waiting time for the first byte of a resource: responseStart is measured from the
  // start of the page, so subtract requestStart. Cross-origin resources without a
  // Timing-Allow-Origin header report 0 for both and cannot be measured.
  const waitTime = (entry) => entry.responseStart - entry.requestStart;
  const hasTiming = (entry) => entry.responseStart > 0;
  // @shared getRootDomain
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    // An IP address has no registrable domain, so each address is its own root
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    // Country-code domains with a second-level suffix: example.co.uk, example.com.au, example.ac.jp
    const secondLevelSuffixes = ["ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch"];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  // @end-shared getRootDomain

  // @shared isFirstParty
  function isFirstParty(hostname) {
    return getRootDomain(hostname) === getRootDomain(location.hostname);
  }
  // @end-shared isFirstParty

  const isThirdPartyUrl = (name) => {
    try {
      return !isFirstParty(new URL(name).hostname);
    } catch {
      return false;
    }
  };

  new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const restrictedCount = entries.filter((entry) => !hasTiming(entry)).length;

  const resourcesData = entries
    .filter(hasTiming)
    .map((entry) => {
      const isThirdParty = isThirdPartyUrl(entry.name);

      return {
        ttfb: waitTime(entry),
        duration: entry.duration,
        type: entry.initiatorType,
        thirdParty: isThirdParty,
        resource: entry.name.length > 70 ? "..." + entry.name.slice(-67) : entry.name,
        fullUrl: entry.name,
      };
    })
    .sort((a, b) => b.ttfb - a.ttfb);

  if (resourcesData.length === 0) {
    console.log("%c⚠️ No resources with TTFB data available", "color: #f59e0b;");
    console.log("Resources may be cached or missing Timing-Allow-Origin header.");
    return;
  }

  // Summary statistics
  const ttfbValues = resourcesData.map((r) => r.ttfb);
  const avgTtfb = ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length;
  const maxTtfb = Math.max(...ttfbValues);
  const minTtfb = Math.min(...ttfbValues);
  const thirdPartyCount = resourcesData.filter((r) => r.thirdParty).length;
  const slowResources = resourcesData.filter((r) => r.ttfb > 500).length;

  console.group(`%c📊 Resource TTFB Analysis (${resourcesData.length} resources)`, "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Average TTFB: ${avgTtfb.toFixed(0)}ms`);
  console.log(`   Fastest: ${minTtfb.toFixed(0)}ms | Slowest: ${maxTtfb.toFixed(0)}ms`);
  console.log(`   Third-party resources: ${thirdPartyCount}`);
  if (restrictedCount > 0) {
    console.log(`%c   ⚠️ ${restrictedCount} resource(s) not measured: missing Timing-Allow-Origin header`, "color: #f59e0b;");
  }
  if (slowResources > 0) {
    console.log(`%c   ⚠️ Slow resources (>500ms): ${slowResources}`, "color: #f59e0b;");
  }

  // Table (sorted by TTFB, slowest first)
  console.log("");
  console.log("%cResources (sorted by TTFB, slowest first):", "font-weight: bold;");
  const tableData = resourcesData.slice(0, 25).map((resource) => ({
    "TTFB (ms)": resource.ttfb.toFixed(0),
    "Duration (ms)": resource.duration.toFixed(0),
    Type: resource.type,
    "3rd Party": resource.thirdParty ? "Yes" : "",
    Resource: resource.resource,
  }));
  console.table(tableData);

  if (resourcesData.length > 25) {
    console.log(`... and ${resourcesData.length - 25} more resources`);
  }

  // Slowest resources highlight
  const slowest = resourcesData.slice(0, 5);
  if (slowest[0].ttfb > 500) {
    console.log("");
    console.log("%c🐌 Slowest resources:", "color: #ef4444; font-weight: bold;");
    slowest.forEach((r, i) => {
      const marker = r.thirdParty ? " [3rd party]" : "";
      console.log(`   ${i + 1}. ${r.ttfb.toFixed(0)}ms - ${r.type}${marker}: ${r.resource}`);
    });
  }

  console.groupEnd();
  }).observe({
    type: "resource",
    buffered: true,
  });

  // Synchronous return for agent
  const allResources = performance.getEntriesByType("resource");
  const corsRestrictedCount = allResources.filter((entry) => !hasTiming(entry)).length;
  const resourcesSync = allResources
    .filter(hasTiming)
    .map((entry) => ({
      url: entry.name,
      ttfbMs: Math.round(waitTime(entry)),
      durationMs: Math.round(entry.duration),
      type: entry.initiatorType,
      isThirdParty: isThirdPartyUrl(entry.name),
    }))
    .sort((a, b) => b.ttfbMs - a.ttfbMs);
  if (resourcesSync.length === 0) {
    return { script: "TTFB-Resources", status: "error", error: "No resources with TTFB data available", corsLimitedAnalysis: corsRestrictedCount > 0, details: { corsRestrictedCount } };
  }
  const ttfbVals = resourcesSync.map((r) => r.ttfbMs);
  // The list keeps the 50 slowest resources (already sorted); count and details cover all of them
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
      thirdPartyCount: resourcesSync.filter((r) => r.isThirdParty).length,
      slowCount: resourcesSync.filter((r) => r.ttfbMs > 500).length,
      corsRestrictedCount,
    },
    items: resourcesSync.slice(0, MAX_ITEMS),
  };
})();
