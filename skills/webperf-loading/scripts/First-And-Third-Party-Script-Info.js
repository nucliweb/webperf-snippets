// First and Third Party Script Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  // Auto-detect first-party: same root domain (handles subdomains)
  function getRootDomain(hostname) {
    const parts = hostname.split(".");
    // Handle cases like co.uk, com.au, etc.
    if (parts.length > 2) {
      // Simple heuristic: if second-to-last part is short (co, com, org, net), take 3 parts
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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "N/A";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  }

  // Gather script data
  const scripts = performance
    .getEntriesByType("resource")
    .filter((r) => r.initiatorType === "script")
    .map((r) => {
      const url = new URL(r.name);
      const firstParty = isFirstParty(url.hostname);

      return {
        name: r.name,
        shortName: url.pathname.split("/").pop() || url.pathname,
        host: url.hostname,
        firstParty,
        duration: r.duration,
        transferSize: r.transferSize || 0,
        startTime: r.startTime,
        responseEnd: r.responseEnd,
        renderBlocking: r.renderBlockingStatus === "blocking",
      };
    });

  const firstParty = scripts.filter((s) => s.firstParty);
  const thirdParty = scripts.filter((s) => !s.firstParty);

  // Calculate metrics
  const calcMetrics = (list) => ({
    count: list.length,
    totalSize: list.reduce((sum, s) => sum + s.transferSize, 0),
    totalDuration: list.reduce((sum, s) => sum + s.duration, 0),
    blocking: list.filter((s) => s.renderBlocking).length,
    hosts: [...new Set(list.map((s) => s.host))],
  });

  const firstMetrics = calcMetrics(firstParty);
  const thirdMetrics = calcMetrics(thirdParty);
  const totalScripts = scripts.length;
  const thirdPartyPct = totalScripts > 0 ? ((thirdParty.length / totalScripts) * 100).toFixed(0) : 0;

  // Display results
  console.group("%c📊 Script Analysis: First vs Third Party", "font-weight: bold; font-size: 14px;");

  // Overall summary
  console.log("");
  console.log("%cOverall Summary:", "font-weight: bold;");
  console.log(`   Total scripts: ${totalScripts}`);
  console.log(`   First-party: ${firstParty.length} (${100 - thirdPartyPct}%)`);
  console.log(`   Third-party: ${thirdParty.length} (${thirdPartyPct}%)`);

  if (thirdParty.length > firstParty.length) {
    console.log(`%c   ⚠️ More third-party scripts than first-party!`, "color: #f59e0b;");
  }

  // First Party Section
  console.log("");
  console.group(`%c🏠 First-Party Scripts (${firstParty.length})`, "color: #22c55e; font-weight: bold;");

  if (firstParty.length === 0) {
    console.log("No first-party scripts found.");
  } else {
    console.log(`   Total size: ${formatBytes(firstMetrics.totalSize)}`);
    console.log(`   Render-blocking: ${firstMetrics.blocking}`);
    console.log("");

    const firstTable = firstParty
      .sort((a, b) => b.transferSize - a.transferSize)
      .map((s) => ({
        Script: s.shortName,
        Size: formatBytes(s.transferSize),
        Duration: s.duration.toFixed(0) + "ms",
        Blocking: s.renderBlocking ? "⚠️ Yes" : "No",
        Host: s.host,
      }));
    console.table(firstTable);
  }
  console.groupEnd();

  // Third Party Section
  console.log("");
  console.group(`%c🌐 Third-Party Scripts (${thirdParty.length})`, "color: #ef4444; font-weight: bold;");

  if (thirdParty.length === 0) {
    console.log(
      "%c✅ No third-party scripts found!",
      "color: #22c55e; font-weight: bold;"
    );
  } else {
    console.log(`   Total size: ${formatBytes(thirdMetrics.totalSize)}`);
    console.log(`   Render-blocking: ${thirdMetrics.blocking}`);
    console.log(`   Unique hosts: ${thirdMetrics.hosts.length}`);
    console.log("");

    // Group by host
    console.log("%c   By host:", "font-weight: bold;");
    const byHost = thirdParty.reduce((acc, s) => {
      if (!acc[s.host]) acc[s.host] = { count: 0, size: 0, blocking: 0 };
      acc[s.host].count++;
      acc[s.host].size += s.transferSize;
      if (s.renderBlocking) acc[s.host].blocking++;
      return acc;
    }, {});

    Object.entries(byHost)
      .sort((a, b) => b[1].size - a[1].size)
      .forEach(([host, data]) => {
        const blockingMark = data.blocking > 0 ? " ⚠️" : "";
        console.log(`      ${host}: ${data.count} script(s), ${formatBytes(data.size)}${blockingMark}`);
      });

    console.log("");
    const thirdTable = thirdParty
      .sort((a, b) => b.transferSize - a.transferSize)
      .map((s) => ({
        Script: s.shortName,
        Host: s.host,
        Size: formatBytes(s.transferSize),
        Duration: s.duration.toFixed(0) + "ms",
        Blocking: s.renderBlocking ? "⚠️ Yes" : "No",
      }));
    console.table(thirdTable);
  }
  console.groupEnd();

  // Recommendations
  if (thirdParty.length > 0) {
    console.log("");
    console.group("%c📝 Recommendations", "color: #3b82f6; font-weight: bold;");

    if (thirdMetrics.blocking > 0) {
      console.log("");
      console.log("%c⚠️ Render-blocking third-party scripts:", "font-weight: bold; color: #ef4444;");
      console.log("   • Load with 'async' or 'defer' attribute");
      console.log("   • Consider lazy-loading after user interaction");
      console.log('%c   <script src="..." async></script>', "font-family: monospace; color: #22c55e;");
    }

    if (thirdMetrics.hosts.length > 3) {
      console.log("");
      console.log(`%c⚠️ ${thirdMetrics.hosts.length} different third-party hosts:`, "font-weight: bold; color: #f59e0b;");
      console.log("   • Each host requires DNS lookup + connection");
      console.log("   • Use <link rel='preconnect'> for critical hosts");
      console.log('%c   <link rel="preconnect" href="https://example.com">', "font-family: monospace; color: #22c55e;");
    }

    if (thirdMetrics.totalSize > 100 * 1024) {
      console.log("");
      console.log(`%c⚠️ Third-party scripts total ${formatBytes(thirdMetrics.totalSize)}:`, "font-weight: bold; color: #f59e0b;");
      console.log("   • Audit necessity of each script");
      console.log("   • Consider self-hosting critical scripts");
      console.log("   • Look for lighter alternatives");
    }

    console.log("");
    console.log("%c💡 General tips:", "font-weight: bold;");
    console.log("   • Regularly audit third-party scripts");
    console.log("   • Set up Content Security Policy (CSP)");
    console.log("   • Monitor third-party performance with RUM");
    console.log("   • Have fallbacks for critical functionality");

    console.groupEnd();
  }

  console.groupEnd();
})();
