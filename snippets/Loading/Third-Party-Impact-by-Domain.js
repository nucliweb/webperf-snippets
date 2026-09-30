// Third-Party Impact by Domain
// Groups third-party requests by root domain and reports requests, transfer size, render-blocking and main-thread time
// https://webperf-snippets.nucliweb.net

(() => {
  const MAX_ITEMS = 50;
  const LOAF_WARNING_MS = 250; // Script time in long animation frames above which one domain is a problem
  const MAX_LISTED_DOMAINS = 5;

  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

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

  // Root domain of an http(s) URL, or null for anything else (data:, blob:, empty)
  const rootDomainOf = (url) => {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) ? { root: getRootDomain(u.hostname), first: isFirstParty(u.hostname) } : null;
    } catch {
      return null;
    }
  };

  const domains = new Map();
  const domainEntry = (root) => {
    if (!domains.has(root)) {
      domains.set(root, { domain: root, requests: 0, transferBytes: 0, sizeUnknownCount: 0, renderBlocking: false, loafMs: null, loafScripts: 0 });
    }
    return domains.get(root);
  };

  let firstPartyRequests = 0;
  let thirdPartyRequests = 0;
  let thirdPartyBytes = 0;
  let sizeUnknownCount = 0;

  performance.getEntriesByType("resource").forEach((entry) => {
    const parsed = rootDomainOf(entry.name);
    if (!parsed) return;
    if (parsed.first) {
      firstPartyRequests++;
      return;
    }
    const d = domainEntry(parsed.root);
    d.requests++;
    thirdPartyRequests++;

    // Cross-origin resources without Timing-Allow-Origin report every size as zero
    const sizeKnown = entry.transferSize > 0 || entry.encodedBodySize > 0 || entry.decodedBodySize > 0;
    if (sizeKnown) {
      const bytes = entry.transferSize || entry.encodedBodySize || 0;
      d.transferBytes += bytes;
      thirdPartyBytes += bytes;
    } else {
      d.sizeUnknownCount++;
      sizeUnknownCount++;
    }

    if (entry.renderBlockingStatus === "blocking" && (entry.initiatorType === "script" || entry.initiatorType === "link")) {
      d.renderBlocking = true;
    }
  });

  // Main-thread time: script time inside long animation frames, attributed by the script's source URL
  const loafSupported = !!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame");
  let thirdPartyLoafMs = null;
  if (loafSupported) {
    thirdPartyLoafMs = 0;
    domains.forEach((d) => {
      d.loafMs = 0;
    });
    performance.getEntriesByType("long-animation-frame").forEach((frame) => {
      (frame.scripts || []).forEach((script) => {
        const parsed = rootDomainOf(script.sourceURL);
        if (!parsed || parsed.first) return;
        const d = domainEntry(parsed.root);
        d.loafMs = (d.loafMs || 0) + script.duration;
        d.loafScripts++;
        thirdPartyLoafMs += script.duration;
      });
    });
    domains.forEach((d) => {
      d.loafMs = Math.round(d.loafMs || 0);
    });
    thirdPartyLoafMs = Math.round(thirdPartyLoafMs);
  }

  // Render-blocking first, then main-thread time, then transfer size
  const all = [...domains.values()].sort(
    (a, b) =>
      Number(b.renderBlocking) - Number(a.renderBlocking) ||
      (b.loafMs || 0) - (a.loafMs || 0) ||
      b.transferBytes - a.transferBytes ||
      a.domain.localeCompare(b.domain)
  );

  const blocking = all.filter((d) => d.renderBlocking);
  const heavy = all.filter((d) => (d.loafMs || 0) > LOAF_WARNING_MS);
  const corsLimitedAnalysis = sizeUnknownCount > 0;

  const listDomains = (list) => {
    const names = list.slice(0, MAX_LISTED_DOMAINS).map((d) => d.domain);
    return names.join(", ") + (list.length > MAX_LISTED_DOMAINS ? ` and ${list.length - MAX_LISTED_DOMAINS} more` : "");
  };

  const issues = [];
  if (blocking.length > 0) {
    issues.push({
      severity: "warning",
      message: `${blocking.length} third-party domain(s) serve render-blocking resources (${listDomains(blocking)}); load them async or defer, or self-host them`,
    });
  }
  heavy.slice(0, MAX_LISTED_DOMAINS).forEach((d) => {
    issues.push({
      severity: "warning",
      message: `${d.domain} scripts take ${d.loafMs} ms of main-thread time in long animation frames (over ${LOAF_WARNING_MS} ms); defer, delay or remove them`,
    });
  });
  if (corsLimitedAnalysis) {
    issues.push({
      severity: "info",
      message: `${sizeUnknownCount} third-party request(s) without Timing-Allow-Origin report zero sizes, so the transfer size is a lower bound`,
    });
  }

  console.group("%c🌐 Third-Party Impact by Domain", "font-weight: bold; font-size: 14px;");
  console.log(
    `Third-party domains: ${all.length} | requests: ${thirdPartyRequests} | transfer: ${formatBytes(thirdPartyBytes)} | first-party requests: ${firstPartyRequests}`
  );
  if (all.length > 0) {
    console.table(
      all.slice(0, MAX_ITEMS).map((d) => ({
        Domain: d.domain,
        Requests: d.requests,
        Size: d.sizeUnknownCount === d.requests ? "unknown" : formatBytes(d.transferBytes),
        "Render-blocking": d.renderBlocking ? "yes" : "no",
        "Main thread": d.loafMs === null ? "n/a" : d.loafMs + " ms",
      }))
    );
  } else {
    console.log("%c✅ No third-party requests found", "color: #22c55e;");
  }
  if (!loafSupported) {
    console.log("%cℹ️ Long Animation Frames are not supported; main-thread time is unavailable (Chrome 123+)", "color: #3b82f6;");
  }
  if (corsLimitedAnalysis) {
    console.log("%cℹ️ Some third-party sizes are hidden (no Timing-Allow-Origin); sizes are a lower bound", "color: #3b82f6;");
  }
  console.groupEnd();

  return {
    script: "Third-Party-Impact-by-Domain",
    status: "ok",
    count: all.length,
    corsLimitedAnalysis,
    details: {
      thirdPartyRequests,
      thirdPartyBytes,
      thirdPartyLoafMs,
      firstPartyRequests,
      blockingDomains: blocking.length,
      loafSupported,
      sizeUnknownCount,
    },
    items: all.slice(0, MAX_ITEMS),
    issues,
  };
})();
