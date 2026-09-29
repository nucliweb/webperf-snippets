(async () => {
  const results = {
    supported: "PerformanceNavigationTiming" in window,
    wasRestored: false,
    eligibility: null,
    blockingReasons: [],
    notRestoredReasons: null,
    recommendations: []
  };
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      results.wasRestored = true;
    }
  });
  const REASON_HELP = {
    "unload-listener": "unload event listeners block bfcache. Use pagehide or visibilitychange instead.",
    "response-cache-control-no-store": "Cache-Control: no-store on the page response prevents caching. Use no-cache instead.",
    websocket: "Open WebSocket connections prevent bfcache. Close them on pagehide.",
    broadcastchannel: "Open BroadcastChannel instances prevent bfcache. Close them on pagehide.",
    "indexeddb-connection": "Open IndexedDB connections prevent bfcache. Close them on pagehide.",
    masked: "The browser does not disclose the exact reason (for example, a cross-origin frame)."
  };
  const serializeReasons = node => node && {
    url: node.url ?? null,
    src: node.src ?? null,
    id: node.id ?? null,
    name: node.name ?? null,
    reasons: (node.reasons || []).map(r => typeof r === "string" ? r : r?.reason).filter(Boolean),
    children: (node.children || []).map(serializeReasons)
  };
  const flattenReasons = (node, frame) => [ ...node.reasons.map(reason => ({
    reason: reason,
    frame: frame
  })), ...node.children.flatMap((child, i) => flattenReasons(child, child.src || child.url || child.name || child.id || `iframe ${i + 1}`)) ];
  const analyze = async () => {
    const issues = [];
    const navEntry = performance.getEntriesByType("navigation")[0];
    results.notRestoredReasons = serializeReasons(navEntry?.notRestoredReasons);
    const confirmed = results.notRestoredReasons ? flattenReasons(results.notRestoredReasons, results.notRestoredReasons.url || "main frame") : [];
    confirmed.forEach(({reason: reason, frame: frame}) => {
      issues.push({
        reason: `${reason} (${frame})`,
        severity: "high",
        source: "browser",
        description: REASON_HELP[reason.toLowerCase()] || "Reported by the browser as a bfcache blocker"
      });
    });
    if (window.onunload !== null && !confirmed.some(({reason: reason}) => reason === "unload-listener")) issues.push({
      reason: "window.onunload handler set",
      severity: "high",
      source: "detected",
      description: REASON_HELP["unload-listener"]
    });
    if (/^https?:$/.test(location.protocol)) try {
      const res = await fetch(location.href, {
        method: "HEAD",
        credentials: "same-origin"
      });
      const cacheControl = res.headers.get("cache-control") || "";
      if (/no-store/i.test(cacheControl) && !confirmed.some(({reason: reason}) => reason === "response-cache-control-no-store")) issues.push({
        reason: "Cache-Control: no-store on the page response",
        severity: "medium",
        source: "detected",
        description: REASON_HELP["response-cache-control-no-store"]
      });
    } catch {}
    const iframeCount = document.querySelectorAll("iframe").length;
    if (iframeCount > 0) issues.push({
      reason: `${iframeCount} iframe(s) on the page`,
      severity: "info",
      source: "note",
      description: "A bfcache blocker inside an iframe blocks the whole page. See notRestoredReasons after a back navigation."
    });
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) issues.push({
      reason: "Service Worker controls the page",
      severity: "info",
      source: "note",
      description: "Service Workers are compatible with bfcache."
    });
    results.blockingReasons = issues;
    results.recommendations = [ ...new Set(issues.filter(i => i.severity !== "info").map(i => i.description)) ];
    if (issues.some(i => i.source === "browser")) results.eligibility = "blocked"; else if (issues.some(i => i.source === "detected")) results.eligibility = "likely-blocked"; else results.eligibility = "no-blockers-detected";
    return results.eligibility;
  };
  const printReasons = (node, indent) => {
    " ".repeat(indent);
    node.reasons.forEach(reason => {
      const help = REASON_HELP[reason.toLowerCase()];
      if (help) void 0;
    });
    node.children.forEach((child, i) => {
      printReasons(child, indent + 3);
    });
  };
  const displayResults = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (results.wasRestored) void 0; else if (navEntry?.type === "back_forward") void 0; else void 0;
    if (navEntry) void 0;
    if (results.blockingReasons.length > 0) {
    } else {
    }
    if (results.notRestoredReasons) {
      if (results.notRestoredReasons.reasons.length === 0 && results.notRestoredReasons.children.length === 0) void 0;
      printReasons(results.notRestoredReasons, 3);
    }
    if (results.recommendations.length > 0) {
      results.recommendations.forEach((rec, idx) => {});
    }
  };
  const buildResult = () => ({
    script: "Back-Forward-Cache",
    status: "ok",
    details: {
      eligibility: results.eligibility,
      wasRestored: results.wasRestored,
      supported: results.supported,
      navigationType: performance.getEntriesByType("navigation")[0]?.type ?? null,
      notRestoredReasons: results.notRestoredReasons
    },
    issues: results.blockingReasons.map(i => ({
      severity: i.severity === "high" ? "error" : i.severity === "medium" ? "warning" : "info",
      message: i.reason
    }))
  });
  window.checkBfcache = async () => {
    await analyze();
    displayResults();
    return buildResult();
  };
  await analyze();
  displayResults();
  return {
    ...buildResult(),
    message: "bfcache analysis complete. Call checkBfcache() to re-run analysis."
  };
})();
