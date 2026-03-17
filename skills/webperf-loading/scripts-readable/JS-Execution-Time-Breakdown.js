(() => {
  const formatMs = ms => ms > 0 ? ms.toFixed(0) + "ms" : "-";
  const formatBytes = bytes => {
    if (!bytes || bytes === 0) return "-";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };
  const formatBar = (value, max, width = 16) => {
    if (value <= 0 || max <= 0) return "░".repeat(width);
    const filled = Math.min(Math.round(value / max * width), width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  };
  const nav = performance.getEntriesByType("navigation")[0];
  const domInteractive = nav?.domInteractive || 0;
  const domContentLoaded = nav?.domContentLoadedEventEnd || 0;
  const loadEvent = nav?.loadEventEnd || 0;
  const scriptResources = performance.getEntriesByType("resource").filter(r => r.initiatorType === "script").map(r => {
    let shortName;
    try {
      const url = new URL(r.name);
      shortName = url.pathname.split("/").pop() || url.hostname;
    } catch {
      shortName = r.name.split("/").pop() || r.name;
    }
    const transferSize = r.transferSize || 0;
    const decodedSize = r.decodedBodySize || 0;
    const downloadDuration = Math.round(r.responseEnd - r.startTime);
    const corsRestricted = transferSize === 0 && decodedSize === 0 && downloadDuration > 0;
    const estimatedParseMobile = Math.round(decodedSize / 1024);
    const estimatedParseDesktop = Math.round(decodedSize / 1024 / 3);
    return {
      name: r.name,
      shortName: shortName.split("?")[0] || shortName,
      startTime: r.startTime,
      responseEnd: r.responseEnd,
      downloadDuration: downloadDuration,
      transferSize: transferSize,
      decodedSize: decodedSize,
      corsRestricted: corsRestricted,
      estimatedParseMobile: estimatedParseMobile,
      estimatedParseDesktop: estimatedParseDesktop,
      totalCostMs: downloadDuration + estimatedParseMobile
    };
  }).sort((a, b) => a.startTime - b.startTime);
  const blockingSet = new Set;
  Array.from(document.querySelectorAll("script[src]")).forEach(el => {
    const isModule = el.type === "module";
    if (!el.async && !el.defer && !isModule && el.closest("head")) blockingSet.add(el.src);
  });
  const scripts = scriptResources.map(s => ({
    ...s,
    isBlocking: blockingSet.has(s.name)
  }));
  const blocking = scripts.filter(s => s.isBlocking);
  const nonBlocking = scripts.filter(s => !s.isBlocking);
  const totalDownload = scripts.reduce((sum, s) => sum + s.downloadDuration, 0);
  const totalEstParse = scripts.reduce((sum, s) => sum + s.estimatedParseMobile, 0);
  const totalSize = scripts.reduce((sum, s) => sum + s.transferSize, 0);
  const totalDecodedSize = scripts.reduce((sum, s) => sum + s.decodedSize, 0);
  const blockingCriticalPathEnd = blocking.reduce((max, s) => {
    const estimatedDone = s.responseEnd + s.estimatedParseMobile;
    return Math.max(max, estimatedDone);
  }, 0);
  const jsBlockingDelay = blocking.length > 0 && domInteractive > 0 ? Math.min(blockingCriticalPathEnd, domInteractive) : 0;
  const SPLIT_THRESHOLD = 50 * 1024;
  const splitCandidates = scripts.filter(s => s.decodedSize > SPLIT_THRESHOLD);
  if (domInteractive > 0) {
    const timelineMax = loadEvent || domContentLoaded || domInteractive;
    const rows = [ {
      label: "Navigation start",
      time: 0
    }, {
      label: "DOM Interactive",
      time: domInteractive
    }, {
      label: "DOM Content Loaded",
      time: domContentLoaded
    }, {
      label: "Load event",
      time: loadEvent
    } ].filter(r => r.time > 0);
    rows.forEach(({label: label, time: time}) => {
      formatBar(time, timelineMax, 20);
    });
    if (domInteractive > 0) {
      domInteractive > 0 && (jsBlockingDelay / domInteractive * 100).toFixed(0);
    }
  } else void 0;
  if (scripts.length > 0) {
    const corsCount = scripts.filter(s => s.corsRestricted).length;
    if (corsCount > 0) {
    }
    const maxCost = Math.max(...scripts.map(s => s.totalCostMs));
    scripts.sort((a, b) => b.totalCostMs - a.totalCostMs).slice(0, 20).map(s => {
      const name = s.shortName.length > 35 ? s.shortName.slice(0, 32) + "..." : s.shortName;
      return {
        "": s.isBlocking ? "🔴" : "✅",
        Script: name,
        Download: formatMs(s.downloadDuration),
        "Parse(mob)": s.corsRestricted ? "CORS" : formatMs(s.estimatedParseMobile),
        "Parse(dsk)": s.corsRestricted ? "CORS" : formatMs(s.estimatedParseDesktop),
        Transfer: s.corsRestricted ? "CORS" : formatBytes(s.transferSize),
        Decoded: s.corsRestricted ? "CORS" : formatBytes(s.decodedSize),
        "": formatBar(s.totalCostMs, maxCost)
      };
    });
    if (scripts.length > 20) void 0;
    const criticalBundles = scripts.filter(s => !s.corsRestricted && s.decodedSize > 1024 * 1024);
    if (criticalBundles.length > 0) {
      criticalBundles.sort((a, b) => b.decodedSize - a.decodedSize).forEach(s => {
      });
    }
  }
  if (blocking.length > 0) {
    blocking.sort((a, b) => b.totalCostMs - a.totalCostMs).forEach(s => {
      s.shortName.length > 40 ? s.shortName.slice(0, 37) : s.shortName;
    });
  }
  if (splitCandidates.length > 0) {
    splitCandidates.sort((a, b) => b.decodedSize - a.decodedSize).forEach(s => {
      s.shortName.length > 40 ? s.shortName.slice(0, 37) : s.shortName;
    });
  }
  const hasHighParseTime = totalEstParse > 500;
  const hasBlockingScripts = blocking.length > 0;
  const compressionRatio = totalDecodedSize / Math.max(totalSize, 1);
  const poorCompression = compressionRatio < 2 && totalSize > 10 * 1024;
  if (!hasBlockingScripts && !hasHighParseTime && splitCandidates.length === 0) void 0;
  if (hasBlockingScripts) {
  }
  if (hasHighParseTime) {
  }
  if (poorCompression) {
  }
  return {
    script: "JS-Execution-Time-Breakdown",
    status: "ok",
    count: scripts.length,
    details: {
      blockingCount: blocking.length,
      nonBlockingCount: nonBlocking.length,
      totalTransferBytes: totalSize,
      totalDecodedBytes: totalDecodedSize,
      totalDownloadMs: Math.round(totalDownload),
      totalEstParseMobileMs: Math.round(totalEstParse),
      splitCandidatesCount: splitCandidates.length,
      domInteractiveMs: Math.round(domInteractive),
      domContentLoadedMs: Math.round(domContentLoaded),
      loadEventMs: Math.round(loadEvent)
    },
    items: scripts.slice(0, 50).map(s => ({
      shortName: s.shortName,
      isBlocking: s.isBlocking,
      downloadMs: Math.round(s.downloadDuration),
      estimatedParseMobileMs: s.estimatedParseMobile,
      transferBytes: s.transferSize,
      decodedBytes: s.decodedSize,
      corsRestricted: s.corsRestricted
    })),
    issues: [ ...blocking.length > 0 ? [ {
      severity: "error",
      message: `${blocking.length} render-blocking script(s) delay HTML parsing`
    } ] : [], ...hasHighParseTime ? [ {
      severity: "warning",
      message: `High estimated parse cost (~${Math.round(totalEstParse)}ms on mobile)`
    } ] : [], ...splitCandidates.length > 0 ? [ {
      severity: "warning",
      message: `${splitCandidates.length} script(s) over 50KB decoded — consider code splitting`
    } ] : [], ...poorCompression ? [ {
      severity: "warning",
      message: `Low compression ratio (${compressionRatio.toFixed(1)}x) — enable Brotli/gzip`
    } ] : [] ]
  };
})();
