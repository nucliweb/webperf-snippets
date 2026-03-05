// Event Processing Time - Analyze page load phases
// https://webperf-snippets.nucliweb.net

(() => {
  const phases = [
    { name: "Redirect", start: "redirectStart", end: "redirectEnd", icon: "🔄" },
    { name: "DNS Lookup", start: "domainLookupStart", end: "domainLookupEnd", icon: "🔍" },
    { name: "TCP Connection", start: "connectStart", end: "connectEnd", icon: "🔌" },
    { name: "SSL/TLS", start: "secureConnectionStart", end: "connectEnd", icon: "🔒" },
    { name: "Request", start: "requestStart", end: "responseStart", icon: "📤" },
    { name: "Response", start: "responseStart", end: "responseEnd", icon: "📥" },
    { name: "DOM Processing", start: "responseEnd", end: "domContentLoadedEventStart", icon: "🏗️" },
    { name: "DOMContentLoaded", start: "domContentLoadedEventStart", end: "domContentLoadedEventEnd", icon: "📄" },
    { name: "Resource Loading", start: "domContentLoadedEventEnd", end: "loadEventStart", icon: "📦" },
    { name: "Load Event", start: "loadEventStart", end: "loadEventEnd", icon: "✅" },
  ];

  new PerformanceObserver((list) => {
    const [entry] = list.getEntries();

    const formatMs = (ms) => ms.toFixed(2) + " ms";
    const formatBar = (ms, total) => {
      const pct = total > 0 ? (ms / total) * 100 : 0;
      const width = Math.min(Math.round(pct / 2.5), 40);
      return "█".repeat(width) + "░".repeat(Math.max(0, 20 - width));
    };

    // Calculate all phase durations
    const phaseData = phases
      .map((phase) => {
        const start = entry[phase.start] || 0;
        const end = entry[phase.end] || 0;
        let duration = end - start;

        // Handle SSL which shares end with TCP
        if (phase.name === "SSL/TLS" && entry.secureConnectionStart > 0) {
          duration = entry.connectEnd - entry.secureConnectionStart;
        } else if (phase.name === "TCP Connection" && entry.secureConnectionStart > 0) {
          duration = entry.secureConnectionStart - entry.connectStart;
        }

        return {
          ...phase,
          start,
          end,
          duration: Math.max(0, duration),
        };
      })
      .filter((p) => p.duration > 0 || p.name === "Redirect");

    const totalTime = entry.loadEventEnd - entry.startTime;
    const networkTime = (entry.responseEnd || 0) - entry.startTime;
    const processingTime = totalTime - networkTime;

    // Rating based on total load time
    let rating, color;
    if (totalTime <= 2500) {
      rating = "Fast";
      color = "#22c55e";
    } else if (totalTime <= 4000) {
      rating = "Moderate";
      color = "#f59e0b";
    } else {
      rating = "Slow";
      color = "#ef4444";
    }

    console.group(
      `%c⏱️ Page Load: ${totalTime.toFixed(0)}ms (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    // Summary
    console.log("");
    console.log("%cSummary:", "font-weight: bold;");
    console.log(`   Network time: ${networkTime.toFixed(0)}ms (${((networkTime / totalTime) * 100).toFixed(0)}%)`);
    console.log(`   Processing time: ${processingTime.toFixed(0)}ms (${((processingTime / totalTime) * 100).toFixed(0)}%)`);
    console.log(`   Total: ${totalTime.toFixed(0)}ms`);

    // Timeline visualization
    console.log("");
    console.log("%cTimeline:", "font-weight: bold;");

    phaseData.forEach(({ name, duration, icon }) => {
      const pct = (duration / totalTime) * 100;
      const bar = formatBar(duration, totalTime);
      const durationStr = formatMs(duration).padStart(12);
      const pctStr = `${pct.toFixed(1)}%`.padStart(7);

      // Color code long phases
      let phaseColor = "";
      if (duration > totalTime * 0.3) {
        phaseColor = "color: #ef4444;"; // Red for >30%
      } else if (duration > totalTime * 0.15) {
        phaseColor = "color: #f59e0b;"; // Orange for >15%
      }

      console.log(
        `%c${icon} ${name.padEnd(18)} ${durationStr} ${pctStr}  ${bar}`,
        phaseColor
      );
    });

    // Key milestones
    console.log("");
    console.log("%cKey Milestones:", "font-weight: bold;");
    console.log(`   TTFB (Time to First Byte): ${entry.responseStart.toFixed(0)}ms`);
    console.log(`   DOMContentLoaded: ${entry.domContentLoadedEventEnd.toFixed(0)}ms`);
    console.log(`   Load Complete: ${entry.loadEventEnd.toFixed(0)}ms`);

    // Find bottleneck
    const longestPhase = phaseData.reduce((a, b) =>
      a.duration > b.duration ? a : b
    );

    if (longestPhase.duration > totalTime * 0.25) {
      console.log("");
      console.log("%c💡 Bottleneck Detected:", "color: #3b82f6; font-weight: bold;");
      console.log(
        `   ${longestPhase.name} takes ${((longestPhase.duration / totalTime) * 100).toFixed(0)}% of total load time`
      );

      const tips = {
        "Redirect": "Minimize redirects. Update links to final URLs.",
        "DNS Lookup": "Use DNS prefetching (<link rel='dns-prefetch'>). Consider faster DNS.",
        "TCP Connection": "Enable HTTP/2 or HTTP/3. Use connection preconnect.",
        "SSL/TLS": "Enable TLS 1.3. Optimize certificate chain. Use session resumption.",
        "Request": "Optimize server response time. Add caching headers.",
        "Response": "Enable compression. Reduce HTML size. Use streaming.",
        "DOM Processing": "Simplify HTML structure. Defer non-critical scripts.",
        "DOMContentLoaded": "Reduce synchronous JavaScript. Use defer/async.",
        "Resource Loading": "Lazy load images. Prioritize critical resources.",
        "Load Event": "Reduce page weight. Optimize resource loading order.",
      };

      console.log(`   Tip: ${tips[longestPhase.name] || "Investigate this phase."}`);
    }

    console.groupEnd();
  }).observe({ type: "navigation", buffered: true });

  // Synchronous return for agent
  const [navSync] = performance.getEntriesByType("navigation");
  if (!navSync) return { script: "Event-Processing-Time", status: "error", error: "No navigation entry" };
  const totalTimeSync = navSync.loadEventEnd - navSync.startTime;
  const networkTimeSync = (navSync.responseEnd || 0) - navSync.startTime;
  const ratingSync = totalTimeSync <= 2500 ? "good" : totalTimeSync <= 4000 ? "needs-improvement" : "poor";
  const phasesSync = [
    { key: "redirect", duration: Math.max(0, navSync.redirectEnd - navSync.redirectStart) },
    { key: "dnsLookup", duration: Math.max(0, navSync.domainLookupEnd - navSync.domainLookupStart) },
    { key: "tcpConnection", duration: Math.max(0, (navSync.secureConnectionStart > 0 ? navSync.secureConnectionStart : navSync.connectEnd) - navSync.connectStart) },
    { key: "sslTls", duration: navSync.secureConnectionStart > 0 ? Math.max(0, navSync.connectEnd - navSync.secureConnectionStart) : 0 },
    { key: "request", duration: Math.max(0, navSync.responseStart - navSync.requestStart) },
    { key: "response", duration: Math.max(0, navSync.responseEnd - navSync.responseStart) },
    { key: "domProcessing", duration: Math.max(0, navSync.domContentLoadedEventStart - navSync.responseEnd) },
    { key: "domContentLoaded", duration: Math.max(0, navSync.domContentLoadedEventEnd - navSync.domContentLoadedEventStart) },
    { key: "resourceLoading", duration: Math.max(0, navSync.loadEventStart - navSync.domContentLoadedEventEnd) },
    { key: "loadEvent", duration: Math.max(0, navSync.loadEventEnd - navSync.loadEventStart) },
  ];
  const nonZeroPhases = phasesSync.filter((p) => p.duration > 0);
  const slowestPhase = nonZeroPhases.length > 0 ? nonZeroPhases.reduce((a, b) => a.duration > b.duration ? a : b) : phasesSync[0];
  return {
    script: "Event-Processing-Time",
    status: "ok",
    value: Math.round(totalTimeSync),
    unit: "ms",
    rating: ratingSync,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      networkTimeMs: Math.round(networkTimeSync),
      processingTimeMs: Math.round(totalTimeSync - networkTimeSync),
      ttfbMs: Math.round(navSync.responseStart),
      domContentLoadedMs: Math.round(navSync.domContentLoadedEventEnd),
      loadCompleteMs: Math.round(navSync.loadEventEnd),
      phases: Object.fromEntries(phasesSync.map((p) => [p.key, { value: Math.round(p.duration), unit: "ms" }])),
      slowestPhase: slowestPhase.key,
    },
  };
})();
