(() => {
  const phases = [ {
    name: "Redirect",
    start: "redirectStart",
    end: "redirectEnd",
    icon: "🔄"
  }, {
    name: "DNS Lookup",
    start: "domainLookupStart",
    end: "domainLookupEnd",
    icon: "🔍"
  }, {
    name: "TCP Connection",
    start: "connectStart",
    end: "connectEnd",
    icon: "🔌"
  }, {
    name: "SSL/TLS",
    start: "secureConnectionStart",
    end: "connectEnd",
    icon: "🔒"
  }, {
    name: "Request",
    start: "requestStart",
    end: "responseStart",
    icon: "📤"
  }, {
    name: "Response",
    start: "responseStart",
    end: "responseEnd",
    icon: "📥"
  }, {
    name: "DOM Processing",
    start: "responseEnd",
    end: "domContentLoadedEventStart",
    icon: "🏗️"
  }, {
    name: "DOMContentLoaded",
    start: "domContentLoadedEventStart",
    end: "domContentLoadedEventEnd",
    icon: "📄"
  }, {
    name: "Resource Loading",
    start: "domContentLoadedEventEnd",
    end: "loadEventStart",
    icon: "📦"
  }, {
    name: "Load Event",
    start: "loadEventStart",
    end: "loadEventEnd",
    icon: "✅"
  } ];
  new PerformanceObserver(list => {
    const [entry] = list.getEntries();
    const formatMs = ms => ms.toFixed(2) + " ms";
    const formatBar = (ms, total) => {
      const pct = total > 0 ? ms / total * 100 : 0;
      const width = Math.min(Math.round(pct / 2.5), 40);
      return "█".repeat(width) + "░".repeat(Math.max(0, 20 - width));
    };
    const phaseData = phases.map(phase => {
      const start = entry[phase.start] || 0;
      const end = entry[phase.end] || 0;
      let duration = end - start;
      if (phase.name === "SSL/TLS" && entry.secureConnectionStart > 0) duration = entry.connectEnd - entry.secureConnectionStart; else if (phase.name === "TCP Connection" && entry.secureConnectionStart > 0) duration = entry.secureConnectionStart - entry.connectStart;
      return {
        ...phase,
        start: start,
        end: end,
        duration: Math.max(0, duration)
      };
    }).filter(p => p.duration > 0 || p.name === "Redirect");
    const totalTime = entry.loadEventEnd - entry.startTime;
    entry.responseEnd, entry.startTime;
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
    phaseData.forEach(({name: name, duration: duration, icon: icon}) => {
      const pct = duration / totalTime * 100;
      formatBar(duration, totalTime);
      formatMs(duration).padStart(12);
      `${pct.toFixed(1)}%`.padStart(7);
      let phaseColor = "";
      if (duration > totalTime * 0.3) phaseColor = "color: #ef4444;"; else if (duration > totalTime * 0.15) phaseColor = "color: #f59e0b;";
    });
    const longestPhase = phaseData.reduce((a, b) => a.duration > b.duration ? a : b);
    if (longestPhase.duration > totalTime * 0.25) {
    }
  }).observe({
    type: "navigation",
    buffered: true
  });
  const [navSync] = performance.getEntriesByType("navigation");
  if (!navSync) return {
    script: "Event-Processing-Time",
    status: "error",
    error: "No navigation entry"
  };
  const totalTimeSync = navSync.loadEventEnd - navSync.startTime;
  const networkTimeSync = (navSync.responseEnd || 0) - navSync.startTime;
  const ratingSync = totalTimeSync <= 2500 ? "good" : totalTimeSync <= 4000 ? "needs-improvement" : "poor";
  const phasesSync = [ {
    key: "redirect",
    duration: Math.max(0, navSync.redirectEnd - navSync.redirectStart)
  }, {
    key: "dnsLookup",
    duration: Math.max(0, navSync.domainLookupEnd - navSync.domainLookupStart)
  }, {
    key: "tcpConnection",
    duration: Math.max(0, (navSync.secureConnectionStart > 0 ? navSync.secureConnectionStart : navSync.connectEnd) - navSync.connectStart)
  }, {
    key: "sslTls",
    duration: navSync.secureConnectionStart > 0 ? Math.max(0, navSync.connectEnd - navSync.secureConnectionStart) : 0
  }, {
    key: "request",
    duration: Math.max(0, navSync.responseStart - navSync.requestStart)
  }, {
    key: "response",
    duration: Math.max(0, navSync.responseEnd - navSync.responseStart)
  }, {
    key: "domProcessing",
    duration: Math.max(0, navSync.domContentLoadedEventStart - navSync.responseEnd)
  }, {
    key: "domContentLoaded",
    duration: Math.max(0, navSync.domContentLoadedEventEnd - navSync.domContentLoadedEventStart)
  }, {
    key: "resourceLoading",
    duration: Math.max(0, navSync.loadEventStart - navSync.domContentLoadedEventEnd)
  }, {
    key: "loadEvent",
    duration: Math.max(0, navSync.loadEventEnd - navSync.loadEventStart)
  } ];
  const nonZeroPhases = phasesSync.filter(p => p.duration > 0);
  const slowestPhase = nonZeroPhases.length > 0 ? nonZeroPhases.reduce((a, b) => a.duration > b.duration ? a : b) : phasesSync[0];
  return {
    script: "Event-Processing-Time",
    status: "ok",
    value: Math.round(totalTimeSync),
    unit: "ms",
    rating: ratingSync,
    thresholds: {
      good: 2500,
      needsImprovement: 4000
    },
    details: {
      networkTimeMs: Math.round(networkTimeSync),
      processingTimeMs: Math.round(totalTimeSync - networkTimeSync),
      ttfbMs: Math.round(navSync.responseStart),
      domContentLoadedMs: Math.round(navSync.domContentLoadedEventEnd),
      loadCompleteMs: Math.round(navSync.loadEventEnd),
      phases: Object.fromEntries(phasesSync.map(p => [ p.key, {
        value: Math.round(p.duration),
        unit: "ms"
      } ])),
      slowestPhase: slowestPhase.key
    }
  };
})();
