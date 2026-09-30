(() => {
  const SCRIPT = "Server-Timing-Early-Hints";
  const MAX_ITEMS = 50;
  const [nav] = performance.getEntriesByType("navigation");
  if (!nav) return {
    script: SCRIPT,
    status: "error",
    error: "No navigation entry available"
  };
  if (!Array.isArray(nav.serverTiming)) return {
    script: SCRIPT,
    status: "unsupported",
    error: "Server-Timing entries are not supported in this browser"
  };
  const round = n => Math.round(n * 100) / 100;
  const activationStart = Math.max(0, nav.activationStart ?? 0);
  const rel = t => t > 0 ? round(Math.max(0, t - activationStart)) : 0;
  const toItem = (entry, source, url) => ({
    source: source,
    url: url,
    name: entry.name,
    durationMs: round(entry.duration || 0),
    description: entry.description || ""
  });
  const all = nav.serverTiming.map(m => toItem(m, "navigation", location.href));
  let resourcesWithServerTiming = 0;
  let corsRestrictedCount = 0;
  for (const r of performance.getEntriesByType("resource")) {
    if (r.serverTiming.length > 0) {
      resourcesWithServerTiming++;
      for (const m of r.serverTiming) all.push(toItem(m, "resource", r.name));
      continue;
    }
    let crossOrigin = false;
    try {
      crossOrigin = new URL(r.name).origin !== location.origin;
    } catch {}
    if (crossOrigin && r.transferSize === 0 && r.encodedBodySize === 0 && r.decodedBodySize === 0) corsRestrictedCount++;
  }
  all.sort((a, b) => b.durationMs - a.durationMs);
  const items = all.slice(0, MAX_ITEMS);
  const firstInterim = rel(nav.firstInterimResponseStart ?? 0);
  const finalHeaders = rel(nav.finalResponseHeadersStart ?? nav.responseStart);
  const earlyHintsReceived = firstInterim > 0;
  const navigation = {
    responseStartMs: rel(nav.responseStart),
    firstInterimResponseStartMs: firstInterim,
    finalResponseHeadersStartMs: finalHeaders,
    earlyHintsReceived: earlyHintsReceived,
    earlyHintsLeadMs: earlyHintsReceived ? round(Math.max(0, finalHeaders - firstInterim)) : 0,
    serverTimingCount: nav.serverTiming.length
  };
  const issues = [];
  if (nav.serverTiming.length === 0) issues.push({
    severity: "info",
    message: "The document response sends no Server-Timing header. Add one, for example Server-Timing: db;dur=53, to expose backend timings in DevTools and in the Performance API."
  });
  if (corsRestrictedCount > 0) issues.push({
    severity: "info",
    message: `${corsRestrictedCount} cross-origin resource(s) hide their timing because they lack Timing-Allow-Origin, so their Server-Timing cannot be read. Add Timing-Allow-Origin to expose it.`
  });
  if (!earlyHintsReceived) issues.push({
    severity: "info",
    message: "No 103 Early Hints response was observed for the document. If the server can send Link preload or preconnect headers before the final response, Early Hints lets the browser start those fetches earlier."
  });
  if (corsRestrictedCount > 0) void 0;
  if (items.length > 0) void 0;
  return {
    script: SCRIPT,
    status: "ok",
    count: all.length,
    corsLimitedAnalysis: corsRestrictedCount > 0,
    details: {
      navigation: navigation,
      resourcesWithServerTiming: resourcesWithServerTiming,
      corsRestrictedCount: corsRestrictedCount
    },
    items: items,
    issues: issues
  };
})();
