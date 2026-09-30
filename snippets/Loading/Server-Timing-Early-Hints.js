// Server-Timing & Early Hints Viewer
// https://webperf-snippets.nucliweb.net

(() => {
  const SCRIPT = "Server-Timing-Early-Hints";
  const MAX_ITEMS = 50;

  const [nav] = performance.getEntriesByType("navigation");
  if (!nav) {
    return { script: SCRIPT, status: "error", error: "No navigation entry available" };
  }
  if (!Array.isArray(nav.serverTiming)) {
    return {
      script: SCRIPT,
      status: "unsupported",
      error: "Server-Timing entries are not supported in this browser",
    };
  }

  const round = (n) => Math.round(n * 100) / 100;
  // Times are relative to the time origin; a prerendered page starts at activationStart
  const activationStart = Math.max(0, nav.activationStart ?? 0);
  const rel = (t) => (t > 0 ? round(Math.max(0, t - activationStart)) : 0);

  const toItem = (entry, source, url) => ({
    source,
    url,
    name: entry.name,
    durationMs: round(entry.duration || 0),
    description: entry.description || "",
  });

  // Server-Timing entries of the document
  const all = nav.serverTiming.map((m) => toItem(m, "navigation", location.href));

  // Server-Timing entries of the resources. A cross-origin response without
  // Timing-Allow-Origin exposes no Server-Timing and reports zero for every size, so it is
  // counted as unreadable instead of being treated as a resource with no metrics.
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
    } catch {
      // Not a valid URL; treat as same-origin
    }
    if (crossOrigin && r.transferSize === 0 && r.encodedBodySize === 0 && r.decodedBodySize === 0) {
      corsRestrictedCount++;
    }
  }

  all.sort((a, b) => b.durationMs - a.durationMs);
  const items = all.slice(0, MAX_ITEMS);

  // 103 Early Hints. firstInterimResponseStart is 0 when the server sent no interim
  // response, or when the browser did not expose it (Early Hints needs HTTP/2 or later).
  const firstInterim = rel(nav.firstInterimResponseStart ?? 0);
  const finalHeaders = rel(nav.finalResponseHeadersStart ?? nav.responseStart);
  const earlyHintsReceived = firstInterim > 0;
  const navigation = {
    responseStartMs: rel(nav.responseStart),
    firstInterimResponseStartMs: firstInterim,
    finalResponseHeadersStartMs: finalHeaders,
    earlyHintsReceived,
    earlyHintsLeadMs: earlyHintsReceived ? round(Math.max(0, finalHeaders - firstInterim)) : 0,
    serverTimingCount: nav.serverTiming.length,
  };

  const issues = [];
  if (nav.serverTiming.length === 0) {
    issues.push({
      severity: "info",
      message:
        "The document response sends no Server-Timing header. Add one, for example Server-Timing: db;dur=53, to expose backend timings in DevTools and in the Performance API.",
    });
  }
  if (corsRestrictedCount > 0) {
    issues.push({
      severity: "info",
      message: `${corsRestrictedCount} cross-origin resource(s) hide their timing because they lack Timing-Allow-Origin, so their Server-Timing cannot be read. Add Timing-Allow-Origin to expose it.`,
    });
  }
  if (!earlyHintsReceived) {
    issues.push({
      severity: "info",
      message:
        "No 103 Early Hints response was observed for the document. If the server can send Link preload or preconnect headers before the final response, Early Hints lets the browser start those fetches earlier.",
    });
  }

  // Human output
  console.group("%cServer-Timing & Early Hints", "font-weight: bold; font-size: 14px;");
  console.log(
    `Document: ${nav.serverTiming.length} Server-Timing metric(s); resources with Server-Timing: ${resourcesWithServerTiming}`
  );
  console.log(
    earlyHintsReceived
      ? `103 Early Hints at ${firstInterim} ms, final headers at ${finalHeaders} ms (${navigation.earlyHintsLeadMs} ms lead)`
      : `No 103 Early Hints observed; final headers at ${finalHeaders} ms`
  );
  if (corsRestrictedCount > 0) {
    console.log(`${corsRestrictedCount} cross-origin resource(s) unreadable (no Timing-Allow-Origin)`);
  }
  if (items.length > 0) console.table(items);
  console.groupEnd();

  return {
    script: SCRIPT,
    status: "ok",
    count: all.length,
    corsLimitedAnalysis: corsRestrictedCount > 0,
    details: {
      navigation,
      resourcesWithServerTiming,
      corsRestrictedCount,
    },
    items,
    issues,
  };
})();
