// Resource Hints Validation
// https://webperf-snippets.nucliweb.net

(() => {
  console.group("%c🔍 Resource Hints Validation", "font-weight: bold; font-size: 14px;");

  // Check if page is fully loaded
  if (document.readyState !== 'complete') {
    console.log("");
    console.log("%c⚠️ Warning: Page is still loading (readyState: " + document.readyState + ")", "color: #f59e0b; font-weight: bold;");
    console.log("%cFor accurate results, wait until the page is fully loaded and run again.", "color: #6b7280;");
    console.log("");
  }

  // Get all resource hints from DOM
  const preloadLinks = Array.from(document.querySelectorAll('link[rel="preload"]'));
  const preconnectLinks = Array.from(document.querySelectorAll('link[rel="preconnect"]'));
  const dnsPrefetchLinks = Array.from(document.querySelectorAll('link[rel="dns-prefetch"]'));

  // Get all loaded resources from Performance API
  const resources = performance.getEntriesByType("resource");

  // Helper: Extract domain from URL
  const getDomain = (url) => {
    try {
      // Handle relative URLs by resolving against current location
      const absoluteUrl = url.startsWith('http') ? url : new URL(url, location.href).href;
      return new URL(absoluteUrl).origin;
    } catch {
      return null;
    }
  };

  // Helper: Normalize URL for comparison
  const normalizeUrl = (url) => {
    try {
      const parsed = new URL(url, location.origin);
      return parsed.origin + parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };

  // Helper: Format size
  const formatSize = (bytes) => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    return kb.toFixed(1) + " KB";
  };

  // Create maps of used resources and domains
  const usedResourceUrls = new Set(resources.map(r => normalizeUrl(r.name)));
  const usedDomains = new Set(resources.map(r => getDomain(r.name)).filter(Boolean));
  usedDomains.add(location.origin);

  // Get all image elements once for reuse across validations
  const allImgElements = document.querySelectorAll('img[src]');

  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log("   Preload hints: " + preloadLinks.length);
  console.log("   Preconnect hints: " + preconnectLinks.length);
  console.log("   DNS-prefetch hints: " + dnsPrefetchLinks.length);
  console.log("   Total resources loaded: " + resources.length);
  console.log("   Unique domains accessed: " + usedDomains.size);

  // ===== PRELOAD VALIDATION =====
  console.log("");
  console.group("%c1. Preload Validation", "font-weight: bold; color: #3b82f6;");

  if (preloadLinks.length === 0) {
    console.log("%cℹ️ No preload hints found.", "color: #6b7280;");
  } else {
    const preloadResults = preloadLinks.map(link => {
      const href = link.href;
      const as = link.getAttribute("as") || "unknown";
      const media = link.getAttribute("media");
      const normalizedUrl = normalizeUrl(href);
      const shortUrl = href.split("/").pop()?.split("?").shift() || href;

      const wasUsed = usedResourceUrls.has(normalizedUrl);
      const perfEntry = resources.find(r => normalizeUrl(r.name) === normalizedUrl);

      let mediaMatches = true;
      if (media) {
        try {
          mediaMatches = window.matchMedia(media).matches;
        } catch {
          mediaMatches = false;
        }
      }

      return {
        shortUrl,
        href,
        as,
        media,
        mediaMatches,
        wasUsed,
        size: perfEntry ? formatSize(perfEntry.decodedBodySize || perfEntry.transferSize) : "N/A",
        link
      };
    });

    const usedPreloads = preloadResults.filter(r => r.wasUsed);
    const unusedPreloads = preloadResults.filter(r => !r.wasUsed && (!r.media || r.mediaMatches));
    const conditionalPreloads = preloadResults.filter(r => !r.wasUsed && r.media && !r.mediaMatches);

    if (unusedPreloads.length > 0) {
      console.log("");
      console.log("%c❌ Unused Preloads (" + unusedPreloads.length + ")", "color: #ef4444; font-weight: bold;");
      console.table(unusedPreloads.map(r => ({
        Resource: r.shortUrl,
        Type: r.as,
        Status: "Not Used ❌"
      })));
    }

    if (conditionalPreloads.length > 0) {
      console.log("");
      console.log("%cℹ️ Conditional Preloads (" + conditionalPreloads.length + ")", "color: #3b82f6; font-weight: bold;");
      console.log("%cThese preloads have media queries that don't match current viewport (this is OK):", "color: #6b7280;");
      console.table(conditionalPreloads.map(r => ({
        Resource: r.shortUrl,
        Type: r.as,
        Media: r.media,
        Status: "Conditional ✅"
      })));
    }

    if (usedPreloads.length > 0) {
      console.log("");
      console.log("%c✅ Used Preloads (" + usedPreloads.length + ")", "color: #22c55e; font-weight: bold;");
      console.table(usedPreloads.map(r => ({
        Resource: r.shortUrl,
        Type: r.as,
        Size: r.size,
        Status: "Used ✅"
      })));
    }

    const activePreloads = preloadLinks.length - conditionalPreloads.length;
    const usageRate = activePreloads > 0 ? Math.round((usedPreloads.length / activePreloads) * 100) : 0;
    console.log("");
    console.log("%cUsage Rate: " + usageRate + "%", "font-weight: bold;");

    if (unusedPreloads.length === 0) {
      console.log("%c✅ All applicable preload hints are being used.", "color: #22c55e;");
    } else {
      console.log("%c⚠️ " + unusedPreloads.length + " unused preload(s) waste bandwidth.", "color: #ef4444;");
    }
  }

  console.groupEnd();

  // ===== PRECONNECT VALIDATION =====
  console.log("");
  console.group("%c2. Preconnect Validation", "font-weight: bold; color: #3b82f6;");

  // Get lazy-loaded image domains for preconnect validation
  const lazyLoadedDomains = new Set();
  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin && !usedDomains.has(domain)) {
        lazyLoadedDomains.add(domain);
      }
    } catch {}
  });

  if (preconnectLinks.length === 0) {
    console.log("%cℹ️ No preconnect hints found.", "color: #6b7280;");
  } else {
    const preconnectResults = preconnectLinks.map(link => {
      const href = link.href;
      const domain = getDomain(href);
      const wasUsed = domain ? usedDomains.has(domain) : false;
      const isLazyLoaded = domain ? lazyLoadedDomains.has(domain) : false;
      const requestCount = resources.filter(r => getDomain(r.name) === domain).length;

      return { domain, href, wasUsed, isLazyLoaded, requestCount, link };
    });

    const usedPreconnects = preconnectResults.filter(r => r.wasUsed);
    const lazyLoadedPreconnects = preconnectResults.filter(r => !r.wasUsed && r.isLazyLoaded);
    const unusedPreconnects = preconnectResults.filter(r => !r.wasUsed && !r.isLazyLoaded);

    if (unusedPreconnects.length > 0) {
      console.log("");
      console.log("%c❌ Unused Preconnects (" + unusedPreconnects.length + ")", "color: #ef4444; font-weight: bold;");
      console.table(unusedPreconnects.map(r => ({
        Domain: r.domain || r.href,
        Requests: 0,
        Status: "Not Used ❌"
      })));
    }

    if (lazyLoadedPreconnects.length > 0) {
      console.log("");
      console.log("%c✅ Lazy-Loaded Preconnects (" + lazyLoadedPreconnects.length + ")", "color: #22c55e; font-weight: bold;");
      console.log("%cThese preconnects are for lazy-loaded resources (correct usage!):", "color: #6b7280;");
      console.table(lazyLoadedPreconnects.map(r => ({
        Domain: r.domain || r.href,
        "Images in DOM": document.querySelectorAll('img[src*="' + (r.domain || r.href).replace(/https?:\/\//, '') + '"]').length,
        Status: "Lazy-Loaded ✅"
      })));
    }

    if (usedPreconnects.length > 0) {
      console.log("");
      console.log("%c✅ Used Preconnects (" + usedPreconnects.length + ")", "color: #22c55e; font-weight: bold;");
      console.table(usedPreconnects.map(r => ({
        Domain: r.domain || r.href,
        Requests: r.requestCount,
        Status: "Used ✅"
      })));
    }

    const effectivePreconnects = usedPreconnects.length + lazyLoadedPreconnects.length;
    const usageRate = Math.round((effectivePreconnects / preconnectLinks.length) * 100);
    console.log("");
    console.log("%cUsage Rate: " + usageRate + "%", "font-weight: bold;");

    if (unusedPreconnects.length === 0) {
      console.log("%c✅ All preconnect hints are being used.", "color: #22c55e;");
    } else {
      console.log("%c⚠️ " + unusedPreconnects.length + " unused preconnect(s) waste CPU/network.", "color: #ef4444;");
    }
  }

  console.groupEnd();

  // ===== DNS-PREFETCH VALIDATION =====
  console.log("");
  console.group("%c3. DNS-Prefetch Validation", "font-weight: bold; color: #3b82f6;");

  if (dnsPrefetchLinks.length === 0) {
    console.log("%cℹ️ No dns-prefetch hints found.", "color: #6b7280;");
  } else {
    const dnsPrefetchResults = dnsPrefetchLinks.map(link => {
      const href = link.href;
      const domain = getDomain(href);
      const wasUsed = domain ? usedDomains.has(domain) : false;
      const isLazyLoaded = domain ? lazyLoadedDomains.has(domain) : false;
      const requestCount = resources.filter(r => getDomain(r.name) === domain).length;

      return { domain, href, wasUsed, isLazyLoaded, requestCount, link };
    });

    const usedDnsPrefetch = dnsPrefetchResults.filter(r => r.wasUsed);
    const lazyLoadedDnsPrefetch = dnsPrefetchResults.filter(r => !r.wasUsed && r.isLazyLoaded);
    const unusedDnsPrefetch = dnsPrefetchResults.filter(r => !r.wasUsed && !r.isLazyLoaded);

    if (unusedDnsPrefetch.length > 0) {
      console.log("");
      console.log("%cℹ️ Unused DNS-Prefetch (" + unusedDnsPrefetch.length + ")", "color: #f59e0b; font-weight: bold;");
      console.table(unusedDnsPrefetch.map(r => ({
        Domain: r.domain || r.href,
        Requests: 0,
        Status: "Not Used"
      })));
      console.log("%cNote: Unused dns-prefetch has minimal impact.", "color: #6b7280;");
    }

    if (lazyLoadedDnsPrefetch.length > 0) {
      console.log("");
      console.log("%c✅ Lazy-Loaded DNS-Prefetch (" + lazyLoadedDnsPrefetch.length + ")", "color: #22c55e; font-weight: bold;");
      console.log("%cThese dns-prefetch hints are for lazy-loaded resources (correct usage!):", "color: #6b7280;");
      console.table(lazyLoadedDnsPrefetch.map(r => ({
        Domain: r.domain || r.href,
        "Images in DOM": document.querySelectorAll('img[src*="' + (r.domain || r.href).replace(/https?:\/\//, '') + '"]').length,
        Status: "Lazy-Loaded ✅"
      })));
    }

    if (usedDnsPrefetch.length > 0) {
      console.log("");
      console.log("%c✅ Used DNS-Prefetch (" + usedDnsPrefetch.length + ")", "color: #22c55e; font-weight: bold;");
      console.table(usedDnsPrefetch.map(r => ({
        Domain: r.domain || r.href,
        Requests: r.requestCount,
        Status: "Used ✅"
      })));
    }

    const effectiveDnsPrefetch = usedDnsPrefetch.length + lazyLoadedDnsPrefetch.length;
    const usageRate = Math.round((effectiveDnsPrefetch / dnsPrefetchLinks.length) * 100);
    console.log("");
    console.log("%cUsage Rate: " + usageRate + "%", "font-weight: bold;");
  }

  console.groupEnd();

  // ===== REDUNDANT HINTS CHECK =====
  console.log("");
  console.group("%c⚠️ Redundant Hints", "font-weight: bold; color: #f59e0b;");

  const preconnectDomains = new Set(preconnectLinks.map(l => getDomain(l.href)).filter(Boolean));
  const dnsPrefetchDomains = new Set(dnsPrefetchLinks.map(l => getDomain(l.href)).filter(Boolean));
  const redundantDomains = Array.from(preconnectDomains).filter(d => dnsPrefetchDomains.has(d));

  if (redundantDomains.length > 0) {
    console.log("");
    console.log("%c⚠️ Redundant Configuration Detected", "color: #f59e0b; font-weight: bold;");
    console.log("%cThese domains have BOTH preconnect AND dns-prefetch hints:", "color: #6b7280;");
    console.log("");
    redundantDomains.forEach(domain => {
      console.log("   • " + domain);
    });
    console.log("");
    console.log("%c💡 Recommendation: Remove dns-prefetch for these domains.", "color: #3b82f6; font-weight: bold;");
    console.log("%cpreconnect already includes DNS resolution + TCP + TLS handshake.", "color: #6b7280;");
    console.log("%cdns-prefetch only does DNS resolution, so it's redundant when preconnect exists.", "color: #6b7280;");
  } else {
    console.log("%c✅ No redundant hints found.", "color: #22c55e;");
  }

  console.groupEnd();

  // ===== PERFORMANCE API LIMITATIONS CHECK =====
  console.log("");
  console.group("%c⚠️ Performance API Limitations", "font-weight: bold; color: #f59e0b;");

  // Check for images in DOM that might not be in Performance API
  const imgDomains = new Set();

  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin) {
        imgDomains.add(domain);
      }
    } catch {}
  });

  const missingFromPerf = Array.from(imgDomains).filter(domain => !usedDomains.has(domain));

  if (missingFromPerf.length > 0) {
    console.log("");
    console.log("%c⚠️ Lazy-Loaded Resources Detected", "color: #f59e0b; font-weight: bold;");
    console.log("%cThese domains have resources in the DOM but not in Performance API.", "color: #6b7280;");
    console.log("%cThis typically happens with lazy-loaded images or service worker cached resources.", "color: #6b7280;");
    console.log("");
    console.log("%cDomains with lazy-loaded resources:", "font-weight: bold;");

    const domainsWithCounts = missingFromPerf
      .map(domain => {
        const imgCount = Array.from(allImgElements).filter(img => {
          try {
            return getDomain(img.src) === domain;
          } catch {
            return false;
          }
        }).length;
        return { domain, imgCount };
      })
      .filter(item => item.domain && item.domain !== 'null')
      .sort((a, b) => b.imgCount - a.imgCount);

    domainsWithCounts.forEach(item => {
      console.log("   • " + item.domain + " (" + item.imgCount + " images in DOM)");
    });

    console.log("");
    console.log("%c✅ IMPORTANT: Keep preconnect/dns-prefetch hints for these domains!", "color: #22c55e; font-weight: bold;");
    console.log("%cLazy-loaded resources benefit MORE from connection hints because the connection", "color: #6b7280;");
    console.log("%cis established early, making images load instantly when the user scrolls to them.", "color: #6b7280;");
    console.log("");
    console.log("%cIf these domains have preconnect hints marked as 'unused' above, IGNORE that warning.", "color: #f59e0b; font-weight: bold;");
    console.log("%cThe hints are working correctly - the Performance API just can't see lazy-loaded resources.", "color: #6b7280;");
  } else {
    console.log("%c✅ All DOM image domains are captured in Performance API.", "color: #22c55e;");
  }

  console.groupEnd();

  // ===== OPPORTUNITIES =====
  console.log("");
  console.group("%c4. Optimization Opportunities", "font-weight: bold; color: #3b82f6;");

  const hintedDomains = new Set([
    ...preconnectLinks.map(l => getDomain(l.href)),
    ...dnsPrefetchLinks.map(l => getDomain(l.href))
  ]);

  const domainRequestCounts = {};
  resources.forEach(r => {
    const domain = getDomain(r.name);
    if (domain && domain !== location.origin) {
      domainRequestCounts[domain] = (domainRequestCounts[domain] || 0) + 1;
    }
  });

  const missingHints = Object.entries(domainRequestCounts)
    .filter(([domain, count]) => count >= 2 && !hintedDomains.has(domain))
    .sort((a, b) => b[1] - a[1]);

  const topPreconnects = missingHints.filter(([_, count]) => count >= 5).slice(0, 3);
  const topDnsPrefetch = missingHints.filter(([_, count]) => count >= 2 && count < 5).slice(0, 5);
  const shownHints = [...topPreconnects, ...topDnsPrefetch];

  if (missingHints.length > 0) {
    console.log("");
    console.log("%c⚡ Optimization Opportunities (" + missingHints.length + " found)", "color: #f59e0b; font-weight: bold;");
    console.log("%cThese domains make multiple requests but have no connection hints:", "color: #6b7280;");

    if (shownHints.length < missingHints.length) {
      console.log("%c⚠️ Showing top " + shownHints.length + " recommendations", "color: #f59e0b;");
      console.log("%c💡 Too many hints compete for bandwidth. Focus on the most critical domains.", "color: #6b7280;");
    }

    console.table(shownHints.map(([domain, count]) => ({
      Domain: domain,
      Requests: count,
      Recommendation: count >= 5 ? "preconnect" : "dns-prefetch",
      Priority: count >= 10 ? "High" : count >= 5 ? "Medium" : "Low"
    })));

    console.log("");
    console.log("%cSuggested code:", "font-weight: bold;");
    shownHints.forEach(([domain, count]) => {
      const hint = count >= 5 ? "preconnect" : "dns-prefetch";
      console.log('%c<link rel="' + hint + '" href="' + domain + '">', "font-family: monospace;");
    });
  } else {
    console.log("%c✅ All frequently-used domains have appropriate hints.", "color: #22c55e;");
  }

  console.groupEnd();

  // ===== BEST PRACTICES =====
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%cPreload:", "font-weight: bold;");
  console.log("   ✅ Use for critical resources on current page");
  console.log("   ❌ Don't preload resources not used on current page");
  console.log("   ⚡ Limit to few most critical resources");
  console.log("");
  console.log("%cPreconnect:", "font-weight: bold;");
  console.log("   ✅ Use for critical third-party domains");
  console.log("   ✅ Best for domains with many requests");
  console.log("   ❌ Don't use for domains not accessed");
  console.log("   ⚡ Limit to few most important domains");
  console.log("");
  console.log("%cDNS-Prefetch:", "font-weight: bold;");
  console.log("   ✅ Use for non-critical third-party domains");
  console.log("   ✅ Good for domains with few requests");
  console.log("   ℹ️ Less impact than preconnect");

  console.groupEnd();

  // Final summary - reuse lazy-loaded domains set from earlier
  const lazyLoadedDomainsForSummary = new Set();
  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin && !usedDomains.has(domain)) {
        lazyLoadedDomainsForSummary.add(domain);
      }
    } catch {}
  });

  const totalIssues = preloadLinks.filter(l => !usedResourceUrls.has(normalizeUrl(l.href))).length +
    preconnectLinks.filter(l => {
      const domain = getDomain(l.href);
      return domain && !usedDomains.has(domain) && !lazyLoadedDomainsForSummary.has(domain);
    }).length +
    dnsPrefetchLinks.filter(l => {
      const domain = getDomain(l.href);
      return domain && !usedDomains.has(domain) && !lazyLoadedDomainsForSummary.has(domain);
    }).length;

  console.log("");
  if (totalIssues === 0 && missingHints.length === 0) {
    console.log("%c✅ Excellent! All resource hints are properly configured.", "color: #22c55e; font-weight: bold; font-size: 14px;");
  } else {
    console.log("%c⚠️ Found " + totalIssues + " unused hint(s) and " + missingHints.length + " optimization opportunity(ies).", "color: #ef4444; font-weight: bold;");
    console.log("%cReview recommendations above to improve performance.", "color: #6b7280;");
  }

  console.groupEnd();

  return {
    script: "Resource-Hints-Validation",
    status: "ok",
    count: preloadLinks.length + preconnectLinks.length + dnsPrefetchLinks.length,
    details: {
      preloadCount: preloadLinks.length,
      preconnectCount: preconnectLinks.length,
      dnsPrefetchCount: dnsPrefetchLinks.length,
      totalResourcesLoaded: resources.length,
      unusedHints: totalIssues,
      missingPreconnects: missingHints.length,
      redundantHints: redundantDomains.length,
    },
    issues: [
      ...(totalIssues > 0 ? [{ severity: "warning", message: `${totalIssues} unused hint(s) waste bandwidth` }] : []),
      ...(missingHints.length > 0 ? [{ severity: "info", message: `${missingHints.length} domain(s) could benefit from connection hints` }] : []),
      ...(redundantDomains.length > 0 ? [{ severity: "warning", message: `${redundantDomains.length} domain(s) have both preconnect and dns-prefetch (redundant)` }] : []),
    ],
  };
})();
