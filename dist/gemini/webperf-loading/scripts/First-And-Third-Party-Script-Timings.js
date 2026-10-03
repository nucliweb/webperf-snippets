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
  const scripts = performance.getEntriesByType("resource").filter(r => r.initiatorType === "script").map(r => {
    const url = new URL(r.name);
    const firstParty = isFirstParty(url.hostname);
    const hasTiming = r.requestStart > 0;
    const timings = {
      dns: r.domainLookupEnd - r.domainLookupStart,
      tcp: r.connectEnd - r.connectStart,
      tls: r.secureConnectionStart > 0 ? r.connectEnd - r.secureConnectionStart : 0,
      request: r.responseStart - r.requestStart,
      response: r.responseEnd - r.responseStart,
      total: r.responseEnd - r.startTime
    };
    if (r.secureConnectionStart > 0) timings.tcp = r.secureConnectionStart - r.connectStart;
    return {
      name: r.name,
      shortName: url.pathname.split("/").pop() || url.hostname,
      host: url.hostname,
      firstParty: firstParty,
      hasTiming: hasTiming,
      size: r.transferSize || 0,
      ...timings
    };
  });
  const firstParty = scripts.filter(s => s.firstParty);
  const thirdParty = scripts.filter(s => !s.firstParty);
  function calcStats(list) {
    const withTiming = list.filter(s => s.hasTiming);
    const phases = [ "dns", "tcp", "tls", "request", "response", "total" ];
    const stats = {};
    phases.forEach(phase => {
      const values = withTiming.map(s => s[phase]).filter(v => v > 0);
      if (values.length > 0) stats[phase] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
        total: values.reduce((a, b) => a + b, 0)
      }; else stats[phase] = {
        avg: 0,
        max: 0,
        total: 0
      };
    });
    return {
      count: list.length,
      withTiming: withTiming.length,
      withoutTiming: list.length - withTiming.length,
      stats: stats
    };
  }
  const firstStats = calcStats(firstParty);
  const thirdStats = calcStats(thirdParty);
  const formatMs = ms => ms > 0 ? ms.toFixed(1) + "ms" : "-";
  const formatBar = (value, max) => {
    if (value <= 0 || max <= 0) return "";
    const width = Math.min(Math.round(value / max * 15), 15);
    return "█".repeat(width) + "░".repeat(15 - width);
  };
  const phases = [ {
    key: "dns",
    name: "DNS Lookup",
    icon: "🔍"
  }, {
    key: "tcp",
    name: "TCP Connection",
    icon: "🔌"
  }, {
    key: "tls",
    name: "TLS/SSL",
    icon: "🔒"
  }, {
    key: "request",
    name: "Request (TTFB)",
    icon: "📤"
  }, {
    key: "response",
    name: "Response",
    icon: "📥"
  }, {
    key: "total",
    name: "Total",
    icon: "⏱️"
  } ];
  phases.forEach(({key: key, name: name, icon: icon}) => {
    formatMs(firstStats.stats[key]?.avg || 0).padStart(10);
    formatMs(thirdStats.stats[key]?.avg || 0).padStart(10);
  });
  if (firstParty.length === 0) void 0; else {
    if (firstStats.withoutTiming > 0) void 0;
    const maxTotal = Math.max(...firstParty.map(s => s.total));
    firstParty.sort((a, b) => b.total - a.total).slice(0, 15).map(s => ({
      Script: s.shortName,
      DNS: formatMs(s.dns),
      TCP: formatMs(s.tcp),
      TLS: formatMs(s.tls),
      Request: formatMs(s.request),
      Response: formatMs(s.response),
      Total: formatMs(s.total),
      "": formatBar(s.total, maxTotal)
    }));
    if (firstParty.length > 15) void 0;
  }
  if (thirdParty.length === 0) void 0; else {
    const corsRestricted = thirdStats.withoutTiming;
    if (corsRestricted > 0) {
    }
    const maxTotal = Math.max(...thirdParty.map(s => s.total));
    thirdParty.sort((a, b) => b.total - a.total).slice(0, 15).map(s => ({
      Script: s.shortName,
      Host: s.host.length > 25 ? s.host.slice(0, 22) + "..." : s.host,
      DNS: formatMs(s.dns),
      TCP: formatMs(s.tcp),
      TLS: formatMs(s.tls),
      Request: formatMs(s.request),
      Response: formatMs(s.response),
      Total: formatMs(s.total),
      "": formatBar(s.total, maxTotal)
    }));
    if (thirdParty.length > 15) void 0;
  }
  const slowThreshold = 500;
  const slowScripts = scripts.filter(s => s.total > slowThreshold);
  if (slowScripts.length > 0) {
    slowScripts.sort((a, b) => b.total - a.total).forEach(s => {
      s.firstParty;
      const phases = [];
      if (s.dns > 50) phases.push(`DNS: ${formatMs(s.dns)}`);
      if (s.tcp > 50) phases.push(`TCP: ${formatMs(s.tcp)}`);
      if (s.tls > 50) phases.push(`TLS: ${formatMs(s.tls)}`);
      if (s.request > 100) phases.push(`Request: ${formatMs(s.request)}`);
      if (s.response > 200) phases.push(`Response: ${formatMs(s.response)}`);
      if (phases.length > 0 && s.hasTiming) void 0;
    });
  }
  const hasSlowDns = scripts.some(s => s.dns > 100);
  const hasSlowTcp = scripts.some(s => s.tcp > 100);
  const hasSlowRequest = scripts.some(s => s.request > 200);
  const hasCorsIssues = thirdStats.withoutTiming > 0;
  if (hasSlowDns || hasSlowTcp || hasSlowRequest || hasCorsIssues) {
    if (hasSlowDns) {
    }
    if (hasSlowTcp) {
    }
    if (hasSlowRequest) {
    }
    if (hasCorsIssues) {
    }
  }
  logOwnDomainsHint(thirdParty.length);
  const MAX_ITEMS = 50;
  const slowestScripts = [ ...scripts ].sort((a, b) => b.total - a.total);
  return {
    script: "First-And-Third-Party-Script-Timings",
    status: "ok",
    count: scripts.length,
    corsLimitedAnalysis: thirdStats.withoutTiming > 0,
    details: {
      firstPartyCount: firstParty.length,
      thirdPartyCount: thirdParty.length,
      corsRestrictedCount: thirdStats.withoutTiming,
      slowScriptCount: slowScripts.length,
      firstPartyAvgTotalMs: Math.round(firstStats.stats.total?.avg || 0),
      thirdPartyAvgTotalMs: Math.round(thirdStats.stats.total?.avg || 0)
    },
    items: slowestScripts.slice(0, MAX_ITEMS).map(s => ({
      shortName: s.shortName,
      host: s.host,
      firstParty: s.firstParty,
      totalMs: Math.round(s.total),
      dnsMs: Math.round(s.dns),
      tcpMs: Math.round(s.tcp),
      requestMs: Math.round(s.request),
      responseMs: Math.round(s.response),
      hasTiming: s.hasTiming
    })),
    issues: [ ...slowScripts.length > 0 ? [ {
      severity: "warning",
      message: `${slowScripts.length} script(s) take over ${slowThreshold}ms to load`
    } ] : [], ...hasSlowDns ? [ {
      severity: "warning",
      message: "Slow DNS lookups detected (>100ms). Add dns-prefetch or preconnect."
    } ] : [], ...hasSlowTcp ? [ {
      severity: "warning",
      message: "Slow TCP connections detected (>100ms). Add preconnect for critical origins."
    } ] : [], ...hasSlowRequest ? [ {
      severity: "warning",
      message: "Slow server response times detected (>200ms). Consider CDN or self-hosting."
    } ] : [] ]
  };
})();
