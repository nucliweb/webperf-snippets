(() => {
  const MAX_ITEMS = 50;
  const LOAF_WARNING_MS = 250;
  const MAX_LISTED_DOMAINS = 5;
  const OWN_DOMAINS = [];
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
    const root = getRootDomain(hostname);
    if (root === getRootDomain(location.hostname)) return true;
    return OWN_DOMAINS.some(d => getRootDomain(String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]) === root);
  }
  function logOwnDomainsHint(thirdPartyCount) {
    if (OWN_DOMAINS.length === 0 && thirdPartyCount > 0) void 0;
  }
  const rootDomainOf = url => {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) ? {
        root: getRootDomain(u.hostname),
        first: isFirstParty(u.hostname)
      } : null;
    } catch {
      return null;
    }
  };
  const domains = new Map;
  const domainEntry = root => {
    if (!domains.has(root)) domains.set(root, {
      domain: root,
      requests: 0,
      transferBytes: 0,
      sizeUnknownCount: 0,
      renderBlocking: false,
      loafMs: null,
      loafScripts: 0
    });
    return domains.get(root);
  };
  let firstPartyRequests = 0;
  let thirdPartyRequests = 0;
  let thirdPartyBytes = 0;
  let sizeUnknownCount = 0;
  performance.getEntriesByType("resource").forEach(entry => {
    const parsed = rootDomainOf(entry.name);
    if (!parsed) return;
    if (parsed.first) {
      firstPartyRequests++;
      return;
    }
    const d = domainEntry(parsed.root);
    d.requests++;
    thirdPartyRequests++;
    const sizeKnown = entry.transferSize > 0 || entry.encodedBodySize > 0 || entry.decodedBodySize > 0;
    if (sizeKnown) {
      const bytes = entry.transferSize || entry.encodedBodySize || 0;
      d.transferBytes += bytes;
      thirdPartyBytes += bytes;
    } else {
      d.sizeUnknownCount++;
      sizeUnknownCount++;
    }
    if (entry.renderBlockingStatus === "blocking" && (entry.initiatorType === "script" || entry.initiatorType === "link")) d.renderBlocking = true;
  });
  const loafSupported = !!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame");
  let thirdPartyLoafMs = null;
  let longFrames = null;
  let longFramesMs = null;
  if (loafSupported) {
    thirdPartyLoafMs = 0;
    domains.forEach(d => {
      d.loafMs = 0;
    });
    const frames = performance.getEntriesByType("long-animation-frame");
    longFrames = frames.length;
    longFramesMs = frames.reduce((total, frame) => total + frame.duration, 0);
    frames.forEach(frame => {
      (frame.scripts || []).forEach(script => {
        const parsed = rootDomainOf(script.sourceURL);
        if (!parsed || parsed.first) return;
        const d = domainEntry(parsed.root);
        d.loafMs = (d.loafMs || 0) + script.duration;
        d.loafScripts++;
        thirdPartyLoafMs += script.duration;
      });
    });
    domains.forEach(d => {
      d.loafMs = Math.round(d.loafMs || 0);
    });
    thirdPartyLoafMs = Math.round(thirdPartyLoafMs);
    longFramesMs = Math.round(longFramesMs);
  }
  const unattributedLoafMs = loafSupported ? Math.max(0, longFramesMs - thirdPartyLoafMs) : null;
  const loafUnattributed = loafSupported && domains.size > 0 && thirdPartyLoafMs === 0 && longFrames > 0;
  const all = [ ...domains.values() ].sort((a, b) => Number(b.renderBlocking) - Number(a.renderBlocking) || (b.loafMs || 0) - (a.loafMs || 0) || b.transferBytes - a.transferBytes || a.domain.localeCompare(b.domain));
  const blocking = all.filter(d => d.renderBlocking);
  const heavy = all.filter(d => (d.loafMs || 0) > LOAF_WARNING_MS);
  const corsLimitedAnalysis = sizeUnknownCount > 0;
  const listDomains = list => {
    const names = list.slice(0, MAX_LISTED_DOMAINS).map(d => d.domain);
    return names.join(", ") + (list.length > MAX_LISTED_DOMAINS ? ` and ${list.length - MAX_LISTED_DOMAINS} more` : "");
  };
  const issues = [];
  if (blocking.length > 0) issues.push({
    severity: "warning",
    message: `${blocking.length} third-party domain(s) serve render-blocking resources (${listDomains(blocking)}); load them async or defer, or self-host them`
  });
  heavy.slice(0, MAX_LISTED_DOMAINS).forEach(d => {
    issues.push({
      severity: "warning",
      message: `${d.domain} scripts take ${d.loafMs} ms of main-thread time in long animation frames (over ${LOAF_WARNING_MS} ms); defer, delay or remove them`
    });
  });
  if (loafUnattributed) issues.push({
    severity: "info",
    message: `${longFrames} long animation frame(s) took ${longFramesMs} ms, but no third-party script was attributed in them (Long Animation Frames only list scripts over 5 ms), so 0 ms per domain does not rule out third-party cost`
  });
  if (corsLimitedAnalysis) issues.push({
    severity: "info",
    message: `${sizeUnknownCount} third-party request(s) without Timing-Allow-Origin report zero sizes, so the transfer size is a lower bound`
  });
  if (all.length > 0) void 0; else void 0;
  if (!loafSupported) void 0;
  if (loafUnattributed) void 0;
  if (corsLimitedAnalysis) void 0;
  logOwnDomainsHint(all.length);
  return {
    script: "Third-Party-Impact-by-Domain",
    status: "ok",
    count: all.length,
    corsLimitedAnalysis: corsLimitedAnalysis,
    details: {
      thirdPartyRequests: thirdPartyRequests,
      thirdPartyBytes: thirdPartyBytes,
      thirdPartyLoafMs: thirdPartyLoafMs,
      longFrames: longFrames,
      unattributedLoafMs: unattributedLoafMs,
      firstPartyRequests: firstPartyRequests,
      blockingDomains: blocking.length,
      loafSupported: loafSupported,
      sizeUnknownCount: sizeUnknownCount
    },
    items: all.slice(0, MAX_ITEMS),
    issues: issues
  };
})();
