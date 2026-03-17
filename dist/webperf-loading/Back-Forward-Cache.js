(() => {
  const results = {
    supported: "PerformanceNavigationTiming" in window,
    wasRestored: false,
    eligibility: null,
    blockingReasons: [],
    recommendations: []
  };
  const checkRestoration = () => {
    window.addEventListener("pageshow", event => {
      if (event.persisted) {
        results.wasRestored = true;
      }
    });
    if (results.supported) {
      const navEntry = performance.getEntriesByType("navigation")[0];
      if (navEntry && navEntry.type === "back_forward") if (navEntry.activationStart > 0) results.wasRestored = true;
    }
  };
  const testEligibility = () => {
    const issues = [];
    const recs = [];
    const hasUnload = window.onunload !== null || window.onbeforeunload !== null;
    if (hasUnload) {
      issues.push({
        reason: "unload/beforeunload handler detected",
        severity: "high",
        description: "These handlers block bfcache"
      });
      recs.push("Remove unload/beforeunload handlers. Use pagehide or visibilitychange instead.");
    }
    const meta = document.querySelector('meta[http-equiv="Cache-Control"]');
    if (meta && meta.content.includes("no-store")) {
      issues.push({
        reason: "Cache-Control: no-store in meta tag",
        severity: "high",
        description: "Prevents page from being cached"
      });
      recs.push("Remove Cache-Control: no-store or change to no-cache.");
    }
    if (window.indexedDB) {
      const hasIndexedDB = performance.getEntriesByType("resource").some(r => r.name.includes("indexedDB"));
      if (hasIndexedDB) {
        issues.push({
          reason: "IndexedDB may be in use",
          severity: "medium",
          description: "Open IndexedDB transactions block bfcache"
        });
        recs.push("Close IndexedDB connections before page hide.");
      }
    }
    if (window.BroadcastChannel) issues.push({
      reason: "BroadcastChannel API available (check if in use)",
      severity: "low",
      description: "Open BroadcastChannel connections may block bfcache"
    });
    const iframes = document.querySelectorAll("iframe");
    if (iframes.length > 0) {
      issues.push({
        reason: `${iframes.length} iframe(s) detected`,
        severity: "medium",
        description: "Iframes with bfcache blockers will block parent page"
      });
      recs.push("Ensure iframes are also bfcache compatible.");
    }
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) issues.push({
      reason: "Service Worker active",
      severity: "info",
      description: "Service Workers with fetch handlers are generally OK, but check for ongoing operations"
    });
    if (window.WebSocket) {
      issues.push({
        reason: "WebSocket API available (check if connections are open)",
        severity: "medium",
        description: "Open WebSocket connections block bfcache"
      });
      recs.push("Close WebSocket connections before page hide.");
    }
    const resources = performance.getEntriesByType("resource");
    const recent = resources.filter(r => r.responseEnd === 0 || performance.now() - r.responseEnd < 100);
    if (recent.length > 0) {
      issues.push({
        reason: `${recent.length} recent/ongoing network requests`,
        severity: "low",
        description: "Ongoing requests may prevent bfcache"
      });
      recs.push("Ensure requests complete or are aborted on page hide.");
    }
    results.blockingReasons = issues;
    results.recommendations = recs;
    const highSeverity = issues.filter(i => i.severity === "high").length;
    const mediumSeverity = issues.filter(i => i.severity === "medium").length;
    if (highSeverity > 0) results.eligibility = "blocked"; else if (mediumSeverity > 1) results.eligibility = "likely-blocked"; else if (issues.length > 0) results.eligibility = "potentially-eligible"; else results.eligibility = "likely-eligible";
    return results.eligibility;
  };
  const displayResults = () => {
    const statusIcons = {
      "likely-eligible": "🟢",
      "potentially-eligible": "🟡",
      "likely-blocked": "🟠",
      blocked: "🔴"
    };
    const statusColors = {
      "likely-eligible": "#22c55e",
      "potentially-eligible": "#f59e0b",
      "likely-blocked": "#fb923c",
      blocked: "#ef4444"
    };
    const statusText = {
      "likely-eligible": "Likely Eligible",
      "potentially-eligible": "Potentially Eligible",
      "likely-blocked": "Likely Blocked",
      blocked: "Blocked"
    };
    statusIcons[results.eligibility];
    statusColors[results.eligibility];
    statusText[results.eligibility];
    if (results.wasRestored) {
    } else {
    }
    if (results.supported) {
      const navEntry = performance.getEntriesByType("navigation")[0];
      if (navEntry) {
        if (navEntry.type === "back_forward") if (navEntry.duration < 10) void 0; else void 0;
      }
    }
    if (results.blockingReasons.length > 0) {
      results.blockingReasons.map(issue => ({
        Severity: issue.severity.toUpperCase(),
        Issue: issue.reason,
        Impact: issue.description
      }));
    } else {
    }
    if (results.recommendations.length > 0) {
      results.recommendations.forEach((rec, idx) => {
      });
    }
    return results;
  };
  const checkNotRestoredReasons = () => {
    if (!("PerformanceNavigationTiming" in window)) return null;
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (!navEntry || !navEntry.notRestoredReasons) return null;
    const reasons = navEntry.notRestoredReasons;
    if (reasons.blocked === true) void 0; else void 0;
    if (reasons.url) void 0;
    if (reasons.id) void 0;
    if (reasons.name) void 0;
    if (reasons.src) void 0;
    if (reasons.reasons && reasons.reasons.length > 0) {
      reasons.reasons.forEach((reasonDetail, idx) => {
        const reasonName = reasonDetail.reason || "Unknown reason";
        reasonDetail.source;
        const reasonExplanations = {
          WebSocket: "Open WebSocket connections prevent bfcache. Close them on pagehide event.",
          "unload-listener": "unload event listeners block bfcache. Use pagehide or visibilitychange instead.",
          "response-cache-control-no-store": "Cache-Control: no-store header prevents caching. Change to no-cache.",
          IndexedDB: "Open IndexedDB transactions block bfcache. Close connections on pagehide.",
          BroadcastChannel: "Open BroadcastChannel prevents bfcache. Close it on pagehide.",
          "dedicated-worker": "Dedicated workers can block bfcache. Terminate them on pagehide."
        };
        if (reasonExplanations[reasonName]) void 0;
      });
    }
    if (reasons.children && reasons.children.length > 0) {
      reasons.children.forEach((child, idx) => {
        if (child.blocked) void 0; else void 0;
        if (child.id) void 0;
        if (child.name) void 0;
        if (child.reasons && child.reasons.length > 0) {
          child.reasons.forEach(reasonDetail => {
            if (reasonDetail.source) void 0;
          });
        }
      });
    }
    if (reasons.reasons && reasons.reasons.length > 0) {
      reasons.reasons.map(r => ({
        Reason: r.reason || "Unknown",
        Source: r.source || "N/A"
      }));
    }
    return reasons;
  };
  const checkExecutionTiming = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (navEntry && navEntry.type === "back_forward") {
    }
  };
  checkRestoration();
  testEligibility();
  setTimeout(() => {
    checkExecutionTiming();
    displayResults();
    const notRestoredReasons = checkNotRestoredReasons();
    if (!notRestoredReasons) {
    }
  }, 100);
  window.checkBfcache = () => {
    testEligibility();
    displayResults();
    checkNotRestoredReasons();
    return {
      script: "Back-Forward-Cache",
      status: "ok",
      details: {
        eligibility: results.eligibility,
        wasRestored: results.wasRestored,
        supported: results.supported
      },
      issues: results.blockingReasons.map(i => ({
        severity: i.severity === "high" ? "error" : i.severity === "medium" ? "warning" : "info",
        message: i.reason
      }))
    };
  };
  return {
    script: "Back-Forward-Cache",
    status: "ok",
    details: {
      eligibility: results.eligibility,
      wasRestored: results.wasRestored,
      supported: results.supported
    },
    issues: results.blockingReasons.map(i => ({
      severity: i.severity === "high" ? "error" : i.severity === "medium" ? "warning" : "info",
      message: i.reason
    })),
    message: "bfcache analysis running. Call checkBfcache() to re-run analysis.",
    getDataFn: "checkBfcache"
  };
})();
