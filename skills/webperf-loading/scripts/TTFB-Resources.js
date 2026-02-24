// Measure TTFB for all resources with sorting and summary
// https://webperf-snippets.nucliweb.net

new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();

  const resourcesData = entries
    .filter((entry) => entry.responseStart > 0)
    .map((entry) => {
      const url = new URL(entry.name);
      const isThirdParty = url.hostname !== location.hostname;

      return {
        ttfb: entry.responseStart,
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
  if (slowResources > 0) {
    console.log(`%c   ⚠️ Slow resources (>500ms): ${slowResources}`, "color: #f59e0b;");
  }

  // Table (sorted by TTFB, slowest first)
  console.log("");
  console.log("%cResources (sorted by TTFB, slowest first):", "font-weight: bold;");
  const tableData = resourcesData.slice(0, 25).map(({ fullUrl, ...rest }) => ({
    "TTFB (ms)": rest.ttfb.toFixed(0),
    "Duration (ms)": rest.duration.toFixed(0),
    Type: rest.type,
    "3rd Party": rest.thirdParty ? "Yes" : "",
    Resource: rest.resource,
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
