// Service Worker Analysis
// https://webperf-snippets.nucliweb.net

(async () => {
  if (!('serviceWorker' in navigator)) {
    console.log(
      '%c⚠️ Service Workers not supported in this browser',
      'color: #f59e0b; font-weight: bold;'
    );
    return {
      script: "Service-Worker-Analysis",
      status: "unsupported",
      error: "Service Workers not supported in this browser",
      count: 0,
      details: {},
      items: [],
      issues: [{ severity: "error", message: "Service Workers not supported in this browser" }],
    };
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const controller = navigator.serviceWorker.controller;
  const navEntry = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');

  // Resources intercepted by SW (workerStart > 0)
  const swResources = resources.filter((r) => r.workerStart > 0);
  // transferSize 0 with a body means served from cache. With no body size either, the
  // resource is cross-origin without Timing-Allow-Origin and its source is unknown.
  const fromCache = swResources.filter((r) => r.transferSize === 0 && r.encodedBodySize > 0);
  const fromNetwork = swResources.filter((r) => r.transferSize > 0);
  const unknownSource = swResources.filter((r) => r.transferSize === 0 && r.encodedBodySize === 0);
  const knownSource = fromCache.length + fromNetwork.length;
  const notIntercepted = resources.filter((r) => r.workerStart === 0);

  // SW Startup overhead
  let swOverheadMs = null;
  if (navEntry && navEntry.workerStart > 0) {
    const workerStart = navEntry.workerStart - navEntry.startTime;
    const fetchStart = navEntry.fetchStart - navEntry.startTime;
    swOverheadMs = Math.round(Math.max(fetchStart - workerStart, 0) * 10) / 10;
  }

  // Cache hit rate
  // Computed over the resources whose source is known
  const cacheHitRate = knownSource > 0
    ? parseFloat(((fromCache.length / knownSource) * 100).toFixed(1))
    : null;
  const savedBytes = fromCache.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);

  // Navigation preload states (collected once, reused in console output and return)
  const preloadStates = new Map();
  for (const reg of registrations) {
    if (reg.navigationPreload) {
      try {
        const state = await reg.navigationPreload.getState();
        preloadStates.set(reg, state);
      } catch {
        // Access may be restricted
      }
    }
  }

  // Cache Storage inventory
  const cacheStorage = [];
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        cacheStorage.push({ name, entries: keys.length });
      }
    } catch {
      // Cross-origin restrictions may prevent cache access
    }
  }

  const cacheStorageTop = [...cacheStorage].sort((a, b) => b.entries - a.entries).slice(0, 20);

  // Build registration items (homogeneous shape)
  const items = registrations.map((reg) => {
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
      scriptURL,
      state,
      hasWaiting: !!reg.waiting,
      hasInstalling: !!reg.installing,
      navigationPreloadEnabled: preload ? preload.enabled : null,
      navigationPreloadHeaderValue: preload?.headerValue || null,
    };
  });

  // Build issues
  const issues = [];

  if (registrations.length === 0) {
    issues.push({ severity: "info", message: "No Service Workers registered" });
  }

  if (registrations.length > 0 && !controller) {
    issues.push({
      severity: "warning",
      message: "Page is not controlled by a Service Worker (hard reload or first visit). Do a normal reload.",
    });
  }

  for (const item of items) {
    if (item.hasWaiting) {
      issues.push({
        severity: "warning",
        message: `Service Worker update pending for ${item.scope}. Call skipWaiting() to activate the new version.`,
      });
    }
    if (item.navigationPreloadEnabled === false) {
      issues.push({
        severity: "info",
        message: `Navigation Preload is disabled for ${item.scope}. Consider enabling it with registration.navigationPreload.enable().`,
      });
    }
  }

  if (swOverheadMs !== null && swOverheadMs > 100) {
    issues.push({
      severity: "error",
      message: `High SW startup time (${swOverheadMs}ms). Enable Navigation Preload to reduce overhead.`,
    });
  } else if (swOverheadMs !== null && swOverheadMs > 50) {
    issues.push({
      severity: "warning",
      message: `Moderate SW startup time (${swOverheadMs}ms)`,
    });
  }

  if (cacheHitRate !== null && cacheHitRate < 50) {
    issues.push({
      severity: "error",
      message: `Low SW cache hit rate (${cacheHitRate}%). Review the caching strategy.`,
    });
  } else if (cacheHitRate !== null && cacheHitRate < 80) {
    issues.push({
      severity: "warning",
      message: `Moderate SW cache hit rate (${cacheHitRate}%). Review the caching strategy for more resources.`,
    });
  }

  if (unknownSource.length > 0) {
    issues.push({
      severity: "info",
      message: `${unknownSource.length} intercepted resource(s) are cross-origin without Timing-Allow-Origin, so their source is unknown. The hit rate excludes them.`,
    });
  }

  const rating = cacheHitRate === null ? null
    : cacheHitRate >= 80 ? "good"
    : cacheHitRate >= 50 ? "needs-improvement"
    : "poor";

  // --- Console output ---

  console.group(
    '%c⚙️ Service Worker Analysis',
    'font-weight: bold; font-size: 14px;'
  );

  // Registrations
  console.log('');
  console.log('%c📋 Registrations:', 'font-weight: bold;');

  if (registrations.length === 0) {
    console.log('%c   ❌ No Service Workers registered', 'color: #ef4444;');
    console.groupEnd();
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
        cacheStorage: cacheStorageTop,
      },
      items: [],
      issues,
    };
  }

  for (const reg of registrations) {
    console.log('');
    console.log(`%c   Scope: ${reg.scope}`, 'font-family: monospace;');

    if (reg.active) {
      console.log(
        `%c   ✅ Active: ${reg.active.state}`,
        'color: #22c55e;'
      );
      console.log(`      Script: ${reg.active.scriptURL}`);
    }
    if (reg.waiting) {
      console.log(
        '%c   ⏳ Waiting SW detected — update pending',
        'color: #f59e0b;'
      );
      console.log(`      Script: ${reg.waiting.scriptURL}`);
      console.log(
        '      💡 Call skipWaiting() to activate the new version'
      );
    }
    if (reg.installing) {
      console.log('%c   🔄 Installing...', 'color: #3b82f6;');
    }

    const preload = preloadStates.get(reg);
    if (preload !== undefined) {
      console.log('');
      console.log('%c   🚀 Navigation Preload:', 'font-weight: bold;');
      if (preload.enabled) {
        console.log('%c      ✅ Enabled', 'color: #22c55e;');
        console.log(`      Header value: "${preload.headerValue}"`);
      } else {
        console.log('%c      ❌ Disabled', 'color: #ef4444;');
        console.log(
          '      💡 Enable with: registration.navigationPreload.enable()'
        );
      }
    }
  }

  // Controller
  console.log('');
  console.log('%c🎮 Controller:', 'font-weight: bold;');
  if (controller) {
    console.log('%c   ✅ Page is controlled by SW', 'color: #22c55e;');
    console.log(`   State: ${controller.state}`);
  } else {
    console.log('%c   ⚠️ Page is NOT controlled by SW', 'color: #f59e0b;');
    console.log('   Hard reload detected or first visit. Do a normal reload.');
  }

  // SW Startup overhead
  if (navEntry && navEntry.workerStart > 0) {
    const workerStart = navEntry.workerStart - navEntry.startTime;
    const fetchStart = navEntry.fetchStart - navEntry.startTime;

    console.log('');
    console.log('%c⏱️ SW Startup Overhead:', 'font-weight: bold;');
    console.log(`   Worker start:  ${workerStart.toFixed(1)}ms`);
    console.log(`   Fetch start:   ${fetchStart.toFixed(1)}ms`);
    console.log(`   SW overhead:   ${swOverheadMs.toFixed(1)}ms`);

    if (swOverheadMs > 100) {
      console.log(
        '%c   🔴 High SW startup time — enable Navigation Preload',
        'color: #ef4444;'
      );
    } else if (swOverheadMs > 50) {
      console.log(
        '%c   🟡 Moderate SW startup time',
        'color: #f59e0b;'
      );
    } else {
      console.log(
        '%c   🟢 SW startup overhead is low',
        'color: #22c55e;'
      );
    }
  }

  // Cache hit/miss ratio
  console.log('');
  console.log('%c📊 Resource Cache Analysis:', 'font-weight: bold;');
  console.log(`   Total resources:     ${resources.length}`);
  console.log(`   SW intercepted:      ${swResources.length}`);
  console.log(`   Not intercepted:     ${notIntercepted.length}`);

  if (swResources.length > 0) {
    console.log('');
    console.log('   SW-intercepted breakdown:');
    console.log(`   ├─ Served from cache:   ${fromCache.length} (${cacheHitRate ?? 0}% hit rate)`);
    console.log(`   ${unknownSource.length > 0 ? '├' : '└'}─ Fetched from network: ${fromNetwork.length}`);
    if (unknownSource.length > 0) {
      console.log(`   └─ Unknown source:      ${unknownSource.length} (cross-origin, missing Timing-Allow-Origin)`);
    }
    console.log(`   Network bytes saved: ~${(savedBytes / 1024).toFixed(1)} KB`);

    if (cacheHitRate >= 80) {
      console.log('%c   🟢 Excellent cache hit rate', 'color: #22c55e;');
    } else if (cacheHitRate >= 50) {
      console.log('%c   🟡 Good cache hit rate', 'color: #f59e0b;');
    } else {
      console.log(
        '%c   🔴 Low cache hit rate — review caching strategy',
        'color: #ef4444;'
      );
    }

    console.log('');
    console.log('%c📋 SW-intercepted Resources (top 20):', 'font-weight: bold;');
    console.table(
      swResources.slice(0, 20).map((r) => ({
        'Cache': r.transferSize > 0 ? '🌐 Network' : r.encodedBodySize > 0 ? '✅ Cache' : '❓ Unknown',
        'Transfer (KB)': r.transferSize > 0 ? (r.transferSize / 1024).toFixed(1) : '0',
        'Duration (ms)': r.duration.toFixed(0),
        'Type': r.initiatorType,
        'URL': r.name.length > 60 ? '...' + r.name.slice(-57) : r.name,
      }))
    );
  }

  // Cache Storage inventory
  if (cacheStorage.length > 0) {
    const totalCacheEntries = cacheStorage.reduce((sum, c) => sum + c.entries, 0);
    console.log('');
    console.log('%c💾 Cache Storage:', 'font-weight: bold;');
    for (const { name, entries } of cacheStorage) {
      console.log(`   ├─ "${name}": ${entries} entries`);
    }
    console.log(`   Total entries: ${totalCacheEntries}`);
  }

  console.groupEnd();

  return {
    script: "Service-Worker-Analysis",
    status: "ok",
    count: registrations.length,
    ...(rating !== null && { rating }),
    details: {
      controlled: !!controller,
      controllerState: controller?.state || null,
      swOverheadMs,
      totalResources: resources.length,
      swIntercepted: swResources.length,
      notIntercepted: notIntercepted.length,
      fromCache: fromCache.length,
      fromNetwork: fromNetwork.length,
      fromUnknown: unknownSource.length,
      cacheHitRate,
      savedBytes,
      cacheStorageCount: cacheStorage.length,
      cacheStorage: cacheStorageTop,
    },
    items,
    issues,
  };
})();
