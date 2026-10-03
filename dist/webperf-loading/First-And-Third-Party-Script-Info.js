(() => {
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
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  const scripts = performance.getEntriesByType("resource").filter(r => r.initiatorType === "script").map(r => {
    const url = new URL(r.name);
    const firstParty = isFirstParty(url.hostname);
    return {
      name: r.name,
      shortName: url.pathname.split("/").pop() || url.pathname,
      host: url.hostname,
      firstParty: firstParty,
      duration: r.duration,
      transferSize: r.transferSize || 0,
      sizeKnown: r.transferSize > 0 || r.encodedBodySize > 0 || r.decodedBodySize > 0,
      startTime: r.startTime,
      responseEnd: r.responseEnd,
      renderBlocking: r.renderBlockingStatus === "blocking"
    };
  });
  const firstParty = scripts.filter(s => s.firstParty);
  const thirdParty = scripts.filter(s => !s.firstParty);
  const calcMetrics = list => ({
    count: list.length,
    totalSize: list.reduce((sum, s) => sum + s.transferSize, 0),
    totalDuration: list.reduce((sum, s) => sum + s.duration, 0),
    blocking: list.filter(s => s.renderBlocking).length,
    hosts: [ ...new Set(list.map(s => s.host)) ]
  });
  const firstMetrics = calcMetrics(firstParty);
  const thirdMetrics = calcMetrics(thirdParty);
  const totalScripts = scripts.length;
  const thirdPartyPct = totalScripts > 0 ? (thirdParty.length / totalScripts * 100).toFixed(0) : 0;
  if (thirdParty.length > firstParty.length) void 0;
  if (firstParty.length === 0) void 0; else {
    firstParty.sort((a, b) => b.transferSize - a.transferSize).map(s => ({
      Script: s.shortName,
      Size: formatBytes(s.transferSize),
      Duration: s.duration.toFixed(0) + "ms",
      Blocking: s.renderBlocking ? "⚠️ Yes" : "No",
      Host: s.host
    }));
  }
  if (thirdParty.length === 0) void 0; else {
    const byHost = thirdParty.reduce((acc, s) => {
      if (!acc[s.host]) acc[s.host] = {
        count: 0,
        size: 0,
        blocking: 0
      };
      acc[s.host].count++;
      acc[s.host].size += s.transferSize;
      if (s.renderBlocking) acc[s.host].blocking++;
      return acc;
    }, {});
    Object.entries(byHost).sort((a, b) => b[1].size - a[1].size).forEach(([host, data]) => {
      data.blocking;
    });
    thirdParty.sort((a, b) => b.transferSize - a.transferSize).map(s => ({
      Script: s.shortName,
      Host: s.host,
      Size: formatBytes(s.transferSize),
      Duration: s.duration.toFixed(0) + "ms",
      Blocking: s.renderBlocking ? "⚠️ Yes" : "No"
    }));
  }
  if (thirdParty.length > 0) {
    if (thirdMetrics.blocking > 0) {
    }
    if (thirdMetrics.hosts.length > 3) {
    }
    if (thirdMetrics.totalSize > 100 * 1024) {
    }
  }
  logOwnDomainsHint(thirdParty.length);
  const MAX_ITEMS = 50;
  const rankedScripts = [ ...scripts ].sort((a, b) => Number(b.renderBlocking) - Number(a.renderBlocking) || Number(a.firstParty) - Number(b.firstParty) || b.transferSize - a.transferSize);
  return {
    script: "First-And-Third-Party-Script-Info",
    status: "ok",
    count: totalScripts,
    corsLimitedAnalysis: scripts.some(s => !s.sizeKnown),
    details: {
      firstPartyCount: firstParty.length,
      thirdPartyCount: thirdParty.length,
      thirdPartyPercent: Number(thirdPartyPct),
      firstPartySizeBytes: firstMetrics.totalSize,
      thirdPartySizeBytes: thirdMetrics.totalSize,
      thirdPartyBlockingCount: thirdMetrics.blocking,
      thirdPartyHostCount: thirdMetrics.hosts.length,
      sizeUnknownCount: scripts.filter(s => !s.sizeKnown).length
    },
    items: rankedScripts.slice(0, MAX_ITEMS).map(s => ({
      shortName: s.shortName,
      host: s.host,
      firstParty: s.firstParty,
      transferBytes: s.transferSize,
      sizeKnown: s.sizeKnown,
      durationMs: Math.round(s.duration),
      renderBlocking: s.renderBlocking
    })),
    issues: [ ...scripts.some(s => !s.sizeKnown) ? [ {
      severity: "info",
      message: `${scripts.filter(s => !s.sizeKnown).length} script(s) have an unknown size (missing Timing-Allow-Origin); size totals are a lower bound`
    } ] : [], ...thirdMetrics.blocking > 0 ? [ {
      severity: "error",
      message: `${thirdMetrics.blocking} render-blocking third-party script(s)`
    } ] : [], ...thirdMetrics.hosts.length > 3 ? [ {
      severity: "warning",
      message: `${thirdMetrics.hosts.length} different third-party hosts require separate DNS lookups`
    } ] : [], ...thirdMetrics.totalSize > 100 * 1024 ? [ {
      severity: "warning",
      message: `Third-party scripts total ${Math.round(thirdMetrics.totalSize / 1024)} KB`
    } ] : [] ]
  };
})();
