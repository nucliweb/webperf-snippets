// Compression Audit
// Finds text-based resources served without HTTP compression and estimates the savings
// https://webperf-snippets.nucliweb.net

(() => {
  const MIN_BYTES = 1024; // Below this, compression saves too little to matter
  const MAX_ITEMS = 50;

  // Typical size reduction gzip/brotli achieve per resource type (estimate, not a measurement)
  const SAVINGS_RATIO = { js: 0.7, css: 0.7, html: 0.7, json: 0.7, svg: 0.7, xml: 0.7, font: 0.5 };

  const EXTENSION_TYPES = {
    js: "js", mjs: "js", cjs: "js",
    css: "css",
    html: "html", htm: "html",
    json: "json", webmanifest: "json",
    svg: "svg",
    xml: "xml", rss: "xml", atom: "xml",
    ttf: "font", otf: "font", eot: "font",
  };

  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

  const parseUrl = (name) => {
    try {
      return new URL(name);
    } catch {
      return null;
    }
  };

  // Text type of a resource, or null when it is not a compressible text resource
  const textType = (entry, url) => {
    if (entry.entryType === "navigation") return "html";
    const ext = url.pathname.split(".").pop().toLowerCase();
    if (EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext];
    if (entry.initiatorType === "script") return "js";
    return null;
  };

  const entries = [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")];
  const contentEncodingSupported = entries.some((e) => "contentEncoding" in e);

  const candidates = [];
  entries.forEach((entry) => {
    const url = parseUrl(entry.name);
    if (!url || !/^https?:$/.test(url.protocol)) return;
    const type = textType(entry, url);
    if (!type) return;
    candidates.push({ entry, url, type });
  });

  const compressed = [];
  const uncompressed = [];
  let sizeUnknownCount = 0;
  const byEncoding = {};

  candidates.forEach(({ entry, url, type }) => {
    const decoded = entry.decodedBodySize || 0;
    const encoded = entry.encodedBodySize || 0;

    // Cross-origin resources without Timing-Allow-Origin report every size as zero
    if (decoded === 0 && url.origin !== location.origin) {
      sizeUnknownCount++;
      return;
    }
    if (decoded < MIN_BYTES) return;

    const encoding = (entry.contentEncoding || "").toLowerCase();
    // Without contentEncoding (older browsers), a body smaller than its decoded form was compressed
    const isCompressed = encoding ? encoding !== "identity" : encoded < decoded;

    if (isCompressed) {
      const label = encoding || "unspecified";
      byEncoding[label] = (byEncoding[label] || 0) + 1;
      compressed.push(entry);
      return;
    }

    const savings = Math.round(decoded * SAVINGS_RATIO[type]);
    uncompressed.push({
      url: entry.name,
      shortName: url.pathname.split("/").filter(Boolean).pop() || url.hostname,
      type,
      encoding: "none",
      encodedBytes: encoded,
      decodedBytes: decoded,
      estimatedSavingsBytes: savings,
    });
  });

  byEncoding.none = uncompressed.length;
  uncompressed.sort((a, b) => b.estimatedSavingsBytes - a.estimatedSavingsBytes);

  const totalUncompressedBytes = uncompressed.reduce((n, i) => n + i.decodedBytes, 0);
  const estimatedSavingsBytes = uncompressed.reduce((n, i) => n + i.estimatedSavingsBytes, 0);
  const corsLimitedAnalysis = sizeUnknownCount > 0;

  const issues = [];
  if (uncompressed.length > 0) {
    issues.push({
      severity: "warning",
      message: `${uncompressed.length} text resource(s) served without compression; enabling gzip or brotli could save about ${formatBytes(estimatedSavingsBytes)}`,
    });
  }
  if (corsLimitedAnalysis) {
    issues.push({
      severity: "info",
      message: `${sizeUnknownCount} cross-origin text resource(s) without Timing-Allow-Origin report zero sizes, so their compression is unknown`,
    });
  }
  if (!contentEncodingSupported && candidates.length > 0) {
    issues.push({
      severity: "info",
      message: "PerformanceResourceTiming.contentEncoding is not available; compression is inferred from encodedBodySize versus decodedBodySize",
    });
  }

  console.group("%c🗜️ Compression Audit", "font-weight: bold; font-size: 14px;");
  console.log(
    `Text resources: ${candidates.length} | compressed: ${compressed.length} | uncompressed: ${uncompressed.length} | size unknown: ${sizeUnknownCount}`
  );
  if (uncompressed.length > 0) {
    console.log(`Estimated savings: ~${formatBytes(estimatedSavingsBytes)} of ${formatBytes(totalUncompressedBytes)}`);
    console.table(
      uncompressed.slice(0, MAX_ITEMS).map((i) => ({
        Resource: i.shortName,
        Type: i.type,
        Size: formatBytes(i.decodedBytes),
        "Est. savings": formatBytes(i.estimatedSavingsBytes),
      }))
    );
  } else {
    console.log("%c✅ No uncompressed text resources found", "color: #22c55e;");
  }
  if (corsLimitedAnalysis) {
    console.log("%cℹ️ Some cross-origin resources could not be analyzed (no Timing-Allow-Origin)", "color: #3b82f6;");
  }
  console.groupEnd();

  return {
    script: "Compression-Audit",
    status: "ok",
    count: uncompressed.length,
    corsLimitedAnalysis,
    details: {
      totalTextResources: candidates.length,
      compressedCount: compressed.length,
      uncompressedCount: uncompressed.length,
      sizeUnknownCount,
      totalUncompressedBytes,
      estimatedSavingsBytes,
      byEncoding,
      contentEncodingSupported,
    },
    items: uncompressed.slice(0, MAX_ITEMS),
    issues,
  };
})();
