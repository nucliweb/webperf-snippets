(async () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  const controller = navigator.serviceWorker.controller;
  const navEntry = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const swResources = resources.filter(r => r.workerStart > 0);
  const fromCache = swResources.filter(r => r.transferSize === 0);
  swResources.filter(r => r.transferSize > 0);
  resources.filter(r => r.workerStart === 0);
  if (registrations.length === 0) {
    return;
  }
  for (const reg of registrations) {
    if (reg.active) {
    }
    if (reg.waiting) {
    }
    if (reg.installing) void 0;
    if (reg.navigationPreload) try {
      const preload = await reg.navigationPreload.getState();
      if (preload.enabled) {
      } else {
      }
    } catch (_) {}
  }
  if (controller) {
  } else {
  }
  if (navEntry && navEntry.workerStart > 0) {
    const workerStart = navEntry.workerStart - navEntry.startTime;
    const fetchStart = navEntry.fetchStart - navEntry.startTime;
    const swOverhead = Math.max(fetchStart - workerStart, 0);
    if (swOverhead > 100) void 0; else if (swOverhead > 50) void 0; else void 0;
  }
  if (swResources.length > 0) {
    const hitRate = (fromCache.length / swResources.length * 100).toFixed(1);
    (fromCache.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0) / 1024).toFixed(1);
    const rate = parseFloat(hitRate);
    if (rate >= 80) void 0; else if (rate >= 50) void 0; else void 0;
  }
  if ("caches" in window) try {
    const cacheNames = await caches.keys();
    if (cacheNames.length > 0) {
      let totalEntries = 0;
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        totalEntries += keys.length;
      }
    }
  } catch (_) {}
})();
