(() => {
  const OWN_DOMAINS = [];
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  const formatMs = ms => ms > 0 ? ms.toFixed(0) + "ms" : "-";
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
  const isFirstPartyUrl = url => {
    try {
      return isFirstParty(new URL(url).hostname);
    } catch {
      return true;
    }
  };
  const resourceTiming = new Map;
  performance.getEntriesByType("resource").forEach(r => {
    if (r.initiatorType === "script") resourceTiming.set(r.name, {
      size: r.transferSize || 0,
      sizeKnown: r.transferSize > 0 || r.encodedBodySize > 0 || r.decodedBodySize > 0,
      duration: r.duration,
      startTime: r.startTime
    });
  });
  const externalScripts = Array.from(document.querySelectorAll("script[src]"));
  Array.from(document.querySelectorAll("script:not([src])")).filter(s => s.innerHTML.trim().length > 0);
  const scripts = externalScripts.map(script => {
    const src = script.src;
    const timing = resourceTiming.get(src) || {};
    const inHead = script.closest("head") !== null;
    const isModule = script.type === "module";
    const isAsync = script.async;
    const isDefer = script.defer;
    let strategy = "blocking";
    if (isModule && isAsync) strategy = "async module"; else if (isModule) strategy = "module"; else if (isAsync) strategy = "async"; else if (isDefer) strategy = "defer";
    const isBlocking = strategy === "blocking";
    const firstParty = isFirstPartyUrl(src);
    return {
      src: src,
      shortSrc: src.split("/").pop()?.split("?")[0] || src,
      strategy: strategy,
      isBlocking: isBlocking,
      inHead: inHead,
      firstParty: firstParty,
      isModule: isModule,
      isAsync: isAsync,
      isDefer: isDefer,
      size: timing.size || 0,
      sizeKnown: !!timing.sizeKnown,
      duration: timing.duration || 0,
      startTime: timing.startTime || 0,
      element: script
    };
  });
  const blocking = scripts.filter(s => s.isBlocking);
  const blockingInHead = blocking.filter(s => s.inHead);
  const asyncScripts = scripts.filter(s => s.strategy === "async" || s.strategy === "async module");
  const deferScripts = scripts.filter(s => s.strategy === "defer");
  const moduleScripts = scripts.filter(s => s.strategy === "module");
  const thirdPartyBlocking = blocking.filter(s => !s.firstParty);
  const totalSize = scripts.reduce((sum, s) => sum + s.size, 0);
  blocking.reduce((sum, s) => sum + s.size, 0);
  let rating, ratingColor;
  if (blockingInHead.length === 0) {
    rating = "Good";
    ratingColor = "#22c55e";
  } else if (blockingInHead.length <= 2 && thirdPartyBlocking.length === 0) {
    rating = "Needs Review";
    ratingColor = "#f59e0b";
  } else {
    rating = "Needs Optimization";
    ratingColor = "#ef4444";
  }
  if (scripts.length > 0) {
    scripts.sort((a, b) => {
      if (a.isBlocking !== b.isBlocking) return a.isBlocking ? -1 : 1;
      return b.size - a.size;
    }).map(s => ({
      Script: s.shortSrc,
      Strategy: s.isBlocking ? `🔴 ${s.strategy}` : s.strategy,
      Location: s.inHead ? "head" : "body",
      Party: s.firstParty ? "1st" : "3rd",
      Size: formatBytes(s.size),
      Duration: formatMs(s.duration)
    }));
    scripts.sort((a, b) => a.startTime - b.startTime).forEach((s, i) => {
      s.isBlocking;
    });
  }
  const issues = [];
  if (blockingInHead.length > 0) issues.push({
    severity: "error",
    message: `${blockingInHead.length} blocking script(s) in <head>`,
    scripts: blockingInHead,
    fix: "Add 'defer' or 'async' attribute, or move to end of <body>"
  });
  if (thirdPartyBlocking.length > 0) issues.push({
    severity: "error",
    message: `${thirdPartyBlocking.length} third-party blocking script(s)`,
    scripts: thirdPartyBlocking,
    fix: "Add 'async' for independent scripts, or load dynamically"
  });
  const largeBlocking = blocking.filter(s => s.size > 50 * 1024);
  if (largeBlocking.length > 0) issues.push({
    severity: "warning",
    message: `${largeBlocking.length} large blocking script(s) (> 50 KB)`,
    scripts: largeBlocking,
    fix: "Split code, use defer, or lazy load"
  });
  const couldDefer = blocking.filter(s => {
    const bodyScripts = Array.from(document.body.querySelectorAll("script[src]"));
    const isLastInBody = bodyScripts.indexOf(s.element) >= bodyScripts.length - 3;
    return isLastInBody;
  });
  if (couldDefer.length > 0 && blocking.length > couldDefer.length) issues.push({
    severity: "info",
    message: `${blocking.length - couldDefer.length} blocking script(s) could potentially use defer`,
    fix: "Test with defer attribute to improve parsing performance"
  });
  if (issues.length > 0) {
    issues.forEach(issue => {
      issue.severity === "error" || issue.severity;
      if (issue.scripts) issue.scripts.forEach(s => {
      });
    });
  } else if (scripts.length > 0) {
  }
  const firstPartyScripts = scripts.filter(s => s.firstParty);
  const thirdPartyScripts = scripts.filter(s => !s.firstParty);
  if (thirdPartyScripts.length > 0) {
    const thirdPartyByHost = new Map;
    thirdPartyScripts.forEach(s => {
      try {
        const host = new URL(s.src).hostname;
        if (!thirdPartyByHost.has(host)) thirdPartyByHost.set(host, {
          count: 0,
          size: 0,
          blocking: 0
        });
        const data = thirdPartyByHost.get(host);
        data.count++;
        data.size += s.size;
        if (s.isBlocking) data.blocking++;
      } catch {}
    });
    Array.from(thirdPartyByHost.entries()).sort((a, b) => b[1].size - a[1].size).map(([host, data]) => ({
      Host: host,
      Scripts: data.count,
      Size: formatBytes(data.size),
      Blocking: data.blocking > 0 ? `⚠️ ${data.blocking}` : "0"
    }));
  }
  logOwnDomainsHint(thirdPartyScripts.length);
  const agentRating = blockingInHead.length === 0 ? "good" : blockingInHead.length <= 2 && thirdPartyBlocking.length === 0 ? "needs-improvement" : "poor";
  const MAX_ITEMS = 50;
  const rankedScripts = [ ...scripts ].sort((a, b) => Number(b.isBlocking) - Number(a.isBlocking) || Number(a.firstParty) - Number(b.firstParty) || b.size - a.size);
  return {
    script: "Script-Loading",
    status: "ok",
    count: scripts.length,
    corsLimitedAnalysis: scripts.some(s => !s.sizeKnown),
    rating: agentRating,
    details: {
      totalSizeBytes: totalSize,
      sizeUnknownCount: scripts.filter(s => !s.sizeKnown).length,
      byStrategy: {
        blocking: blocking.length,
        async: asyncScripts.length,
        defer: deferScripts.length,
        module: moduleScripts.length
      },
      byParty: {
        firstParty: firstPartyScripts.length,
        thirdParty: thirdPartyScripts.length
      },
      thirdPartyBlockingCount: thirdPartyBlocking.length
    },
    items: rankedScripts.slice(0, MAX_ITEMS).map(s => ({
      url: s.src,
      shortName: s.shortSrc,
      strategy: s.strategy,
      location: s.inHead ? "head" : "body",
      party: s.firstParty ? "first" : "third",
      sizeBytes: s.size,
      sizeKnown: s.sizeKnown,
      durationMs: Math.round(s.duration)
    })),
    issues: [ ...issues.map(i => ({
      severity: i.severity,
      message: i.message
    })), ...scripts.some(s => !s.sizeKnown) ? [ {
      severity: "info",
      message: `${scripts.filter(s => !s.sizeKnown).length} script(s) have an unknown size (missing Timing-Allow-Origin); total size is a lower bound`
    } ] : [] ]
  };
})();
