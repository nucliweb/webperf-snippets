(() => {
  const MIN_BYTES = 1024;
  const MAX_ITEMS = 50;
  const SAVINGS_RATIO = {
    js: 0.7,
    css: 0.7,
    html: 0.7,
    json: 0.7,
    svg: 0.7,
    xml: 0.7,
    font: 0.5
  };
  const EXTENSION_TYPES = {
    js: "js",
    mjs: "js",
    cjs: "js",
    css: "css",
    html: "html",
    htm: "html",
    json: "json",
    webmanifest: "json",
    svg: "svg",
    xml: "xml",
    rss: "xml",
    atom: "xml",
    ttf: "font",
    otf: "font",
    eot: "font"
  };
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  const parseUrl = name => {
    try {
      return new URL(name);
    } catch {
      return null;
    }
  };
  const textType = (entry, url) => {
    if (entry.entryType === "navigation") return "html";
    const ext = url.pathname.split(".").pop().toLowerCase();
    if (EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext];
    if (entry.initiatorType === "script") return "js";
    return null;
  };
  const entries = [ ...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource") ];
  const contentEncodingSupported = entries.some(e => "contentEncoding" in e);
  const candidates = [];
  entries.forEach(entry => {
    const url = parseUrl(entry.name);
    if (!url || !/^https?:$/.test(url.protocol)) return;
    const type = textType(entry, url);
    if (!type) return;
    candidates.push({
      entry: entry,
      url: url,
      type: type
    });
  });
  const compressed = [];
  const uncompressed = [];
  let sizeUnknownCount = 0;
  let skippedSmallCount = 0;
  const byEncoding = {};
  candidates.forEach(({entry: entry, url: url, type: type}) => {
    const decoded = entry.decodedBodySize || 0;
    const encoded = entry.encodedBodySize || 0;
    if (decoded === 0 && url.origin !== location.origin) {
      sizeUnknownCount++;
      return;
    }
    if (decoded < MIN_BYTES) {
      skippedSmallCount++;
      return;
    }
    const encoding = (entry.contentEncoding || "").toLowerCase();
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
      type: type,
      encoding: "none",
      encodedBytes: encoded,
      decodedBytes: decoded,
      estimatedSavingsBytes: savings
    });
  });
  byEncoding.none = uncompressed.length;
  uncompressed.sort((a, b) => b.estimatedSavingsBytes - a.estimatedSavingsBytes);
  const totalUncompressedBytes = uncompressed.reduce((n, i) => n + i.decodedBytes, 0);
  const estimatedSavingsBytes = uncompressed.reduce((n, i) => n + i.estimatedSavingsBytes, 0);
  const corsLimitedAnalysis = sizeUnknownCount > 0;
  const issues = [];
  if (uncompressed.length > 0) issues.push({
    severity: "warning",
    message: `${uncompressed.length} text resource(s) served without compression; enabling gzip or brotli could save about ${formatBytes(estimatedSavingsBytes)}`
  });
  if (corsLimitedAnalysis) issues.push({
    severity: "info",
    message: `${sizeUnknownCount} cross-origin text resource(s) without Timing-Allow-Origin report zero sizes, so their compression is unknown`
  });
  if (!contentEncodingSupported && candidates.length > 0) issues.push({
    severity: "info",
    message: "PerformanceResourceTiming.contentEncoding is not available; compression is inferred from encodedBodySize versus decodedBodySize"
  });
  if (uncompressed.length > 0) {
  } else void 0;
  if (corsLimitedAnalysis) void 0;
  return {
    script: "Compression-Audit",
    status: "ok",
    count: uncompressed.length,
    corsLimitedAnalysis: corsLimitedAnalysis,
    details: {
      totalTextResources: candidates.length,
      compressedCount: compressed.length,
      uncompressedCount: uncompressed.length,
      sizeUnknownCount: sizeUnknownCount,
      skippedSmallCount: skippedSmallCount,
      totalUncompressedBytes: totalUncompressedBytes,
      estimatedSavingsBytes: estimatedSavingsBytes,
      byEncoding: byEncoding,
      contentEncodingSupported: contentEncodingSupported
    },
    items: uncompressed.slice(0, MAX_ITEMS),
    issues: issues
  };
})();
