(() => {
  const prefetchLinks = Array.from(document.querySelectorAll('link[rel="prefetch"]'));
  if (prefetchLinks.length === 0) {
    return {
      script: "Prefetch-Resource-Validation",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const performanceEntries = performance.getEntriesByType("resource");
  const entryUrlMap = new Map;
  performanceEntries.forEach(entry => {
    try {
      const normalizedUrl = new URL(entry.name, location.origin).href;
      if (!entryUrlMap.has(normalizedUrl)) entryUrlMap.set(normalizedUrl, []);
      entryUrlMap.get(normalizedUrl).push(entry);
    } catch {}
  });
  const validAsValues = new Set([ "script", "style", "font", "image", "video", "audio", "document", "fetch", "track", "worker" ]);
  const THRESHOLDS = {
    maxCount: 10,
    largeFileSize: 500 * 1024,
    largeScriptSize: 1024 * 1024,
    totalSizeWarning: 2 * 1024 * 1024,
    totalSizeCritical: 5 * 1024 * 1024
  };
  const issues = [];
  const validPrefetch = [];
  const seenUrls = new Set;
  let totalSize = 0;
  let totalTransferSize = 0;
  prefetchLinks.forEach(link => {
    const href = link.href;
    const as = link.getAttribute("as") || "unknown";
    const shortUrl = href.split("/").pop()?.split("?")[0]?.split("#")[0] || href;
    let normalizedUrl;
    try {
      normalizedUrl = new URL(href, location.origin).href;
    } catch {
      normalizedUrl = href;
    }
    const matchingEntries = entryUrlMap.get(normalizedUrl) || [];
    const perfEntry = matchingEntries[0];
    const analysis = {
      link: link,
      href: href,
      shortUrl: shortUrl,
      as: as,
      size: 0,
      transferSize: 0,
      duration: 0,
      loaded: false,
      isCurrentPage: false,
      warnings: []
    };
    if (as === "unknown") analysis.warnings.push({
      type: "missing-as",
      severity: "warning",
      message: "Missing 'as' attribute - browser cannot apply correct MIME type matching"
    }); else if (!validAsValues.has(as)) analysis.warnings.push({
      type: "invalid-as",
      severity: "warning",
      message: `Invalid 'as' value: "${as}" - should be one of: ${Array.from(validAsValues).join(", ")}`
    });
    if (seenUrls.has(normalizedUrl)) analysis.warnings.push({
      type: "duplicate-prefetch",
      severity: "warning",
      message: "Duplicate prefetch - this URL is prefetched multiple times"
    });
    seenUrls.add(normalizedUrl);
    if (perfEntry) {
      analysis.loaded = true;
      analysis.size = perfEntry.decodedBodySize || 0;
      analysis.transferSize = perfEntry.transferSize || 0;
      analysis.duration = perfEntry.duration || 0;
      if (perfEntry.encodedBodySize > 0 && perfEntry.transferSize === 0) analysis.cacheStatus = "cached"; else if (perfEntry.encodedBodySize === 0 && perfEntry.transferSize === 0) analysis.cacheStatus = "unknown (CORS)"; else analysis.cacheStatus = "network";
      totalSize += analysis.size;
      totalTransferSize += analysis.transferSize;
      const isCurrentPageResource = matchingEntries.some(entry => entry.initiatorType !== "link" && entry.startTime < 5000);
      if (isCurrentPageResource) {
        analysis.isCurrentPage = true;
        analysis.warnings.push({
          type: "wrong-hint",
          severity: "error",
          message: "Resource used on current page - should use preload instead"
        });
      }
      if (analysis.size > THRESHOLDS.largeFileSize) {
        const sizeMB = (analysis.size / (1024 * 1024)).toFixed(2);
        analysis.warnings.push({
          type: "large-file",
          severity: "warning",
          message: `Large file (${sizeMB}MB) - consider if prefetch is appropriate`
        });
      }
      let isInappropriate = false;
      let inappropriateReason = "";
      if (as === "video" || as === "audio") {
        isInappropriate = true;
        inappropriateReason = "Video/audio files are typically too large for prefetch";
      } else if (as === "image" && analysis.size > 200 * 1024) {
        isInappropriate = true;
        inappropriateReason = `Image is ${(analysis.size / 1024).toFixed(0)}KB (>200KB threshold)`;
      } else if (as === "script" && analysis.size > THRESHOLDS.largeScriptSize) {
        isInappropriate = true;
        inappropriateReason = `Script is ${(analysis.size / 1024).toFixed(0)}KB (>1MB threshold)`;
      }
      if (isInappropriate) analysis.warnings.push({
        type: "inappropriate-type",
        severity: "warning",
        message: `Type "${as}" may not be suitable for prefetch: ${inappropriateReason}`
      });
    } else analysis.warnings.push({
      type: "not-loaded",
      severity: "info",
      message: "Not loaded yet or failed to load"
    });
    if (analysis.warnings.length > 0) issues.push(analysis); else validPrefetch.push(analysis);
  });
  const countIssues = [];
  if (prefetchLinks.length > THRESHOLDS.maxCount) countIssues.push({
    type: "excessive-count",
    severity: "warning",
    message: `${prefetchLinks.length} prefetch hints found (recommended: <${THRESHOLDS.maxCount})`,
    explanation: "Excessive prefetch can waste bandwidth, especially on mobile networks"
  });
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  (totalTransferSize / (1024 * 1024)).toFixed(2);
  if (totalSize > THRESHOLDS.totalSizeCritical) countIssues.push({
    type: "excessive-size",
    severity: "error",
    message: `Total prefetch size: ${totalSizeMB}MB (critical threshold exceeded)`,
    explanation: "This is very high and will significantly impact mobile users"
  }); else if (totalSize > THRESHOLDS.totalSizeWarning) countIssues.push({
    type: "high-size",
    severity: "warning",
    message: `Total prefetch size: ${totalSizeMB}MB (warning threshold exceeded)`,
    explanation: "Consider reducing prefetch to improve mobile experience"
  });
  const loadedCount = [ ...issues, ...validPrefetch ].filter(item => item.loaded).length;
  const meaningfulIssues = issues.filter(i => i.warnings.some(w => w.severity === "error" || w.severity === "warning"));
  const totalMeaningfulIssues = meaningfulIssues.length + countIssues.length;
  if (countIssues.length > 0) {
    countIssues.forEach(issue => {
      issue.severity;
      issue.severity;
    });
  }
  const errors = issues.filter(i => i.warnings.some(w => w.severity === "error"));
  const warnings = issues.filter(i => !i.warnings.some(w => w.severity === "error") && i.warnings.some(w => w.severity === "warning"));
  const infos = issues.filter(i => i.warnings.every(w => w.severity === "info"));
  if (errors.length > 0) {
    errors.map(item => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Issue: item.warnings.map(w => w.message).join("; ")
    }));
    errors.forEach((item, i) => {
      if (item.size > 0) void 0;
      item.warnings.forEach(w => {
      });
    });
  }
  if (warnings.length > 0) {
    warnings.map(item => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Issue: item.warnings.map(w => w.message).join("; ")
    }));
  }
  if (infos.length > 0) {
    infos.map(item => ({
      Resource: item.shortUrl,
      Type: item.as,
      Status: item.warnings.map(w => w.message).join("; ")
    }));
  }
  if (validPrefetch.length > 0) {
    validPrefetch.map(item => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Status: item.loaded ? "✅ Loaded" : "Pending",
      Cache: item.cacheStatus || "N/A"
    }));
  }
  if (totalMeaningfulIssues === 0) {
  } else {
  }
  return {
    script: "Prefetch-Resource-Validation",
    status: "ok",
    count: prefetchLinks.length,
    details: {
      loadedCount: loadedCount,
      validCount: validPrefetch.length,
      issueCount: totalMeaningfulIssues,
      totalSizeBytes: totalSize,
      totalTransferBytes: totalTransferSize
    },
    items: [ ...validPrefetch, ...issues ].map(item => ({
      href: item.shortUrl,
      as: item.as,
      sizeBytes: item.size,
      loaded: item.loaded,
      isCurrentPage: item.isCurrentPage || false
    })),
    issues: [ ...countIssues.map(i => ({
      severity: i.severity === "error" ? "error" : "warning",
      message: i.message
    })), ...issues.flatMap(item => item.warnings.filter(w => w.severity !== "info").map(w => ({
      severity: w.severity,
      message: `${item.shortUrl}: ${w.message}`
    }))) ]
  };
})();
