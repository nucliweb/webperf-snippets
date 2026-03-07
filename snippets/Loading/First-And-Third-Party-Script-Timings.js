// First and Third Party Script Timings Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  // Auto-detect first-party by root domain
  function getRootDomain(hostname) {
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const sld = parts[parts.length - 2];
      if (sld.length <= 3 && ["co", "com", "org", "net", "gov", "edu"].includes(sld)) {
        return parts.slice(-3).join(".");
      }
      return parts.slice(-2).join(".");
    }
    return hostname;
  }

  const currentRootDomain = getRootDomain(location.hostname);

  function isFirstParty(hostname) {
    return getRootDomain(hostname) === currentRootDomain;
  }

  // Gather script timing data
  const scripts = performance
    .getEntriesByType("resource")
    .filter((r) => r.initiatorType === "script")
    .map((r) => {
      const url = new URL(r.name);
      const firstParty = isFirstParty(url.hostname);

      // Check if timing data is available (CORS)
      const hasTiming = r.requestStart > 0;

      // Calculate timing phases
      const timings = {
        dns: r.domainLookupEnd - r.domainLookupStart,
        tcp: r.connectEnd - r.connectStart,
        tls: r.secureConnectionStart > 0 ? r.connectEnd - r.secureConnectionStart : 0,
        request: r.responseStart - r.requestStart,
        response: r.responseEnd - r.responseStart,
        total: r.responseEnd - r.startTime,
      };

      // Adjust TCP to exclude TLS time
      if (r.secureConnectionStart > 0) {
        timings.tcp = r.secureConnectionStart - r.connectStart;
      }

      return {
        name: r.name,
        shortName: url.pathname.split("/").pop() || url.hostname,
        host: url.hostname,
        firstParty,
        hasTiming,
        size: r.transferSize || 0,
        ...timings,
      };
    });

  const firstParty = scripts.filter((s) => s.firstParty);
  const thirdParty = scripts.filter((s) => !s.firstParty);

  // Calculate aggregate metrics
  function calcStats(list) {
    const withTiming = list.filter((s) => s.hasTiming);
    const phases = ["dns", "tcp", "tls", "request", "response", "total"];

    const stats = {};
    phases.forEach((phase) => {
      const values = withTiming.map((s) => s[phase]).filter((v) => v > 0);
      if (values.length > 0) {
        stats[phase] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          max: Math.max(...values),
          total: values.reduce((a, b) => a + b, 0),
        };
      } else {
        stats[phase] = { avg: 0, max: 0, total: 0 };
      }
    });

    return {
      count: list.length,
      withTiming: withTiming.length,
      withoutTiming: list.length - withTiming.length,
      stats,
    };
  }

  const firstStats = calcStats(firstParty);
  const thirdStats = calcStats(thirdParty);

  // Format helpers
  const formatMs = (ms) => (ms > 0 ? ms.toFixed(1) + "ms" : "-");
  const formatBar = (value, max) => {
    if (value <= 0 || max <= 0) return "";
    const width = Math.min(Math.round((value / max) * 15), 15);
    return "█".repeat(width) + "░".repeat(15 - width);
  };

  // Display results
  console.group("%c⏱️ Script Timing Analysis", "font-weight: bold; font-size: 14px;");

  // Summary comparison
  console.log("");
  console.log("%cSummary (averages):", "font-weight: bold;");

  const phases = [
    { key: "dns", name: "DNS Lookup", icon: "🔍" },
    { key: "tcp", name: "TCP Connection", icon: "🔌" },
    { key: "tls", name: "TLS/SSL", icon: "🔒" },
    { key: "request", name: "Request (TTFB)", icon: "📤" },
    { key: "response", name: "Response", icon: "📥" },
    { key: "total", name: "Total", icon: "⏱️" },
  ];

  console.log("");
  console.log("                        First-Party    Third-Party");
  console.log("                        ───────────    ───────────");

  phases.forEach(({ key, name, icon }) => {
    const fp = formatMs(firstStats.stats[key]?.avg || 0).padStart(10);
    const tp = formatMs(thirdStats.stats[key]?.avg || 0).padStart(10);
    console.log(`${icon} ${name.padEnd(18)} ${fp}       ${tp}`);
  });

  // First-party details
  console.log("");
  console.group(`%c🏠 First-Party Scripts (${firstParty.length})`, "color: #22c55e; font-weight: bold;");

  if (firstParty.length === 0) {
    console.log("No first-party scripts found.");
  } else {
    if (firstStats.withoutTiming > 0) {
      console.log(`%c⚠️ ${firstStats.withoutTiming} script(s) have no detailed timing (cached or same-origin)`, "color: #f59e0b;");
    }

    const maxTotal = Math.max(...firstParty.map((s) => s.total));

    const tableData = firstParty
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
      .map((s) => ({
        Script: s.shortName,
        DNS: formatMs(s.dns),
        TCP: formatMs(s.tcp),
        TLS: formatMs(s.tls),
        Request: formatMs(s.request),
        Response: formatMs(s.response),
        Total: formatMs(s.total),
        "": formatBar(s.total, maxTotal),
      }));

    console.table(tableData);

    if (firstParty.length > 15) {
      console.log(`... and ${firstParty.length - 15} more scripts`);
    }
  }
  console.groupEnd();

  // Third-party details
  console.log("");
  console.group(`%c🌐 Third-Party Scripts (${thirdParty.length})`, "color: #ef4444; font-weight: bold;");

  if (thirdParty.length === 0) {
    console.log("%c✅ No third-party scripts!", "color: #22c55e; font-weight: bold;");
  } else {
    const corsRestricted = thirdStats.withoutTiming;
    if (corsRestricted > 0) {
      console.log(`%c⚠️ ${corsRestricted} script(s) restricted by CORS (no Timing-Allow-Origin header)`, "color: #f59e0b;");
      console.log("   Only total duration available for these scripts.");
      console.log("");
    }

    const maxTotal = Math.max(...thirdParty.map((s) => s.total));

    const tableData = thirdParty
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
      .map((s) => ({
        Script: s.shortName,
        Host: s.host.length > 25 ? s.host.slice(0, 22) + "..." : s.host,
        DNS: formatMs(s.dns),
        TCP: formatMs(s.tcp),
        TLS: formatMs(s.tls),
        Request: formatMs(s.request),
        Response: formatMs(s.response),
        Total: formatMs(s.total),
        "": formatBar(s.total, maxTotal),
      }));

    console.table(tableData);

    if (thirdParty.length > 15) {
      console.log(`... and ${thirdParty.length - 15} more scripts`);
    }
  }
  console.groupEnd();

  // Identify slow scripts
  const slowThreshold = 500; // ms
  const slowScripts = scripts.filter((s) => s.total > slowThreshold);

  if (slowScripts.length > 0) {
    console.log("");
    console.group(`%c🐌 Slow Scripts (>${slowThreshold}ms)`, "color: #ef4444; font-weight: bold;");

    slowScripts
      .sort((a, b) => b.total - a.total)
      .forEach((s) => {
        const party = s.firstParty ? "1st" : "3rd";
        const phases = [];
        if (s.dns > 50) phases.push(`DNS: ${formatMs(s.dns)}`);
        if (s.tcp > 50) phases.push(`TCP: ${formatMs(s.tcp)}`);
        if (s.tls > 50) phases.push(`TLS: ${formatMs(s.tls)}`);
        if (s.request > 100) phases.push(`Request: ${formatMs(s.request)}`);
        if (s.response > 200) phases.push(`Response: ${formatMs(s.response)}`);

        console.log(`${party} ${formatMs(s.total).padStart(8)} - ${s.shortName}`);
        if (phases.length > 0 && s.hasTiming) {
          console.log(`%c         Slow phases: ${phases.join(", ")}`, "color: #666;");
        }
      });

    console.groupEnd();
  }

  // Recommendations
  const hasSlowDns = scripts.some((s) => s.dns > 100);
  const hasSlowTcp = scripts.some((s) => s.tcp > 100);
  const hasSlowRequest = scripts.some((s) => s.request > 200);
  const hasCorsIssues = thirdStats.withoutTiming > 0;

  if (hasSlowDns || hasSlowTcp || hasSlowRequest || hasCorsIssues) {
    console.log("");
    console.group("%c📝 Recommendations", "color: #3b82f6; font-weight: bold;");

    if (hasSlowDns) {
      console.log("");
      console.log("%c🔍 Slow DNS lookups detected:", "font-weight: bold;");
      console.log("   • Use <link rel='dns-prefetch'> for third-party domains");
      console.log("   • Consider using a faster DNS provider");
    }

    if (hasSlowTcp) {
      console.log("");
      console.log("%c🔌 Slow TCP connections detected:", "font-weight: bold;");
      console.log("   • Use <link rel='preconnect'> for critical third-party origins");
      console.log("   • Enable HTTP/2 or HTTP/3 for multiplexing");
    }

    if (hasSlowRequest) {
      console.log("");
      console.log("%c📤 Slow server response times detected:", "font-weight: bold;");
      console.log("   • Optimize server processing");
      console.log("   • Use a CDN closer to users");
      console.log("   • Consider self-hosting critical third-party scripts");
    }

    if (hasCorsIssues) {
      console.log("");
      console.log("%c🔒 CORS-restricted timing data:", "font-weight: bold;");
      console.log("   • Third-party servers need Timing-Allow-Origin header");
      console.log("   • Contact vendors to enable resource timing");
      console.log("   • Self-host scripts to get full timing data");
    }

    console.groupEnd();
  }

  console.groupEnd();

  return {
    script: "First-And-Third-Party-Script-Timings",
    status: "ok",
    count: scripts.length,
    details: {
      firstPartyCount: firstParty.length,
      thirdPartyCount: thirdParty.length,
      corsRestrictedCount: thirdStats.withoutTiming,
      slowScriptCount: slowScripts.length,
      firstPartyAvgTotalMs: Math.round(firstStats.stats.total?.avg || 0),
      thirdPartyAvgTotalMs: Math.round(thirdStats.stats.total?.avg || 0),
    },
    items: scripts.map(s => ({ shortName: s.shortName, host: s.host, firstParty: s.firstParty, totalMs: Math.round(s.total), dnsMs: Math.round(s.dns), tcpMs: Math.round(s.tcp), requestMs: Math.round(s.request), responseMs: Math.round(s.response), hasTiming: s.hasTiming })),
    issues: [
      ...(slowScripts.length > 0 ? [{ severity: "warning", message: `${slowScripts.length} script(s) take over ${slowThreshold}ms to load` }] : []),
      ...(hasSlowDns ? [{ severity: "warning", message: "Slow DNS lookups detected (>100ms). Add dns-prefetch or preconnect." }] : []),
      ...(hasSlowTcp ? [{ severity: "warning", message: "Slow TCP connections detected (>100ms). Add preconnect for critical origins." }] : []),
      ...(hasSlowRequest ? [{ severity: "warning", message: "Slow server response times detected (>200ms). Consider CDN or self-hosting." }] : []),
    ],
  };
})();
