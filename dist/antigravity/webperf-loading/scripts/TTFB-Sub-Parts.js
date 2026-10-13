(() => {
  new PerformanceObserver(entryList => {
    const [pageNav] = entryList.getEntriesByType("navigation");
    const activationStart = pageNav.activationStart || 0;
    const waitEnd = Math.max((pageNav.workerStart || pageNav.fetchStart) - activationStart, 0);
    const dnsStart = Math.max(pageNav.domainLookupStart - activationStart, 0);
    const tcpStart = Math.max(pageNav.connectStart - activationStart, 0);
    const tcpEnd = Math.max(pageNav.connectEnd - activationStart, 0);
    const sslStart = pageNav.secureConnectionStart > 0 ? Math.max(pageNav.secureConnectionStart - activationStart, 0) : tcpEnd;
    const responseStart = Math.max(pageNav.responseStart - activationStart, 0);
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
    const subParts = [ {
      name: "Redirect/Wait",
      duration: waitEnd,
      icon: "🔄"
    }, {
      name: "Service Worker/Cache",
      duration: dnsStart - waitEnd,
      icon: "⚙️"
    }, {
      name: "DNS Lookup",
      duration: tcpStart - dnsStart,
      icon: "🔍"
    }, {
      name: "TCP Connection",
      duration: sslStart - tcpStart,
      icon: "🔌"
    }, {
      name: "SSL/TLS",
      duration: tcpEnd - sslStart,
      icon: "🔒"
    }, {
      name: "Server Response",
      duration: responseStart - tcpEnd,
      icon: "📥"
    } ];
    subParts.forEach(({name: name, duration: duration, icon: icon}) => {
      if (duration > 0) void 0;
    });
    const longestPhase = subParts.reduce((a, b) => a.duration > b.duration ? a : b);
    if (longestPhase.duration > responseStart * 0.4 && responseStart > 800) {
    }
  }).observe({
    type: "navigation",
    buffered: true
  });
  const [navSync] = performance.getEntriesByType("navigation");
  if (!navSync) return {
    script: "TTFB-Sub-Parts",
    status: "error",
    error: "No navigation entry"
  };
  const activStartSync = navSync.activationStart || 0;
  const ttfbValueSync = Math.max(0, navSync.responseStart - activStartSync);
  const value = Math.round(ttfbValueSync);
  const rating = value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
  const waitEndSync = Math.max((navSync.workerStart || navSync.fetchStart) - activStartSync, 0);
  const dnsStartSync = Math.max(navSync.domainLookupStart - activStartSync, 0);
  const tcpStartSync = Math.max(navSync.connectStart - activStartSync, 0);
  const tcpEndSync = Math.max(navSync.connectEnd - activStartSync, 0);
  const sslStartSync = navSync.secureConnectionStart > 0 ? Math.max(navSync.secureConnectionStart - activStartSync, 0) : tcpEndSync;
  const subPartsSync = [ {
    key: "redirectWait",
    duration: waitEndSync
  }, {
    key: "serviceWorkerCache",
    duration: dnsStartSync - waitEndSync
  }, {
    key: "dnsLookup",
    duration: tcpStartSync - dnsStartSync
  }, {
    key: "tcpConnection",
    duration: sslStartSync - tcpStartSync
  }, {
    key: "sslTls",
    duration: tcpEndSync - sslStartSync
  }, {
    key: "serverResponse",
    duration: ttfbValueSync - tcpEndSync
  } ];
  const slowestSync = subPartsSync.reduce((a, b) => a.duration > b.duration ? a : b);
  const phaseLabels = {
    redirectWait: "redirect and wait",
    serviceWorkerCache: "service worker and cache",
    dnsLookup: "DNS lookup",
    tcpConnection: "TCP connection",
    sslTls: "SSL/TLS",
    serverResponse: "server response"
  };
  const phaseFixes = {
    redirectWait: "minimize redirects and link to the final URL",
    serviceWorkerCache: "review the service worker startup and consider a cache-first strategy",
    dnsLookup: "use dns-prefetch or a faster DNS provider",
    tcpConnection: "enable HTTP/2 or HTTP/3 and keep connections alive",
    sslTls: "enable TLS 1.3 and session resumption, and check the certificate chain",
    serverResponse: "optimize server processing, cache the HTML and check slow queries"
  };
  const issues = [];
  if (rating !== "good") {
    const slowestMs = Math.round(slowestSync.duration);
    const share = ttfbValueSync > 0 ? Math.round(slowestSync.duration / ttfbValueSync * 100) : 0;
    issues.push({
      severity: rating === "poor" ? "error" : "warning",
      message: `TTFB is ${value} ms (${rating}); ${phaseLabels[slowestSync.key]} takes ${slowestMs} ms of it (${share}%). Fix: ${phaseFixes[slowestSync.key]}.`
    });
  }
  return {
    script: "TTFB-Sub-Parts",
    status: "ok",
    metric: "TTFB",
    value: value,
    unit: "ms",
    rating: rating,
    thresholds: {
      good: 800,
      needsImprovement: 1800
    },
    details: {
      subParts: Object.fromEntries(subPartsSync.map(p => [ p.key, {
        value: Math.round(p.duration),
        unit: "ms"
      } ])),
      slowestPhase: slowestSync.key
    },
    issues: issues
  };
})();
