(() => {
  if (document.readyState !== "complete") {
  }
  const preloadLinks = Array.from(document.querySelectorAll('link[rel="preload"]'));
  const preconnectLinks = Array.from(document.querySelectorAll('link[rel="preconnect"]'));
  const dnsPrefetchLinks = Array.from(document.querySelectorAll('link[rel="dns-prefetch"]'));
  const resources = performance.getEntriesByType("resource");
  const getDomain = url => {
    try {
      const absoluteUrl = url.startsWith("http") ? url : new URL(url, location.href).href;
      return new URL(absoluteUrl).origin;
    } catch {
      return null;
    }
  };
  const normalizeUrl = url => {
    try {
      const parsed = new URL(url, location.origin);
      return parsed.origin + parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };
  const formatSize = bytes => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    return kb.toFixed(1) + " KB";
  };
  const usedResourceUrls = new Set(resources.map(r => normalizeUrl(r.name)));
  const usedDomains = new Set(resources.map(r => getDomain(r.name)).filter(Boolean));
  usedDomains.add(location.origin);
  const allImgElements = document.querySelectorAll("img[src]");
  if (preloadLinks.length === 0) void 0; else {
    const preloadResults = preloadLinks.map(link => {
      const href = link.href;
      const as = link.getAttribute("as") || "unknown";
      const media = link.getAttribute("media");
      const normalizedUrl = normalizeUrl(href);
      const shortUrl = href.split("/").pop()?.split("?").shift() || href;
      const wasUsed = usedResourceUrls.has(normalizedUrl);
      const perfEntry = resources.find(r => normalizeUrl(r.name) === normalizedUrl);
      let mediaMatches = true;
      if (media) try {
        mediaMatches = window.matchMedia(media).matches;
      } catch {
        mediaMatches = false;
      }
      return {
        shortUrl: shortUrl,
        href: href,
        as: as,
        media: media,
        mediaMatches: mediaMatches,
        wasUsed: wasUsed,
        size: perfEntry ? formatSize(perfEntry.decodedBodySize || perfEntry.transferSize) : "N/A",
        link: link
      };
    });
    const usedPreloads = preloadResults.filter(r => r.wasUsed);
    const unusedPreloads = preloadResults.filter(r => !r.wasUsed && (!r.media || r.mediaMatches));
    const conditionalPreloads = preloadResults.filter(r => !r.wasUsed && r.media && !r.mediaMatches);
    if (unusedPreloads.length > 0) {
    }
    if (conditionalPreloads.length > 0) {
    }
    if (usedPreloads.length > 0) {
    }
    const activePreloads = preloadLinks.length - conditionalPreloads.length;
    activePreloads > 0 && Math.round(usedPreloads.length / activePreloads * 100);
    if (unusedPreloads.length === 0) void 0; else void 0;
  }
  const lazyLoadedDomains = new Set;
  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin && !usedDomains.has(domain)) lazyLoadedDomains.add(domain);
    } catch {}
  });
  if (preconnectLinks.length === 0) void 0; else {
    const preconnectResults = preconnectLinks.map(link => {
      const href = link.href;
      const domain = getDomain(href);
      const wasUsed = domain ? usedDomains.has(domain) : false;
      const isLazyLoaded = domain ? lazyLoadedDomains.has(domain) : false;
      const requestCount = resources.filter(r => getDomain(r.name) === domain).length;
      return {
        domain: domain,
        href: href,
        wasUsed: wasUsed,
        isLazyLoaded: isLazyLoaded,
        requestCount: requestCount,
        link: link
      };
    });
    const usedPreconnects = preconnectResults.filter(r => r.wasUsed);
    const lazyLoadedPreconnects = preconnectResults.filter(r => !r.wasUsed && r.isLazyLoaded);
    const unusedPreconnects = preconnectResults.filter(r => !r.wasUsed && !r.isLazyLoaded);
    if (unusedPreconnects.length > 0) {
    }
    if (lazyLoadedPreconnects.length > 0) {
    }
    if (usedPreconnects.length > 0) {
    }
    const effectivePreconnects = usedPreconnects.length + lazyLoadedPreconnects.length;
    Math.round(effectivePreconnects / preconnectLinks.length * 100);
    if (unusedPreconnects.length === 0) void 0; else void 0;
  }
  if (dnsPrefetchLinks.length === 0) void 0; else {
    const dnsPrefetchResults = dnsPrefetchLinks.map(link => {
      const href = link.href;
      const domain = getDomain(href);
      const wasUsed = domain ? usedDomains.has(domain) : false;
      const isLazyLoaded = domain ? lazyLoadedDomains.has(domain) : false;
      const requestCount = resources.filter(r => getDomain(r.name) === domain).length;
      return {
        domain: domain,
        href: href,
        wasUsed: wasUsed,
        isLazyLoaded: isLazyLoaded,
        requestCount: requestCount,
        link: link
      };
    });
    const usedDnsPrefetch = dnsPrefetchResults.filter(r => r.wasUsed);
    const lazyLoadedDnsPrefetch = dnsPrefetchResults.filter(r => !r.wasUsed && r.isLazyLoaded);
    const unusedDnsPrefetch = dnsPrefetchResults.filter(r => !r.wasUsed && !r.isLazyLoaded);
    if (unusedDnsPrefetch.length > 0) {
    }
    if (lazyLoadedDnsPrefetch.length > 0) {
    }
    if (usedDnsPrefetch.length > 0) {
    }
    const effectiveDnsPrefetch = usedDnsPrefetch.length + lazyLoadedDnsPrefetch.length;
    Math.round(effectiveDnsPrefetch / dnsPrefetchLinks.length * 100);
  }
  const preconnectDomains = new Set(preconnectLinks.map(l => getDomain(l.href)).filter(Boolean));
  const dnsPrefetchDomains = new Set(dnsPrefetchLinks.map(l => getDomain(l.href)).filter(Boolean));
  const redundantDomains = Array.from(preconnectDomains).filter(d => dnsPrefetchDomains.has(d));
  if (redundantDomains.length > 0) {
    redundantDomains.forEach(domain => {
    });
  } else void 0;
  const imgDomains = new Set;
  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin) imgDomains.add(domain);
    } catch {}
  });
  const missingFromPerf = Array.from(imgDomains).filter(domain => !usedDomains.has(domain));
  if (missingFromPerf.length > 0) {
    const domainsWithCounts = missingFromPerf.map(domain => {
      const imgCount = Array.from(allImgElements).filter(img => {
        try {
          return getDomain(img.src) === domain;
        } catch {
          return false;
        }
      }).length;
      return {
        domain: domain,
        imgCount: imgCount
      };
    }).filter(item => item.domain && item.domain !== "null").sort((a, b) => b.imgCount - a.imgCount);
    domainsWithCounts.forEach(item => {
    });
  } else void 0;
  const hintedDomains = new Set([ ...preconnectLinks.map(l => getDomain(l.href)), ...dnsPrefetchLinks.map(l => getDomain(l.href)) ]);
  const domainRequestCounts = {};
  resources.forEach(r => {
    const domain = getDomain(r.name);
    if (domain && domain !== location.origin) domainRequestCounts[domain] = (domainRequestCounts[domain] || 0) + 1;
  });
  const missingHints = Object.entries(domainRequestCounts).filter(([domain, count]) => count >= 2 && !hintedDomains.has(domain)).sort((a, b) => b[1] - a[1]);
  const topPreconnects = missingHints.filter(([_, count]) => count >= 5).slice(0, 3);
  const topDnsPrefetch = missingHints.filter(([_, count]) => count >= 2 && count < 5).slice(0, 5);
  const shownHints = [ ...topPreconnects, ...topDnsPrefetch ];
  if (missingHints.length > 0) {
    if (shownHints.length < missingHints.length) {
    }
    shownHints.forEach(([domain, count]) => {
    });
  } else void 0;
  const lazyLoadedDomainsForSummary = new Set;
  allImgElements.forEach(img => {
    try {
      const domain = getDomain(img.src);
      if (domain && domain !== location.origin && !usedDomains.has(domain)) lazyLoadedDomainsForSummary.add(domain);
    } catch {}
  });
  const totalIssues = preloadLinks.filter(l => !usedResourceUrls.has(normalizeUrl(l.href))).length + preconnectLinks.filter(l => {
    const domain = getDomain(l.href);
    return domain && !usedDomains.has(domain) && !lazyLoadedDomainsForSummary.has(domain);
  }).length + dnsPrefetchLinks.filter(l => {
    const domain = getDomain(l.href);
    return domain && !usedDomains.has(domain) && !lazyLoadedDomainsForSummary.has(domain);
  }).length;
  if (totalIssues === 0 && missingHints.length === 0) void 0; else {
  }
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
      redundantHints: redundantDomains.length
    },
    issues: [ ...totalIssues > 0 ? [ {
      severity: "warning",
      message: `${totalIssues} unused hint(s) waste bandwidth`
    } ] : [], ...missingHints.length > 0 ? [ {
      severity: "info",
      message: `${missingHints.length} domain(s) could benefit from connection hints`
    } ] : [], ...redundantDomains.length > 0 ? [ {
      severity: "warning",
      message: `${redundantDomains.length} domain(s) have both preconnect and dns-prefetch (redundant)`
    } ] : [] ]
  };
})();
