(async () => {
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const secondLevelSuffixes = [ "ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch" ];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  function isFirstParty(hostname) {
    return getRootDomain(hostname) === getRootDomain(location.hostname);
  }
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  function getResourceType(entry) {
    const path = (entry.name || "").split("?")[0].toLowerCase();
    if (/\.(woff2?|ttf|otf|eot)$/.test(path)) return "font";
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(path)) return "image";
    if (/\.(mp4|webm|ogg|mov)$/.test(path)) return "video";
    if (/\.(mp3|wav|flac|aac)$/.test(path)) return "audio";
    if (/\.css$/.test(path)) return "style";
    if (/\.js$/.test(path)) return "script";
    const map = {
      script: "script",
      link: "style",
      css: "style",
      img: "image",
      image: "image",
      video: "video",
      audio: "audio",
      font: "font",
      fetch: "fetch",
      xmlhttprequest: "xhr",
      iframe: "iframe",
      other: "other"
    };
    return map[entry.initiatorType] || entry.initiatorType || "other";
  }
  function detectHashInUrl(url) {
    const hashPatterns = [ /[.-][a-f0-9]{8,32}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|webp|avif)(\?|$)/, /[?&](v|version|hash|rev|_v)=[a-zA-Z0-9._-]+/ ];
    return hashPatterns.some(re => re.test(url));
  }
  function isStaticAsset(type) {
    return [ "script", "style", "font", "image" ].includes(type);
  }
  function parseCacheControl(headerValue) {
    const directives = {};
    if (!headerValue) return directives;
    for (const part of headerValue.split(",")) {
      const [key, val] = part.trim().split("=");
      const k = key.trim().toLowerCase();
      directives[k] = val !== void 0 ? val.trim().replace(/"/g, "") : true;
    }
    return directives;
  }
  function classifyCacheStrategy(headers) {
    if (!headers) return "unknown";
    const cc = parseCacheControl(headers["cache-control"] || "");
    const hasEtag = !!headers["etag"];
    const hasLastModified = !!headers["last-modified"];
    const hasExpires = !!headers["expires"];
    const hasValidators = hasEtag || hasLastModified;
    if (cc["no-store"]) return "no-store";
    if (cc["no-cache"]) return "no-cache";
    if (cc["immutable"]) return "immutable";
    if (cc["stale-while-revalidate"]) return "swr";
    if (cc["must-revalidate"] && hasValidators) return "must-revalidate";
    const maxAge = cc["max-age"] !== void 0 ? parseInt(cc["max-age"], 10) : null;
    const sMaxAge = cc["s-maxage"] !== void 0 ? parseInt(cc["s-maxage"], 10) : null;
    const effectiveMaxAge = sMaxAge ?? maxAge;
    if (effectiveMaxAge !== null) {
      if (effectiveMaxAge === 0) return "no-cache";
      if (effectiveMaxAge < 3600) return "short";
      if (effectiveMaxAge <= 86400) return "medium";
      return "long";
    }
    if (hasExpires && !headers["cache-control"]) return "expires-only";
    if (Object.keys(cc).length === 0 && !hasExpires) return "none";
    return "unknown";
  }
  function detectCdnStatus(headers) {
    if (!headers) return {
      cdn: "unknown",
      status: "unknown"
    };
    if (headers["cf-cache-status"]) return {
      cdn: "Cloudflare",
      status: headers["cf-cache-status"]
    };
    if (headers["x-vercel-cache"]) return {
      cdn: "Vercel",
      status: headers["x-vercel-cache"]
    };
    if (headers["x-cache"]) {
      const val = headers["x-cache"].toUpperCase();
      const cdn = headers["x-amz-cf-id"] ? "CloudFront" : "CDN";
      return {
        cdn: cdn,
        status: val.includes("HIT") ? "HIT" : "MISS"
      };
    }
    if (headers["age"]) return {
      cdn: "Proxy/CDN",
      status: `HIT (Age: ${headers["age"]}s)`
    };
    if (headers["via"]) return {
      cdn: `Proxy (${headers["via"]})`,
      status: "proxied"
    };
    if (headers["server-timing"]) {
      const st = headers["server-timing"].toLowerCase();
      if (st.includes("cdn-cache") || st.includes("cache;")) return {
        cdn: "CDN (Server-Timing)",
        status: st.includes("hit") ? "HIT" : "MISS"
      };
    }
    return {
      cdn: "none",
      status: "no-cdn-headers"
    };
  }
  const resources = performance.getEntriesByType("resource").filter(r => !(r.encodedBodySize === 0 && r.decodedBodySize === 0 && r.transferSize > 0));
  const urlCounts = new Map;
  for (const r of resources) urlCounts.set(r.name, (urlCounts.get(r.name) || 0) + 1);
  const entries = resources.map(r => {
    let url;
    try {
      url = new URL(r.name);
    } catch {
      url = {
        hostname: location.hostname,
        pathname: r.name
      };
    }
    const firstParty = isFirstParty(url.hostname);
    const isCached = r.encodedBodySize > 0 && r.transferSize === 0;
    const isCorsRestricted = r.encodedBodySize === 0 && r.transferSize === 0 && !firstParty;
    return {
      url: r.name,
      shortName: (url.pathname || r.name).split("/").filter(Boolean).pop() || url.hostname,
      host: url.hostname,
      firstParty: firstParty,
      type: getResourceType(r),
      transferSize: r.transferSize || 0,
      encodedBodySize: r.encodedBodySize || 0,
      decodedBodySize: r.decodedBodySize || 0,
      isCached: isCached,
      isCorsRestricted: isCorsRestricted,
      nextHopProtocol: r.nextHopProtocol || "unknown",
      duration: r.duration,
      hasHash: detectHashInUrl(r.name),
      isDuplicate: (urlCounts.get(r.name) || 1) > 1,
      headers: null,
      cacheStrategy: null,
      cdnInfo: null,
      antiPatterns: []
    };
  });
  const FETCHABLE_TYPES = new Set([ "script", "style", "font", "image" ]);
  const fetchableEntries = entries.filter(e => e.url.startsWith(location.origin + "/") && FETCHABLE_TYPES.has(e.type));
  const uniqueUrls = [ ...new Set(fetchableEntries.map(e => e.url)) ];
  const headerCache = new Map;
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async url => {
      try {
        const resp = await fetch(url, {
          method: "HEAD",
          cache: "no-store"
        });
        if (!resp.ok) {
          headerCache.set(url, null);
          return;
        }
        const headers = {};
        for (const [key, value] of resp.headers) headers[key.toLowerCase()] = value;
        headerCache.set(url, headers);
      } catch {
        headerCache.set(url, null);
      }
    }));
  }
  for (const entry of entries) entry.headers = headerCache.get(entry.url) || null;
  for (const entry of entries) {
    if (entry.headers) entry.cacheStrategy = classifyCacheStrategy(entry.headers); else if (entry.isCorsRestricted) entry.cacheStrategy = "unknown (CORS)"; else if (entry.isCached) entry.cacheStrategy = "cached (inferred)"; else entry.cacheStrategy = "unknown";
    entry.cdnInfo = detectCdnStatus(entry.headers);
  }
  const EFFECTIVE_CACHE_STRATEGIES = new Set([ "immutable", "long", "medium", "swr", "must-revalidate", "cached (inferred)" ]);
  for (const entry of entries) {
    if (!entry.headers) continue;
    const cc = parseCacheControl(entry.headers["cache-control"] || "");
    const maxAge = cc["max-age"] !== void 0 ? parseInt(cc["max-age"], 10) : null;
    const strategy = entry.cacheStrategy;
    const type = entry.type;
    if (isStaticAsset(type) && cc["no-store"]) entry.antiPatterns.push({
      id: "static-no-store",
      severity: "error",
      message: `${type} asset with no-store — static assets should be cacheable`
    });
    if (entry.hasHash && maxAge !== null && maxAge < 86400 && !cc["no-store"]) entry.antiPatterns.push({
      id: "versioned-short-cache",
      severity: "warning",
      message: `Versioned URL (hash detected) but max-age=${maxAge}s — consider long cache or immutable`
    });
    if (entry.hasHash && !cc["immutable"] && !cc["no-store"] && (maxAge === null || maxAge >= 86400)) entry.antiPatterns.push({
      id: "versioned-not-immutable",
      severity: "info",
      message: `Versioned URL (hash detected) without Cache-Control: immutable`
    });
    if (entry.decodedBodySize > 100 * 1024 && [ "none", "no-store", "no-cache" ].includes(strategy)) entry.antiPatterns.push({
      id: "large-no-cache",
      severity: "error",
      message: `Large resource (${formatBytes(entry.decodedBodySize)}) with no effective cache`
    });
    if (entry.headers["expires"] && !entry.headers["cache-control"]) entry.antiPatterns.push({
      id: "expires-without-cc",
      severity: "warning",
      message: `Uses Expires header without Cache-Control (outdated pattern)`
    });
    if (isStaticAsset(type) && maxAge === 0) entry.antiPatterns.push({
      id: "maxage-zero-static",
      severity: "warning",
      message: `Static asset with max-age=0 — forces revalidation on every request`
    });
    if (isStaticAsset(type) && maxAge !== null && maxAge > 0 && maxAge < 3600 && !cc["no-store"]) entry.antiPatterns.push({
      id: "short-cache-static",
      severity: "warning",
      message: `Static asset with max-age=${maxAge}s (< 1h) — consider a longer cache duration`
    });
  }
  const cdnEntries = entries.filter(e => e.cdnInfo && e.cdnInfo.cdn !== "none" && e.cdnInfo.cdn !== "unknown");
  const cdnHits = cdnEntries.filter(e => e.cdnInfo.status.toUpperCase().startsWith("HIT")).length;
  const cdnHitRate = cdnEntries.length > 0 ? Math.round(cdnHits / cdnEntries.length * 100) : null;
  const effectiveEntries = entries.filter(e => EFFECTIVE_CACHE_STRATEGIES.has(e.cacheStrategy));
  const cacheEfficiencyPercent = entries.length > 0 ? Math.round(effectiveEntries.length / entries.length * 100) : 0;
  const bandwidthSavedBytes = entries.filter(e => e.isCached).reduce((sum, e) => sum + e.decodedBodySize, 0);
  const protocolDistribution = {};
  for (const entry of entries) {
    const proto = entry.nextHopProtocol || "unknown";
    protocolDistribution[proto] = (protocolDistribution[proto] || 0) + 1;
  }
  const uncompressedResources = entries.filter(e => e.encodedBodySize > 1024 && e.decodedBodySize > 0 && e.encodedBodySize / e.decodedBodySize > 0.9 && [ "script", "style", "fetch", "xhr" ].includes(e.type));
  const uniqueDuplicates = [ ...new Set(entries.filter(e => e.isDuplicate).map(e => e.url)) ].map(url => {
    const group = entries.filter(e => e.url === url);
    const uncachedLoads = group.filter(e => !e.isCached).length;
    return {
      url: url,
      shortName: group[0]?.shortName || url,
      count: urlCounts.get(url),
      type: group[0]?.type || "unknown",
      uncachedLoads: uncachedLoads,
      costly: uncachedLoads > 0
    };
  });
  const costlyDuplicates = uniqueDuplicates.filter(d => d.costly);
  const cachedDuplicates = uniqueDuplicates.filter(d => !d.costly);
  if (entries.length === 0) {
    return {
      script: "Cache-Strategy-Analysis",
      status: "error",
      error: "No resources in the Performance API buffer (performance.clearResourceTimings() may have been called). Reload the page and run the snippet again."
    };
  }
  const allAntiPatterns = entries.flatMap(e => e.antiPatterns.map(ap => ({
    ...ap,
    resource: e.shortName,
    url: e.url
  })));
  const strategyGroups = {};
  for (const entry of entries) {
    const s = entry.cacheStrategy;
    if (!strategyGroups[s]) strategyGroups[s] = 0;
    strategyGroups[s]++;
  }
  const noCacheEntries = entries.filter(e => [ "none", "no-store", "no-cache" ].includes(e.cacheStrategy));
  const shortCacheEntries = entries.filter(e => e.cacheStrategy === "short");
  const headersAnalyzed = entries.filter(e => e.headers !== null).length;
  const corsRestricted = entries.filter(e => e.isCorsRestricted).length;
  const excludedFromHeaders = entries.filter(e => e.headers === null && !e.isCorsRestricted && (!e.url.startsWith(location.origin + "/") || !FETCHABLE_TYPES.has(e.type)));
  if (excludedFromHeaders.length > 0) {
    [ ...new Set(excludedFromHeaders.map(e => e.type)) ].join(", ");
  }
  if (cdnHitRate !== null) void 0;
  if (allAntiPatterns.length > 0) {
    allAntiPatterns.filter(p => p.severity === "error").length;
    allAntiPatterns.filter(p => p.severity === "warning").length;
    allAntiPatterns.filter(p => p.severity === "info").length;
  }
  const strategyOrder = [ "immutable", "long", "medium", "short", "swr", "must-revalidate", "no-cache", "no-store", "expires-only", "none", "cached (inferred)", "unknown (CORS)", "unknown" ];
  strategyOrder.filter(s => strategyGroups[s]).map(s => ({
    Strategy: s,
    Count: strategyGroups[s],
    "% of Total": `${Math.round(strategyGroups[s] / entries.length * 100)}%`,
    Effective: EFFECTIVE_CACHE_STRATEGIES.has(s) ? "✅" : "❌"
  }));
  if (noCacheEntries.length > 0) {
  }
  if (shortCacheEntries.length > 0) {
  }
  if (allAntiPatterns.length > 0) {
    for (const severity of [ "error", "warning", "info" ]) {
      const filtered = allAntiPatterns.filter(p => p.severity === severity);
      if (filtered.length === 0) continue;
      ({
        error: "🔴",
        warning: "🟡",
        info: "🔵"
      })[severity];
    }
  }
  if (cdnEntries.length > 0) {
  }
  if (uncompressedResources.length > 0) {
  }
  if (costlyDuplicates.length > 0) {
  }
  if (cachedDuplicates.length > 0) {
  }
  const recommendations = [];
  if (noCacheEntries.filter(e => isStaticAsset(e.type)).length > 0) recommendations.push("🔴 Add Cache-Control headers to static assets (JS, CSS, fonts, images). Start with max-age=86400 and move to immutable for versioned files.");
  if (shortCacheEntries.filter(e => e.hasHash).length > 0) recommendations.push("🟡 Versioned files (with content hash) should use long cache or Cache-Control: immutable — they can be cached indefinitely since the URL changes on update.");
  if (allAntiPatterns.some(p => p.id === "expires-without-cc")) recommendations.push("🟡 Replace Expires headers with Cache-Control: max-age — Expires is an outdated mechanism and less reliable.");
  if (entries.length > 0 && cacheEfficiencyPercent < 50) recommendations.push(`🔴 Cache efficiency is low (${cacheEfficiencyPercent}%). Review caching strategy for all static assets.`);
  if (cdnHitRate !== null && cdnHitRate < 70) recommendations.push(`🟡 CDN hit rate is ${cdnHitRate}%. Check CDN cache rules and ensure static assets have appropriate TTLs.`);
  if (protocolDistribution["http/1.1"] > 0) recommendations.push(`🟡 ${protocolDistribution["http/1.1"]} resources still use HTTP/1.1. Consider upgrading to HTTP/2 for better multiplexing.`);
  if (uncompressedResources.length > 0) recommendations.push(`🟡 ${uncompressedResources.length} text resources appear uncompressed. Enable Brotli or gzip compression on your server.`);
  if (costlyDuplicates.length > 0) recommendations.push(`🟡 ${costlyDuplicates.length} resources are loaded multiple times with uncached network requests. Check for duplicate script, stylesheet, or fetch includes.`); else if (cachedDuplicates.length > 0) recommendations.push(`ℹ️ ${cachedDuplicates.length} resources are requested multiple times but served from cache — low performance impact, but worth reviewing for correctness.`);
  if (corsRestricted > 0 && headersAnalyzed === 0) recommendations.push(`ℹ️ All resources are cross-origin CORS-restricted — header analysis was limited. Add Timing-Allow-Origin for more insights.`);
  if (recommendations.length > 0) {
    for (const rec of recommendations) void 0;
  }
  const cacheEfficiencyRating = cacheEfficiencyPercent >= 80 ? "good" : cacheEfficiencyPercent >= 50 ? "needs-improvement" : "poor";
  const MAX_ITEMS = 50;
  const actionableEntries = entries.filter(e => e.antiPatterns.length > 0 || [ "none", "no-store", "no-cache", "short" ].includes(e.cacheStrategy));
  return {
    script: "Cache-Strategy-Analysis",
    status: "ok",
    count: entries.length,
    corsLimitedAnalysis: corsRestricted > 0,
    details: {
      totalResources: entries.length,
      actionableCount: actionableEntries.length,
      headersAnalyzed: headersAnalyzed,
      corsRestricted: corsRestricted,
      excludedFromHeaders: excludedFromHeaders.length,
      cacheEfficiencyPercent: cacheEfficiencyPercent,
      cacheEfficiencyRating: cacheEfficiencyRating,
      bandwidthSavedBytes: bandwidthSavedBytes,
      strategyDistribution: strategyGroups,
      cdnDetected: cdnEntries.length > 0,
      cdnHitRate: cdnHitRate,
      cdnHitRateRating: cdnHitRate === null ? null : cdnHitRate >= 70 ? "good" : "poor",
      antiPatternCount: allAntiPatterns.length,
      duplicatesCostlyCount: costlyDuplicates.length,
      uncompressedCount: uncompressedResources.length,
      protocolDistribution: protocolDistribution
    },
    items: actionableEntries.sort((a, b) => b.antiPatterns.length - a.antiPatterns.length || b.decodedBodySize - a.decodedBodySize).slice(0, MAX_ITEMS).map(e => ({
      shortName: e.shortName,
      host: e.host,
      type: e.type,
      firstParty: e.firstParty,
      cacheStrategy: e.cacheStrategy,
      sizeBytes: e.decodedBodySize,
      isCached: e.isCached,
      antiPatterns: e.antiPatterns.map(p => p.id)
    })),
    issues: allAntiPatterns.map(p => ({
      severity: p.severity,
      id: p.id,
      resource: p.resource,
      message: p.message
    })),
    recommendations: recommendations
  };
})();
