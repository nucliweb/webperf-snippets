(async () => {
  if (!("serviceWorker" in navigator)) {
    return {
      script: "Service-Worker-Analysis",
      status: "unsupported",
      error: "Service Workers not supported in this browser",
      count: 0,
      details: {},
      items: [],
      issues: [ {
        severity: "error",
        message: "Service Workers not supported in this browser"
      } ]
    };
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  const controller = navigator.serviceWorker.controller;
  const navEntry = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const swResources = resources.filter(r => r.workerStart > 0);
  const fromCache = swResources.filter(r => r.transferSize === 0 && r.encodedBodySize > 0);
  const fromNetwork = swResources.filter(r => r.transferSize > 0);
  const unknownSource = swResources.filter(r => r.transferSize === 0 && r.encodedBodySize === 0);
  const knownSource = fromCache.length + fromNetwork.length;
  const notIntercepted = resources.filter(r => r.workerStart === 0);
  let swOverheadMs = null;
  if (navEntry && navEntry.workerStart > 0) {
    const workerStart = navEntry.workerStart - navEntry.startTime;
    const fetchStart = navEntry.fetchStart - navEntry.startTime;
    swOverheadMs = Math.round(Math.max(fetchStart - workerStart, 0) * 10) / 10;
  }
  const cacheHitRate = knownSource > 0 ? parseFloat((fromCache.length / knownSource * 100).toFixed(1)) : null;
  const savedBytes = fromCache.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);
  const preloadStates = new Map;
  for (const reg of registrations) if (reg.navigationPreload) try {
    const state = await reg.navigationPreload.getState();
    preloadStates.set(reg, state);
  } catch {}
  const cacheStorage = [];
  if ("caches" in window) try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      cacheStorage.push({
        name: name,
        entries: keys.length
      });
    }
  } catch {}
  const cacheStorageTop = [ ...cacheStorage ].sort((a, b) => b.entries - a.entries).slice(0, 20);
  const items = registrations.map(reg => {
    const preload = preloadStates.get(reg) || null;
    let state = "none";
    let scriptURL = null;
    if (reg.active) {
      state = "active";
      scriptURL = reg.active.scriptURL;
    } else if (reg.waiting) {
      state = "waiting";
      scriptURL = reg.waiting.scriptURL;
    } else if (reg.installing) {
      state = "installing";
      scriptURL = reg.installing.scriptURL;
    }
    return {
      scope: reg.scope,
      scriptURL: scriptURL,
      state: state,
      hasWaiting: !!reg.waiting,
      hasInstalling: !!reg.installing,
      navigationPreloadEnabled: preload ? preload.enabled : null,
      navigationPreloadHeaderValue: preload?.headerValue || null
    };
  });
  const issues = [];
  if (registrations.length === 0) issues.push({
    severity: "info",
    message: "No Service Workers registered"
  });
  if (registrations.length > 0 && !controller) issues.push({
    severity: "warning",
    message: "Page is not controlled by a Service Worker (hard reload or first visit). Do a normal reload."
  });
  for (const item of items) {
    if (item.hasWaiting) issues.push({
      severity: "warning",
      message: `Service Worker update pending for ${item.scope}. Call skipWaiting() to activate the new version.`
    });
    if (item.navigationPreloadEnabled === false) issues.push({
      severity: "info",
      message: `Navigation Preload is disabled for ${item.scope}. Consider enabling it with registration.navigationPreload.enable().`
    });
  }
  if (swOverheadMs !== null && swOverheadMs > 100) issues.push({
    severity: "error",
    message: `High SW startup time (${swOverheadMs}ms). Enable Navigation Preload to reduce overhead.`
  }); else if (swOverheadMs !== null && swOverheadMs > 50) issues.push({
    severity: "warning",
    message: `Moderate SW startup time (${swOverheadMs}ms)`
  });
  if (cacheHitRate !== null && cacheHitRate < 50) issues.push({
    severity: "error",
    message: `Low SW cache hit rate (${cacheHitRate}%). Review the caching strategy.`
  }); else if (cacheHitRate !== null && cacheHitRate < 80) issues.push({
    severity: "warning",
    message: `Moderate SW cache hit rate (${cacheHitRate}%). Review the caching strategy for more resources.`
  });
  if (unknownSource.length > 0) issues.push({
    severity: "info",
    message: `${unknownSource.length} intercepted resource(s) are cross-origin without Timing-Allow-Origin, so their source is unknown. The hit rate excludes them.`
  });
  const rating = cacheHitRate === null ? null : cacheHitRate >= 80 ? "good" : cacheHitRate >= 50 ? "needs-improvement" : "poor";
  if (registrations.length === 0) {
    return {
      script: "Service-Worker-Analysis",
      status: "ok",
      count: 0,
      details: {
        controlled: false,
        controllerState: null,
        swOverheadMs: null,
        totalResources: resources.length,
        swIntercepted: 0,
        notIntercepted: resources.length,
        fromCache: 0,
        fromNetwork: 0,
        fromUnknown: 0,
        cacheHitRate: null,
        savedBytes: 0,
        cacheStorageCount: cacheStorage.length,
        cacheStorage: cacheStorageTop
      },
      items: [],
      issues: issues
    };
  }
  for (const reg of registrations) {
    if (reg.active) {
    }
    if (reg.waiting) {
    }
    if (reg.installing) void 0;
    const preload = preloadStates.get(reg);
    if (preload !== void 0) {
      if (preload.enabled) {
      } else {
      }
    }
  }
  if (controller) {
  } else {
  }
  if (navEntry && navEntry.workerStart > 0) {
    navEntry.workerStart, navEntry.startTime;
    navEntry.fetchStart, navEntry.startTime;
    if (swOverheadMs > 100) void 0; else if (swOverheadMs > 50) void 0; else void 0;
  }
  if (swResources.length > 0) {
    if (unknownSource.length > 0) void 0;
    if (cacheHitRate >= 80) void 0; else if (cacheHitRate >= 50) void 0; else void 0;
  }
  if (cacheStorage.length > 0) {
    cacheStorage.reduce((sum, c) => sum + c.entries, 0);
    for (const {name: name, entries: entries} of cacheStorage) void 0;
  }
  return {
    script: "Service-Worker-Analysis",
    status: "ok",
    count: registrations.length,
    ...rating !== null && {
      rating: rating
    },
    details: {
      controlled: !!controller,
      controllerState: controller?.state || null,
      swOverheadMs: swOverheadMs,
      totalResources: resources.length,
      swIntercepted: swResources.length,
      notIntercepted: notIntercepted.length,
      fromCache: fromCache.length,
      fromNetwork: fromNetwork.length,
      fromUnknown: unknownSource.length,
      cacheHitRate: cacheHitRate,
      savedBytes: savedBytes,
      cacheStorageCount: cacheStorage.length,
      cacheStorage: cacheStorageTop
    },
    items: items,
    issues: issues
  };
})();
