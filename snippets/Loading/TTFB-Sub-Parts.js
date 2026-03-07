// Measure TTFB sub-parts breakdown
// https://webperf-snippets.nucliweb.net

(() => {
  new PerformanceObserver((entryList) => {
    const [pageNav] = entryList.getEntriesByType("navigation");

    const activationStart = pageNav.activationStart || 0;
    const waitEnd = Math.max((pageNav.workerStart || pageNav.fetchStart) - activationStart, 0);
    const dnsStart = Math.max(pageNav.domainLookupStart - activationStart, 0);
    const tcpStart = Math.max(pageNav.connectStart - activationStart, 0);
    const sslStart = Math.max(pageNav.secureConnectionStart - activationStart, 0);
    const tcpEnd = Math.max(pageNav.connectEnd - activationStart, 0);
    const responseStart = Math.max(pageNav.responseStart - activationStart, 0);

    const formatMs = (ms) => ms.toFixed(2) + " ms";
    const formatBar = (ms, total) => {
      const pct = total > 0 ? (ms / total) * 100 : 0;
      const width = Math.round(pct / 5);
      return "█".repeat(width) + "░".repeat(20 - width) + ` ${pct.toFixed(1)}%`;
    };

    // Rating
    let rating, color;
    if (responseStart <= 800) {
      rating = "Good";
      color = "#22c55e";
    } else if (responseStart <= 1800) {
      rating = "Needs Improvement";
      color = "#f59e0b";
    } else {
      rating = "Poor";
      color = "#ef4444";
    }

    console.group(`%c⏱️ TTFB: ${responseStart.toFixed(0)}ms (${rating})`, `color: ${color}; font-weight: bold; font-size: 14px;`);

    // Sub-parts breakdown
    const subParts = [
      { name: "Redirect/Wait", duration: waitEnd, icon: "🔄" },
      { name: "Service Worker/Cache", duration: dnsStart - waitEnd, icon: "⚙️" },
      { name: "DNS Lookup", duration: tcpStart - dnsStart, icon: "🔍" },
      { name: "TCP Connection", duration: sslStart - tcpStart, icon: "🔌" },
      { name: "SSL/TLS", duration: tcpEnd - sslStart, icon: "🔒" },
      { name: "Server Response", duration: responseStart - tcpEnd, icon: "📥" },
    ];

    console.log("");
    console.log("%cBreakdown:", "font-weight: bold;");
    subParts.forEach(({ name, duration, icon }) => {
      if (duration > 0) {
        console.log(`${icon} ${name.padEnd(20)} ${formatMs(duration).padStart(10)}  ${formatBar(duration, responseStart)}`);
      }
    });

    console.log("");
    console.log(`%c${"─".repeat(60)}`, "color: #666;");
    console.log(`%c📊 Total TTFB${" ".repeat(15)} ${formatMs(responseStart).padStart(10)}`, "font-weight: bold;");

    // Recommendations based on longest phase
    const longestPhase = subParts.reduce((a, b) => (a.duration > b.duration ? a : b));
    if (longestPhase.duration > responseStart * 0.4 && responseStart > 800) {
      console.log("");
      console.log("%c💡 Recommendation:", "color: #3b82f6; font-weight: bold;");
      const tips = {
        "Redirect/Wait": "Minimize redirects. Use direct URLs where possible.",
        "Service Worker/Cache": "Optimize service worker. Consider cache-first strategies.",
        "DNS Lookup": "Use DNS prefetching. Consider a faster DNS provider.",
        "TCP Connection": "Enable HTTP/2 or HTTP/3. Use connection keep-alive.",
        "SSL/TLS": "Enable TLS 1.3. Use session resumption. Check certificate chain.",
        "Server Response": "Optimize server processing. Add caching. Check database queries.",
      };
      console.log(`   ${longestPhase.name} is ${((longestPhase.duration / responseStart) * 100).toFixed(0)}% of TTFB.`);
      console.log(`   ${tips[longestPhase.name]}`);
    }

    console.groupEnd();
  }).observe({
    type: "navigation",
    buffered: true,
  });

  // Synchronous return for agent
  const [navSync] = performance.getEntriesByType("navigation");
  if (!navSync) return { script: "TTFB-Sub-Parts", status: "error", error: "No navigation entry" };
  const activStartSync = navSync.activationStart || 0;
  const ttfbValueSync = Math.max(0, navSync.responseStart - activStartSync);
  const value = Math.round(ttfbValueSync);
  const rating = value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
  const waitEndSync = Math.max((navSync.workerStart || navSync.fetchStart) - activStartSync, 0);
  const dnsStartSync = Math.max(navSync.domainLookupStart - activStartSync, 0);
  const tcpStartSync = Math.max(navSync.connectStart - activStartSync, 0);
  const sslStartSync = Math.max(navSync.secureConnectionStart - activStartSync, 0);
  const tcpEndSync = Math.max(navSync.connectEnd - activStartSync, 0);
  const subPartsSync = [
    { key: "redirectWait", duration: waitEndSync },
    { key: "serviceWorkerCache", duration: dnsStartSync - waitEndSync },
    { key: "dnsLookup", duration: tcpStartSync - dnsStartSync },
    { key: "tcpConnection", duration: sslStartSync - tcpStartSync },
    { key: "sslTls", duration: tcpEndSync - sslStartSync },
    { key: "serverResponse", duration: ttfbValueSync - tcpEndSync },
  ];
  const slowestSync = subPartsSync.reduce((a, b) => a.duration > b.duration ? a : b);
  return {
    script: "TTFB-Sub-Parts",
    status: "ok",
    metric: "TTFB",
    value,
    unit: "ms",
    rating,
    thresholds: { good: 800, needsImprovement: 1800 },
    details: {
      subParts: Object.fromEntries(subPartsSync.map((p) => [p.key, { value: Math.round(p.duration), unit: "ms" }])),
      slowestPhase: slowestSync.key,
    },
  };
})();
