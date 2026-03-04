// FCP Analysis
// First Contentful Paint with render-blocking phase breakdown
// https://webperf-snippets.nucliweb.net

(() => {
  const valueToRating = (ms) =>
    ms <= 1800 ? "good" : ms <= 3000 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const ms = (val) => `${Math.round(val)}ms`;

  new PerformanceObserver((list) => {
    const fcpEntry = list.getEntriesByName("first-contentful-paint")[0];
    if (!fcpEntry) return;

    const fcpTime = fcpEntry.startTime;
    const rating = valueToRating(fcpTime);
    const { icon, color } = RATING[rating];

    const navEntry = performance.getEntriesByType("navigation")[0];
    const ttfb = navEntry?.responseStart ?? 0;

    // Render-blocking resources (Chrome 107+, requires renderBlockingStatus API)
    const resources = performance.getEntriesByType("resource");
    const blockingResources = resources.filter(
      (r) => r.renderBlockingStatus === "blocking"
    );

    const lastBlockingEnd = blockingResources.length
      ? Math.max(...blockingResources.map((r) => r.responseEnd))
      : ttfb;

    console.group(
      `%cFCP: ${icon} ${(fcpTime / 1000).toFixed(2)}s (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    // Phase breakdown
    console.log("");
    console.log("%cPhase Breakdown:", "font-weight: bold;");
    console.log(`   TTFB:                  ${ms(ttfb)}`);
    if (blockingResources.length > 0) {
      console.log(
        `   Render-blocking load:  ${ms(Math.max(0, lastBlockingEnd - ttfb))}`
      );
    }
    console.log(
      `   Render delay:          ${ms(Math.max(0, fcpTime - lastBlockingEnd))}`
    );

    // Render-blocking summary
    console.log("");
    if (blockingResources.length > 0) {
      const totalBlockingTime = Math.max(0, lastBlockingEnd - ttfb);
      console.log(
        `%c⚠ ${blockingResources.length} render-blocking resource(s) — adding ${ms(totalBlockingTime)} before paint`,
        "color: #FFA400; font-weight: bold;"
      );
      blockingResources
        .sort((a, b) => b.responseEnd - a.responseEnd)
        .forEach((r) => {
          const filename = r.name.split("/").pop().split("?")[0] || r.name;
          const type = r.initiatorType === "link" ? "CSS" : "JS";
          console.log(`   [${type}] ${ms(r.duration)}  ${filename}`);
        });
      console.log("");
      console.log(
        "%c→ Find Render-Blocking Resources: %chttps://webperf-snippets.nucliweb.net/Loading/Find-render-blocking-resources",
        "color: #3b82f6;",
        "color: #3b82f6; text-decoration: underline;"
      );
    } else {
      console.log(
        "%c✓ No render-blocking resources detected",
        "color: #22c55e;"
      );
    }

    console.groupEnd();
  }).observe({ type: "paint", buffered: true });
})();
