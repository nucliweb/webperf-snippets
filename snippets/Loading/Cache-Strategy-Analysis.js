// Cache Strategy Analysis
// Analyzes HTTP caching strategies, CDN hit rates, and cache anti-patterns across all page resources
// https://webperf-snippets.nucliweb.net

(async () => {
  // --- Helpers ---

  // @shared getRootDomain
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    // An IP address has no registrable domain, so each address is its own root
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    // Country-code domains with a second-level suffix: example.co.uk, example.com.au, example.ac.jp
    const secondLevelSuffixes = ["ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch"];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  // @end-shared getRootDomain

  // @shared isFirstParty
  function isFirstParty(hostname) {
    return getRootDomain(hostname) === getRootDomain(location.hostname);
  }
  // @end-shared isFirstParty

  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

  function getResourceType(entry) {
    // Use file extension as primary signal — initiatorType reflects the loader
    // (e.g. a font loaded from CSS has initiatorType "css", not "font")
    const path = (entry.name || "").split("?")[0].toLowerCase();
    if (/\.(woff2?|ttf|otf|eot)$/.test(path)) return "font";
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(path)) return "image";
    if (/\.(mp4|webm|ogg|mov)$/.test(path)) return "video";
    if (/\.(mp3|wav|flac|aac)$/.test(path)) return "audio";
    if (/\.css$/.test(path)) return "style";
    if (/\.js$/.test(path)) return "script";

    // Fall back to initiatorType map
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
      other: "other",
    };
    return map[entry.initiatorType] || entry.initiatorType || "other";
  }

  function detectHashInUrl(url) {
    // Detects content-hash patterns in file paths or query strings.
    // Real content hashes are hex-only (a-f0-9) — broad alphanumeric patterns
    // produce false positives on descriptive filenames like "sprite-placeholder.png".
    const hashPatterns = [
      // Hex hash embedded in filename: .abc12345def.ext or -abc12345def.ext (min 8 hex chars)
      /[.-][a-f0-9]{8,32}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|webp|avif)(\?|$)/,
      // Query string version params: ?v=abc123, ?hash=..., ?rev=...
      /[?&](v|version|hash|rev|_v)=[a-zA-Z0-9._-]+/,
    ];
    return hashPatterns.some((re) => re.test(url));
  }

  function isStaticAsset(type) {
    return ["script", "style", "font", "image"].includes(type);
  }

  function parseCacheControl(headerValue) {
    const directives = {};
    if (!headerValue) return directives;
    for (const part of headerValue.split(",")) {
      const [key, val] = part.trim().split("=");
      const k = key.trim().toLowerCase();
      directives[k] = val !== undefined ? val.trim().replace(/"/g, "") : true;
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

    const maxAge =
      cc["max-age"] !== undefined ? parseInt(cc["max-age"], 10) : null;
    const sMaxAge =
      cc["s-maxage"] !== undefined ? parseInt(cc["s-maxage"], 10) : null;
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
    if (!headers) return { cdn: "unknown", status: "unknown" };

    if (headers["cf-cache-status"]) {
      return { cdn: "Cloudflare", status: headers["cf-cache-status"] };
    }
    if (headers["x-vercel-cache"]) {
      return { cdn: "Vercel", status: headers["x-vercel-cache"] };
    }
    if (headers["x-cache"]) {
      const val = headers["x-cache"].toUpperCase();
      const cdn = headers["x-amz-cf-id"] ? "CloudFront" : "CDN";
      return { cdn, status: val.includes("HIT") ? "HIT" : "MISS" };
    }
    if (headers["age"]) {
      return {
        cdn: "Proxy/CDN",
        status: `HIT (Age: ${headers["age"]}s)`,
      };
    }
    if (headers["via"]) {
      return { cdn: `Proxy (${headers["via"]})`, status: "proxied" };
    }
    if (headers["server-timing"]) {
      const st = headers["server-timing"].toLowerCase();
      if (st.includes("cdn-cache") || st.includes("cache;")) {
        return {
          cdn: "CDN (Server-Timing)",
          status: st.includes("hit") ? "HIT" : "MISS",
        };
      }
    }
    return { cdn: "none", status: "no-cdn-headers" };
  }

  // --- Phase 1: Gather resource entries ---

  // Exclude HEAD/aborted-GET entries injected by this snippet's own fetch calls
  // on previous runs. Those entries have no body (encodedBodySize=0, decodedBodySize=0)
  // but did transfer bytes (transferSize>0, i.e. only response headers were received).
  // Real page resources always have encodedBodySize > 0 (or transferSize = 0 if cached).
  const resources = performance.getEntriesByType("resource").filter(
    (r) => !(r.encodedBodySize === 0 && r.decodedBodySize === 0 && r.transferSize > 0)
  );

  // Detect duplicate URLs
  const urlCounts = new Map();
  for (const r of resources) {
    urlCounts.set(r.name, (urlCounts.get(r.name) || 0) + 1);
  }

  const entries = resources.map((r) => {
    let url;
    try {
      url = new URL(r.name);
    } catch {
      url = { hostname: location.hostname, pathname: r.name };
    }
    const firstParty = isFirstParty(url.hostname);
    const isCached = r.encodedBodySize > 0 && r.transferSize === 0;
    const isCorsRestricted =
      r.encodedBodySize === 0 && r.transferSize === 0 && !firstParty;

    return {
      url: r.name,
      shortName:
        (url.pathname || r.name).split("/").filter(Boolean).pop() ||
        url.hostname,
      host: url.hostname,
      firstParty,
      type: getResourceType(r),
      transferSize: r.transferSize || 0,
      encodedBodySize: r.encodedBodySize || 0,
      decodedBodySize: r.decodedBodySize || 0,
      isCached,
      isCorsRestricted,
      nextHopProtocol: r.nextHopProtocol || "unknown",
      duration: r.duration,
      hasHash: detectHashInUrl(r.name),
      isDuplicate: (urlCounts.get(r.name) || 1) > 1,
      // Populated in Phase 2
      headers: null,
      cacheStrategy: null,
      cdnInfo: null,
      antiPatterns: [],
    };
  });

  // --- Phase 2: Fetch headers for same-origin static assets ---

  // Scope: true same-origin only (same scheme+host+port, not just root domain).
  // isFirstParty() matches root domains (api.fedex.com = first party for www.fedex.com)
  // but the browser enforces CORS per full origin, causing console errors.
  // Also limit to static asset types — API endpoints and iframes tend to reject HEAD
  // (503/403) and pollute the console without adding useful cache strategy data.
  const FETCHABLE_TYPES = new Set(["script", "style", "font", "image"]);

  const fetchableEntries = entries.filter(
    (e) => e.url.startsWith(location.origin + "/") && FETCHABLE_TYPES.has(e.type)
  );
  const uniqueUrls = [...new Set(fetchableEntries.map((e) => e.url))];

  const headerCache = new Map();
  const BATCH_SIZE = 10;

  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const resp = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (!resp.ok) {
            headerCache.set(url, null);
            return;
          }
          const headers = {};
          for (const [key, value] of resp.headers) {
            headers[key.toLowerCase()] = value;
          }
          headerCache.set(url, headers);
        } catch {
          // Network error or CORS — skip silently, Tier 1 heuristics apply
          headerCache.set(url, null);
        }
      })
    );
  }

  // Attach headers to entries
  for (const entry of entries) {
    entry.headers = headerCache.get(entry.url) || null;
  }

  // --- Phase 3: Classify cache strategies ---

  for (const entry of entries) {
    if (entry.headers) {
      entry.cacheStrategy = classifyCacheStrategy(entry.headers);
    } else if (entry.isCorsRestricted) {
      entry.cacheStrategy = "unknown (CORS)";
    } else if (entry.isCached) {
      // Tier 1 heuristic: no headers but we know it was cached
      entry.cacheStrategy = "cached (inferred)";
    } else {
      entry.cacheStrategy = "unknown";
    }
    entry.cdnInfo = detectCdnStatus(entry.headers);
  }

  // --- Phase 4: Detect anti-patterns ---

  const EFFECTIVE_CACHE_STRATEGIES = new Set([
    "immutable",
    "long",
    "medium",
    "swr",
    "must-revalidate",
    "cached (inferred)",
  ]);

  for (const entry of entries) {
    if (!entry.headers) continue;
    const cc = parseCacheControl(entry.headers["cache-control"] || "");
    const maxAge =
      cc["max-age"] !== undefined ? parseInt(cc["max-age"], 10) : null;
    const strategy = entry.cacheStrategy;
    const type = entry.type;

    if (isStaticAsset(type) && cc["no-store"]) {
      entry.antiPatterns.push({
        id: "static-no-store",
        severity: "error",
        message: `${type} asset with no-store — static assets should be cacheable`,
      });
    }

    if (entry.hasHash && maxAge !== null && maxAge < 86400 && !cc["no-store"]) {
      entry.antiPatterns.push({
        id: "versioned-short-cache",
        severity: "warning",
        message: `Versioned URL (hash detected) but max-age=${maxAge}s — consider long cache or immutable`,
      });
    }

    if (entry.hasHash && !cc["immutable"] && !cc["no-store"] && (maxAge === null || maxAge >= 86400)) {
      entry.antiPatterns.push({
        id: "versioned-not-immutable",
        severity: "info",
        message: `Versioned URL (hash detected) without Cache-Control: immutable`,
      });
    }

    if (
      entry.decodedBodySize > 100 * 1024 &&
      ["none", "no-store", "no-cache"].includes(strategy)
    ) {
      entry.antiPatterns.push({
        id: "large-no-cache",
        severity: "error",
        message: `Large resource (${formatBytes(entry.decodedBodySize)}) with no effective cache`,
      });
    }

    if (entry.headers["expires"] && !entry.headers["cache-control"]) {
      entry.antiPatterns.push({
        id: "expires-without-cc",
        severity: "warning",
        message: `Uses Expires header without Cache-Control (outdated pattern)`,
      });
    }

    if (isStaticAsset(type) && maxAge === 0) {
      entry.antiPatterns.push({
        id: "maxage-zero-static",
        severity: "warning",
        message: `Static asset with max-age=0 — forces revalidation on every request`,
      });
    }

    if (
      isStaticAsset(type) &&
      maxAge !== null &&
      maxAge > 0 &&
      maxAge < 3600 &&
      !cc["no-store"]
    ) {
      entry.antiPatterns.push({
        id: "short-cache-static",
        severity: "warning",
        message: `Static asset with max-age=${maxAge}s (< 1h) — consider a longer cache duration`,
      });
    }
  }

  // --- Phase 5: CDN analysis ---

  const cdnEntries = entries.filter(
    (e) => e.cdnInfo && e.cdnInfo.cdn !== "none" && e.cdnInfo.cdn !== "unknown"
  );
  const cdnHits = cdnEntries.filter((e) =>
    e.cdnInfo.status.toUpperCase().startsWith("HIT")
  ).length;
  const cdnHitRate =
    cdnEntries.length > 0
      ? Math.round((cdnHits / cdnEntries.length) * 100)
      : null;

  // --- Phase 6: Value-add metrics ---

  const effectiveEntries = entries.filter((e) =>
    EFFECTIVE_CACHE_STRATEGIES.has(e.cacheStrategy)
  );
  const cacheEfficiencyPercent =
    entries.length > 0
      ? Math.round((effectiveEntries.length / entries.length) * 100)
      : 0;

  const bandwidthSavedBytes = entries
    .filter((e) => e.isCached)
    .reduce((sum, e) => sum + e.decodedBodySize, 0);

  // Protocol distribution
  const protocolDistribution = {};
  for (const entry of entries) {
    const proto = entry.nextHopProtocol || "unknown";
    protocolDistribution[proto] = (protocolDistribution[proto] || 0) + 1;
  }

  // Uncompressed text resources (encoded ≈ decoded, size > 1KB, text type)
  const uncompressedResources = entries.filter(
    (e) =>
      e.encodedBodySize > 1024 &&
      e.decodedBodySize > 0 &&
      e.encodedBodySize / e.decodedBodySize > 0.9 &&
      ["script", "style", "fetch", "xhr"].includes(e.type)
  );

  // Duplicate resources — group by URL and track whether any load was uncached
  const uniqueDuplicates = [...new Set(
    entries.filter((e) => e.isDuplicate).map((e) => e.url)
  )].map((url) => {
    const group = entries.filter((e) => e.url === url);
    const uncachedLoads = group.filter((e) => !e.isCached).length;
    return {
      url,
      shortName: group[0]?.shortName || url,
      count: urlCounts.get(url),
      type: group[0]?.type || "unknown",
      uncachedLoads,
      // Only "costly" if at least one load went to the network
      costly: uncachedLoads > 0,
    };
  });
  // Separate costly duplicates (network requests) from cached duplicates (cheap)
  const costlyDuplicates = uniqueDuplicates.filter((d) => d.costly);
  const cachedDuplicates = uniqueDuplicates.filter((d) => !d.costly);

  // --- Phase 7: Console output ---

  if (entries.length === 0) {
    console.group("%c🔍 Cache Strategy Analysis", "font-weight: bold; font-size: 14px;");
    console.warn("⚠️ No resources found in the Performance API buffer.");
    console.log("   This usually means the site called performance.clearResourceTimings() to manage memory.");
    console.log("   Try: reload the page and run this snippet immediately after load.");
    console.groupEnd();
    return {
      script: "Cache-Strategy-Analysis",
      status: "error",
      error: "No resources in the Performance API buffer (performance.clearResourceTimings() may have been called). Reload the page and run the snippet again.",
    };
  }

  const allAntiPatterns = entries.flatMap((e) =>
    e.antiPatterns.map((ap) => ({ ...ap, resource: e.shortName, url: e.url }))
  );

  const strategyGroups = {};
  for (const entry of entries) {
    const s = entry.cacheStrategy;
    if (!strategyGroups[s]) strategyGroups[s] = 0;
    strategyGroups[s]++;
  }

  const noCacheEntries = entries.filter((e) =>
    ["none", "no-store", "no-cache"].includes(e.cacheStrategy)
  );
  const shortCacheEntries = entries.filter(
    (e) => e.cacheStrategy === "short"
  );

  const headersAnalyzed = entries.filter((e) => e.headers !== null).length;
  const corsRestricted = entries.filter((e) => e.isCorsRestricted).length;

  // Resources excluded from header analysis — cross-origin or non-static types.
  // Cross-origin (different scheme/host/port) cannot be fetched due to CORS.
  // Non-static types (xhr, fetch, iframe, beacon…) are excluded intentionally:
  // their servers commonly reject HEAD requests (4xx/5xx) and their caching
  // rules differ from static assets — they are still visible in Tier 1 data.
  const excludedFromHeaders = entries.filter(
    (e) =>
      e.headers === null &&
      !e.isCorsRestricted &&
      (!e.url.startsWith(location.origin + "/") ||
        !FETCHABLE_TYPES.has(e.type))
  );

  console.group(
    "%c🔍 Cache Strategy Analysis",
    "font-weight: bold; font-size: 14px;"
  );

  console.log("");
  console.log("%c📊 Summary", "font-weight: bold;");
  console.log(`   Total resources: ${entries.length}`);
  console.log(
    `   Headers analyzed: ${headersAnalyzed} | CORS-restricted: ${corsRestricted} | Excluded (non-static/cross-origin): ${excludedFromHeaders.length}`
  );
  if (excludedFromHeaders.length > 0) {
    const excludedTypes = [...new Set(excludedFromHeaders.map((e) => e.type))].join(", ");
    console.log(
      `   ℹ️  Excluded resources (${excludedTypes}) are analyzed with Tier 1 data only (Performance API) — header inspection requires same-origin static assets due to CORS restrictions.`
    );
  }
  console.log(`   Cache efficiency: ${cacheEfficiencyPercent}%`);
  console.log(`   Bandwidth saved by cache: ${formatBytes(bandwidthSavedBytes)}`);
  if (cdnHitRate !== null) {
    console.log(
      `   CDN hit rate: ${cdnHitRate}% (${cdnHits}/${cdnEntries.length} resources)`
    );
  }
  if (allAntiPatterns.length > 0) {
    const errors = allAntiPatterns.filter((p) => p.severity === "error").length;
    const warnings = allAntiPatterns.filter(
      (p) => p.severity === "warning"
    ).length;
    const infos = allAntiPatterns.filter((p) => p.severity === "info").length;
    console.log(
      `   Anti-patterns: ${allAntiPatterns.length} (${errors} errors, ${warnings} warnings, ${infos} info)`
    );
  }

  // Strategy distribution
  console.log("");
  console.group("%c📋 Cache Strategy Distribution", "font-weight: bold;");
  const strategyOrder = [
    "immutable",
    "long",
    "medium",
    "short",
    "swr",
    "must-revalidate",
    "no-cache",
    "no-store",
    "expires-only",
    "none",
    "cached (inferred)",
    "unknown (CORS)",
    "unknown",
  ];
  const strategyTable = strategyOrder
    .filter((s) => strategyGroups[s])
    .map((s) => ({
      Strategy: s,
      Count: strategyGroups[s],
      "% of Total": `${Math.round((strategyGroups[s] / entries.length) * 100)}%`,
      Effective: EFFECTIVE_CACHE_STRATEGIES.has(s) ? "✅" : "❌",
    }));
  console.table(strategyTable);
  console.groupEnd();

  // Resources without cache
  if (noCacheEntries.length > 0) {
    console.log("");
    console.group(
      `%c🚫 Resources Without Cache (${noCacheEntries.length})`,
      "font-weight: bold; color: #ef4444;"
    );
    console.table(
      noCacheEntries.map((e) => ({
        Resource: e.shortName,
        Type: e.type,
        Strategy: e.cacheStrategy,
        Size: formatBytes(e.decodedBodySize),
        Host: e.host,
        "First Party": e.firstParty ? "✅" : "❌",
      }))
    );
    console.groupEnd();
  }

  // Short cache resources
  if (shortCacheEntries.length > 0) {
    console.log("");
    console.group(
      `%c⏱ Short Cache Resources (${shortCacheEntries.length})`,
      "font-weight: bold; color: #f59e0b;"
    );
    console.table(
      shortCacheEntries.map((e) => {
        const cc = parseCacheControl(e.headers?.["cache-control"] || "");
        return {
          Resource: e.shortName,
          Type: e.type,
          "max-age": cc["max-age"] ? `${cc["max-age"]}s` : "N/A",
          Size: formatBytes(e.decodedBodySize),
          "Has Hash": e.hasHash ? "✅" : "❌",
          Host: e.host,
        };
      })
    );
    console.groupEnd();
  }

  // Anti-patterns
  if (allAntiPatterns.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Cache Anti-patterns (${allAntiPatterns.length})`,
      "font-weight: bold; color: #f59e0b;"
    );
    console.groupCollapsed("📖 Legend");
    console.table([
      { Pattern: "static-no-store",        Severity: "🔴 error",   Meaning: "JS/CSS/font/image with no-store — static assets should always be cacheable" },
      { Pattern: "large-no-cache",          Severity: "🔴 error",   Meaning: "Resource > 100 KB with no effective cache — significant bandwidth waste per visit" },
      { Pattern: "versioned-short-cache",   Severity: "🟡 warning", Meaning: "Hashed URL with max-age < 86400 — safe to use immutable since URL changes with content" },
      { Pattern: "expires-without-cc",      Severity: "🟡 warning", Meaning: "Uses Expires header without Cache-Control — outdated pattern, less reliable" },
      { Pattern: "maxage-zero-static",      Severity: "🟡 warning", Meaning: "Static asset with max-age=0 — browser revalidates on every request" },
      { Pattern: "short-cache-static",      Severity: "🟡 warning", Meaning: "Static asset with max-age < 3600 — consider a longer cache duration" },
      { Pattern: "versioned-not-immutable", Severity: "🔵 info",    Meaning: "Hashed URL without immutable directive — adding it avoids conditional GET requests" },
    ]);
    console.groupEnd();
    for (const severity of ["error", "warning", "info"]) {
      const filtered = allAntiPatterns.filter((p) => p.severity === severity);
      if (filtered.length === 0) continue;
      const icon = { error: "🔴", warning: "🟡", info: "🔵" }[severity];
      console.group(`${icon} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${filtered.length})`);
      console.table(
        filtered.map((p) => ({
          Resource: p.resource,
          Pattern: p.id,
          Detail: p.message,
        }))
      );
      console.groupEnd();
    }
    console.groupEnd();
  }

  // CDN status
  if (cdnEntries.length > 0) {
    console.log("");
    console.group(
      `%c🌐 CDN Cache Status`,
      "font-weight: bold; color: #3b82f6;"
    );
    console.log(
      `   Hit rate: ${cdnHitRate}% (${cdnHits} hits / ${cdnEntries.length} CDN resources)`
    );
    console.table(
      cdnEntries.map((e) => ({
        Resource: e.shortName,
        CDN: e.cdnInfo.cdn,
        Status: e.cdnInfo.status,
        "Cache-Control": e.headers?.["cache-control"] || "N/A",
        Type: e.type,
      }))
    );
    console.groupEnd();
  }

  // Additional insights
  console.log("");
  console.group("%c💡 Additional Insights", "font-weight: bold;");

  // Protocol
  console.group("Protocol Distribution");
  console.table(
    Object.entries(protocolDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([proto, count]) => ({
        Protocol: proto,
        Count: count,
        "% of Total": `${Math.round((count / entries.length) * 100)}%`,
      }))
  );
  console.groupEnd();

  // Uncompressed
  if (uncompressedResources.length > 0) {
    console.group(`Likely Uncompressed Resources (${uncompressedResources.length})`);
    console.table(
      uncompressedResources.map((e) => ({
        Resource: e.shortName,
        Type: e.type,
        "Encoded Size": formatBytes(e.encodedBodySize),
        "Decoded Size": formatBytes(e.decodedBodySize),
        "Compression Ratio": `${((1 - e.encodedBodySize / e.decodedBodySize) * 100).toFixed(0)}%`,
      }))
    );
    console.groupEnd();
  }

  // Duplicates — show costly (network) first, then cached-only
  if (costlyDuplicates.length > 0) {
    console.group(
      `Duplicate Resources — Network Impact (${costlyDuplicates.length} URLs with uncached loads)`
    );
    console.table(
      costlyDuplicates.map((d) => ({
        Resource: d.shortName,
        Type: d.type,
        "Times Loaded": d.count,
        "Uncached Loads": d.uncachedLoads,
      }))
    );
    console.groupEnd();
  }
  if (cachedDuplicates.length > 0) {
    console.group(
      `Duplicate Resources — Cache Only (${cachedDuplicates.length} URLs loaded multiple times, all cached)`
    );
    console.table(
      cachedDuplicates.map((d) => ({
        Resource: d.shortName,
        Type: d.type,
        "Times Loaded": d.count,
      }))
    );
    console.groupEnd();
  }

  console.groupEnd(); // Additional Insights

  // Recommendations
  const recommendations = [];

  if (noCacheEntries.filter((e) => isStaticAsset(e.type)).length > 0) {
    recommendations.push(
      "🔴 Add Cache-Control headers to static assets (JS, CSS, fonts, images). Start with max-age=86400 and move to immutable for versioned files."
    );
  }
  if (shortCacheEntries.filter((e) => e.hasHash).length > 0) {
    recommendations.push(
      "🟡 Versioned files (with content hash) should use long cache or Cache-Control: immutable — they can be cached indefinitely since the URL changes on update."
    );
  }
  if (allAntiPatterns.some((p) => p.id === "expires-without-cc")) {
    recommendations.push(
      "🟡 Replace Expires headers with Cache-Control: max-age — Expires is an outdated mechanism and less reliable."
    );
  }
  if (entries.length > 0 && cacheEfficiencyPercent < 50) {
    recommendations.push(
      `🔴 Cache efficiency is low (${cacheEfficiencyPercent}%). Review caching strategy for all static assets.`
    );
  }
  if (cdnHitRate !== null && cdnHitRate < 70) {
    recommendations.push(
      `🟡 CDN hit rate is ${cdnHitRate}%. Check CDN cache rules and ensure static assets have appropriate TTLs.`
    );
  }
  if (protocolDistribution["http/1.1"] > 0) {
    recommendations.push(
      `🟡 ${protocolDistribution["http/1.1"]} resources still use HTTP/1.1. Consider upgrading to HTTP/2 for better multiplexing.`
    );
  }
  if (uncompressedResources.length > 0) {
    recommendations.push(
      `🟡 ${uncompressedResources.length} text resources appear uncompressed. Enable Brotli or gzip compression on your server.`
    );
  }
  if (costlyDuplicates.length > 0) {
    recommendations.push(
      `🟡 ${costlyDuplicates.length} resources are loaded multiple times with uncached network requests. Check for duplicate script, stylesheet, or fetch includes.`
    );
  } else if (cachedDuplicates.length > 0) {
    recommendations.push(
      `ℹ️ ${cachedDuplicates.length} resources are requested multiple times but served from cache — low performance impact, but worth reviewing for correctness.`
    );
  }
  if (corsRestricted > 0 && headersAnalyzed === 0) {
    recommendations.push(
      `ℹ️ All resources are cross-origin CORS-restricted — header analysis was limited. Add Timing-Allow-Origin for more insights.`
    );
  }

  if (recommendations.length > 0) {
    console.log("");
    console.group("%c📌 Recommendations", "font-weight: bold;");
    for (const rec of recommendations) {
      console.log(`   ${rec}`);
    }
    console.groupEnd();
  }

  console.groupEnd(); // Cache Strategy Analysis

  // --- Return structured object ---

  const cacheEfficiencyRating =
    cacheEfficiencyPercent >= 80
      ? "good"
      : cacheEfficiencyPercent >= 50
      ? "needs-improvement"
      : "poor";

  const MAX_ITEMS = 50;
  const actionableEntries = entries.filter(
    (e) =>
      e.antiPatterns.length > 0 ||
      ["none", "no-store", "no-cache", "short"].includes(e.cacheStrategy)
  );
  return {
    script: "Cache-Strategy-Analysis",
    status: "ok",
    count: entries.length,
    corsLimitedAnalysis: corsRestricted > 0,
    details: {
      totalResources: entries.length,
      actionableCount: actionableEntries.length,
      headersAnalyzed,
      corsRestricted,
      excludedFromHeaders: excludedFromHeaders.length,
      cacheEfficiencyPercent,
      cacheEfficiencyRating,
      bandwidthSavedBytes,
      strategyDistribution: strategyGroups,
      cdnDetected: cdnEntries.length > 0,
      cdnHitRate,
      cdnHitRateRating:
        cdnHitRate === null ? null : cdnHitRate >= 70 ? "good" : "poor",
      antiPatternCount: allAntiPatterns.length,
      duplicatesCostlyCount: costlyDuplicates.length,
      uncompressedCount: uncompressedResources.length,
      protocolDistribution,
    },
    // Only resources with actionable issues, at most 50: the ones with the most anti-patterns
    // first, then the largest. Clean resources are left out to reduce noise.
    items: actionableEntries
      .sort((a, b) => b.antiPatterns.length - a.antiPatterns.length || b.decodedBodySize - a.decodedBodySize)
      .slice(0, MAX_ITEMS)
      .map((e) => ({
        shortName: e.shortName,
        host: e.host,
        type: e.type,
        firstParty: e.firstParty,
        cacheStrategy: e.cacheStrategy,
        sizeBytes: e.decodedBodySize,
        isCached: e.isCached,
        antiPatterns: e.antiPatterns.map((p) => p.id),
      })),
    issues: allAntiPatterns.map((p) => ({
      severity: p.severity,
      id: p.id,
      resource: p.resource,
      message: p.message,
    })),
    recommendations,
  };
})();
