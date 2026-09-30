// Script Loading Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

  const formatMs = (ms) => (ms > 0 ? ms.toFixed(0) + "ms" : "-");

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

  // A script whose URL cannot be parsed counts as first party
  const isFirstPartyUrl = (url) => {
    try {
      return isFirstParty(new URL(url).hostname);
    } catch {
      return true;
    }
  };

  // Get resource timing data
  const resourceTiming = new Map();
  performance.getEntriesByType("resource").forEach((r) => {
    if (r.initiatorType === "script") {
      resourceTiming.set(r.name, {
        size: r.transferSize || 0,
        // Cross-origin scripts without Timing-Allow-Origin report every size as 0
        sizeKnown: r.transferSize > 0 || r.encodedBodySize > 0 || r.decodedBodySize > 0,
        duration: r.duration,
        startTime: r.startTime,
      });
    }
  });

  // Analyze all external scripts
  const externalScripts = Array.from(document.querySelectorAll("script[src]"));

  // Analyze inline scripts
  const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"))
    .filter((s) => s.innerHTML.trim().length > 0);

  const scripts = externalScripts.map((script) => {
    const src = script.src;
    const timing = resourceTiming.get(src) || {};
    const inHead = script.closest("head") !== null;
    const isModule = script.type === "module";
    const isAsync = script.async;
    const isDefer = script.defer;

    // Determine loading strategy
    let strategy = "blocking";
    if (isModule && isAsync) {
      strategy = "async module";
    } else if (isModule) {
      strategy = "module";
    } else if (isAsync) {
      strategy = "async";
    } else if (isDefer) {
      strategy = "defer";
    }

    const isBlocking = strategy === "blocking";
    const firstParty = isFirstPartyUrl(src);

    return {
      src,
      shortSrc: src.split("/").pop()?.split("?")[0] || src,
      strategy,
      isBlocking,
      inHead,
      firstParty,
      isModule,
      isAsync,
      isDefer,
      size: timing.size || 0,
      sizeKnown: !!timing.sizeKnown,
      duration: timing.duration || 0,
      startTime: timing.startTime || 0,
      element: script,
    };
  });

  // Categorize scripts
  const blocking = scripts.filter((s) => s.isBlocking);
  const blockingInHead = blocking.filter((s) => s.inHead);
  const asyncScripts = scripts.filter((s) => s.strategy === "async" || s.strategy === "async module");
  const deferScripts = scripts.filter((s) => s.strategy === "defer");
  const moduleScripts = scripts.filter((s) => s.strategy === "module");
  const thirdPartyBlocking = blocking.filter((s) => !s.firstParty);

  // Calculate totals
  const totalSize = scripts.reduce((sum, s) => sum + s.size, 0);
  const blockingSize = blocking.reduce((sum, s) => sum + s.size, 0);

  // Rating
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

  // Display results
  console.group("%c📜 Script Loading Analysis", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total external scripts: ${scripts.length}`);
  console.log(`   Total inline scripts: ${inlineScripts.length}`);
  console.log(`   Total size: ${formatBytes(totalSize)}`);
  console.log("");
  console.log("%cBy loading strategy:", "font-weight: bold;");
  console.log(`   🔴 Blocking: ${blocking.length} (${formatBytes(blockingSize)})`);
  console.log(`   ⚡ Async: ${asyncScripts.length}`);
  console.log(`   📋 Defer: ${deferScripts.length}`);
  console.log(`   📦 Module: ${moduleScripts.length}`);
  console.log("");
  console.log(`   Rating: %c${rating}`, `color: ${ratingColor}; font-weight: bold;`);

  // Detailed table
  if (scripts.length > 0) {
    console.log("");
    console.group("%c📊 External Scripts", "color: #3b82f6; font-weight: bold;");

    const tableData = scripts
      .sort((a, b) => {
        // Sort: blocking first, then by size
        if (a.isBlocking !== b.isBlocking) return a.isBlocking ? -1 : 1;
        return b.size - a.size;
      })
      .map((s) => ({
        Script: s.shortSrc,
        Strategy: s.isBlocking ? `🔴 ${s.strategy}` : s.strategy,
        Location: s.inHead ? "head" : "body",
        Party: s.firstParty ? "1st" : "3rd",
        Size: formatBytes(s.size),
        Duration: formatMs(s.duration),
      }));

    console.table(tableData);

    // Elements for inspection
    console.log("");
    console.log("%c🔎 Elements (sorted by load order):", "font-weight: bold;");
    scripts
      .sort((a, b) => a.startTime - b.startTime)
      .forEach((s, i) => {
        const marker = s.isBlocking ? "🔴" : "✅";
        console.log(`${i + 1}. ${marker} ${s.shortSrc}`, s.element);
      });

    console.groupEnd();
  }

  // Issues
  const issues = [];

  if (blockingInHead.length > 0) {
    issues.push({
      severity: "error",
      message: `${blockingInHead.length} blocking script(s) in <head>`,
      scripts: blockingInHead,
      fix: "Add 'defer' or 'async' attribute, or move to end of <body>",
    });
  }

  if (thirdPartyBlocking.length > 0) {
    issues.push({
      severity: "error",
      message: `${thirdPartyBlocking.length} third-party blocking script(s)`,
      scripts: thirdPartyBlocking,
      fix: "Add 'async' for independent scripts, or load dynamically",
    });
  }

  const largeBlocking = blocking.filter((s) => s.size > 50 * 1024);
  if (largeBlocking.length > 0) {
    issues.push({
      severity: "warning",
      message: `${largeBlocking.length} large blocking script(s) (> 50 KB)`,
      scripts: largeBlocking,
      fix: "Split code, use defer, or lazy load",
    });
  }

  // Scripts that could be deferred
  const couldDefer = blocking.filter((s) => {
    // Scripts at end of body could likely use defer
    const bodyScripts = Array.from(document.body.querySelectorAll("script[src]"));
    const isLastInBody = bodyScripts.indexOf(s.element) >= bodyScripts.length - 3;
    return isLastInBody;
  });

  if (couldDefer.length > 0 && blocking.length > couldDefer.length) {
    issues.push({
      severity: "info",
      message: `${blocking.length - couldDefer.length} blocking script(s) could potentially use defer`,
      fix: "Test with defer attribute to improve parsing performance",
    });
  }

  if (issues.length > 0) {
    console.log("");
    console.group("%c⚠️ Issues Found", "color: #ef4444; font-weight: bold;");

    issues.forEach((issue) => {
      const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "💡";
      console.log("");
      console.log(`%c${icon} ${issue.message}`, "font-weight: bold;");
      if (issue.scripts) {
        issue.scripts.forEach((s) => {
          console.log(`   • ${s.shortSrc} (${formatBytes(s.size)})`);
        });
      }
      console.log(`   → ${issue.fix}`);
    });

    console.groupEnd();
  } else if (scripts.length > 0) {
    console.log("");
    console.log(
      "%c✅ All scripts use non-blocking loading strategies!",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // First/Third party breakdown
  const firstPartyScripts = scripts.filter((s) => s.firstParty);
  const thirdPartyScripts = scripts.filter((s) => !s.firstParty);

  if (thirdPartyScripts.length > 0) {
    console.log("");
    console.group("%c🌐 Third-Party Scripts", "color: #8b5cf6; font-weight: bold;");

    const thirdPartyByHost = new Map();
    thirdPartyScripts.forEach((s) => {
      try {
        const host = new URL(s.src).hostname;
        if (!thirdPartyByHost.has(host)) {
          thirdPartyByHost.set(host, { count: 0, size: 0, blocking: 0 });
        }
        const data = thirdPartyByHost.get(host);
        data.count++;
        data.size += s.size;
        if (s.isBlocking) data.blocking++;
      } catch {}
    });

    const hostTable = Array.from(thirdPartyByHost.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .map(([host, data]) => ({
        Host: host,
        Scripts: data.count,
        Size: formatBytes(data.size),
        Blocking: data.blocking > 0 ? `⚠️ ${data.blocking}` : "0",
      }));

    console.table(hostTable);
    console.groupEnd();
  }

  // Best practices (defined here so firstPartyScripts/thirdPartyScripts are in scope for return)
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%cFor most scripts (need DOM, run in order):", "font-weight: bold;");
  console.log('%c<script src="app.js" defer></script>', "font-family: monospace; color: #22c55e;");
  console.log("");
  console.log("%cFor independent scripts (analytics, ads):", "font-weight: bold;");
  console.log('%c<script src="analytics.js" async></script>', "font-family: monospace; color: #22c55e;");
  console.log("");
  console.log("%cFor ES modules:", "font-weight: bold;");
  console.log('%c<script type="module" src="app.mjs"></script>', "font-family: monospace; color: #22c55e;");
  console.log("");
  console.log("%cFor critical inline scripts:", "font-weight: bold;");
  console.log('%c<script>/* Only essential initialization */</script>', "font-family: monospace; color: #22c55e;");
  console.groupEnd();

  console.groupEnd();

  const agentRating = blockingInHead.length === 0 ? "good" :
    (blockingInHead.length <= 2 && thirdPartyBlocking.length === 0) ? "needs-improvement" : "poor";
  // The list keeps the 50 scripts to look at first (render-blocking, then third-party, then the largest); count and details cover all of them
  const MAX_ITEMS = 50;
  const rankedScripts = [...scripts].sort(
    (a, b) =>
      Number(b.isBlocking) - Number(a.isBlocking) ||
      Number(a.firstParty) - Number(b.firstParty) ||
      b.size - a.size
  );
  return {
    script: "Script-Loading",
    status: "ok",
    count: scripts.length,
    corsLimitedAnalysis: scripts.some((s) => !s.sizeKnown),
    rating: agentRating,
    details: {
      totalSizeBytes: totalSize,
      sizeUnknownCount: scripts.filter((s) => !s.sizeKnown).length,
      byStrategy: {
        blocking: blocking.length,
        async: asyncScripts.length,
        defer: deferScripts.length,
        module: moduleScripts.length,
      },
      byParty: {
        firstParty: firstPartyScripts.length,
        thirdParty: thirdPartyScripts.length,
      },
      thirdPartyBlockingCount: thirdPartyBlocking.length,
    },
    items: rankedScripts.slice(0, MAX_ITEMS).map((s) => ({
      url: s.src,
      shortName: s.shortSrc,
      strategy: s.strategy,
      location: s.inHead ? "head" : "body",
      party: s.firstParty ? "first" : "third",
      sizeBytes: s.size,
      sizeKnown: s.sizeKnown,
      durationMs: Math.round(s.duration),
    })),
    issues: [
      ...issues.map((i) => ({ severity: i.severity, message: i.message })),
      ...(scripts.some((s) => !s.sizeKnown)
        ? [{ severity: "info", message: `${scripts.filter((s) => !s.sizeKnown).length} script(s) have an unknown size (missing Timing-Allow-Origin); total size is a lower bound` }]
        : []),
    ],
  };
})();
