(async () => {
  const navEntries = performance.getEntriesByType("navigation");
  if (navEntries.length === 0) {
    return {
      script: "Client-Side-Redirect-Detection",
      status: "unsupported",
      error: "Navigation Timing not available"
    };
  }
  const navEntry = navEntries[0];
  const currentURL = new URL(window.location.href);
  const resources = performance.getEntriesByType("resource");
  const documentNavigations = resources.filter(r => {
    if (r.initiatorType !== "navigation") return false;
    try {
      const resourceURL = new URL(r.name);
      return resourceURL.origin === currentURL.origin;
    } catch {
      return false;
    }
  });
  const serverRedirects = navEntry.redirectCount || 0;
  const redirectTime = navEntry.redirectEnd - navEntry.redirectStart;
  const hasSPARouter = !!window.history?.state;
  const historyLength = window.history.length;
  const referrer = document.referrer ? new URL(document.referrer) : null;
  const sameOrigin = referrer && referrer.origin === currentURL.origin;
  const referrerPath = referrer?.pathname || "";
  const currentPath = currentURL.pathname;
  const hasRedirectParam = currentURL.searchParams.has("redirect") || currentURL.searchParams.has("from") || currentURL.searchParams.has("origin");
  if (referrer) {
  } else void 0;
  if (serverRedirects > 0) {
  } else void 0;
  let hasClientRedirect = false;
  const indicators = [];
  if (sameOrigin && referrerPath !== currentPath && referrerPath !== "") {
    hasClientRedirect = true;
    indicators.push({
      type: "Same-origin navigation",
      from: referrerPath,
      to: currentPath,
      severity: "warning"
    });
  }
  if (documentNavigations.length > 0) {
    hasClientRedirect = true;
    documentNavigations.forEach(nav => {
      indicators.push({
        type: "Document navigation",
        url: nav.name,
        duration: nav.duration.toFixed(1) + "ms",
        severity: "error"
      });
    });
  }
  if (hasRedirectParam) indicators.push({
    type: "Redirect parameter in URL",
    params: Array.from(currentURL.searchParams.entries()).filter(([key]) => key.toLowerCase().includes("redirect") || key.toLowerCase().includes("from") || key.toLowerCase().includes("origin")).map(([key, val]) => `${key}=${val}`).join(", "),
    severity: "info"
  });
  if (hasSPARouter && historyLength > 1) indicators.push({
    type: "SPA router detected",
    historyLength: historyLength,
    state: JSON.stringify(window.history.state)?.slice(0, 100) || "{}",
    severity: "info"
  });
  navEntry.loadEventEnd, navEntry.startTime;
  const domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.startTime;
  const responseSize = navEntry.transferSize || navEntry.encodedBodySize || 0;
  if (sameOrigin && domContentLoaded < 500 && responseSize < 10000) indicators.push({
    type: "Fast minimal-content navigation",
    duration: domContentLoaded.toFixed(1) + "ms",
    size: (responseSize / 1024).toFixed(1) + " KB",
    note: "Small page that loads quickly - possible redirect page",
    severity: "warning"
  });
  if (indicators.length === 0) void 0; else {
    indicators.forEach((indicator, index) => {
      indicator.severity === "error" || indicator.severity;
      Object.entries(indicator).forEach(([key, value]) => {
        if (key !== "type" && key !== "severity") void 0;
      });
      if (index < indicators.length - 1) void 0;
    });
  }
  if (hasClientRedirect && documentNavigations.length > 0) {
    const totalRedirectOverhead = documentNavigations.reduce((sum, nav) => sum + nav.duration, 0);
    if (totalRedirectOverhead > 3000) {
    } else if (totalRedirectOverhead > 1000) void 0; else void 0;
  }
  const hasDocumentNavigation = documentNavigations.length > 0;
  const hasSameOriginRedirect = sameOrigin && referrerPath !== currentPath && referrerPath !== "";
  hasDocumentNavigation && documentNavigations.reduce((sum, nav) => sum + nav.duration, 0);
  if (hasDocumentNavigation || serverRedirects > 0) {
    if (serverRedirects > 0) {
    }
    if (hasDocumentNavigation) {
      if (referrerPath && currentPath) {
        if (referrerPath === "/" && currentPath.match(/^\/[a-z]{2}\//)) {
        }
      }
    } else if (hasSameOriginRedirect) {
    }
  }
  if (documentNavigations.length > 0) {
  }
  if (hasDocumentNavigation) void 0; else if (hasSameOriginRedirect) void 0; else void 0;
  return {
    script: "Client-Side-Redirect-Detection",
    status: "ok",
    details: {
      serverRedirects: serverRedirects,
      redirectTimeMs: Math.round(redirectTime),
      clientRedirectIndicators: indicators.length,
      documentNavigations: documentNavigations.length,
      hasSPARouter: hasSPARouter,
      historyLength: historyLength,
      currentPath: currentPath,
      referrerPath: referrerPath
    },
    issues: [ ...serverRedirects > 0 ? [ {
      severity: "warning",
      message: `${serverRedirects} server-side redirect(s) detected (${Math.round(redirectTime)}ms)`
    } ] : [], ...documentNavigations.length > 0 ? [ {
      severity: "error",
      message: `${documentNavigations.length} same-origin document navigation(s) detected — likely client-side redirect`
    } ] : [], ...indicators.filter(i => i.severity === "warning").map(i => ({
      severity: "warning",
      message: i.type
    })) ]
  };
})();
