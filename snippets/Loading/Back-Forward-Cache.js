// Back/Forward Cache (bfcache) Analysis
// https://webperf-snippets.nucliweb.net

(async () => {
  // Only what the browser can report is analysed. Several blockers cannot be detected from
  // JavaScript (unload listeners added with addEventListener, open WebSocket, BroadcastChannel
  // or IndexedDB connections). After a back navigation, the NotRestoredReasons API reports
  // the blockers the browser found, including those of embedded frames.
  const results = {
    supported: 'PerformanceNavigationTiming' in window,
    wasRestored: false,
    eligibility: null,
    blockingReasons: [],
    notRestoredReasons: null,
    recommendations: [],
  };

  // A pageshow event with persisted = true is the only reliable sign of a bfcache restore
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      results.wasRestored = true;
      console.log(
        '%c⚡ Page restored from bfcache!',
        'color: #22c55e; font-weight: bold; font-size: 14px;'
      );
    }
  });

  const REASON_HELP = {
    'unload-listener': 'unload event listeners block bfcache. Use pagehide or visibilitychange instead.',
    'response-cache-control-no-store': 'Cache-Control: no-store on the page response prevents caching. Use no-cache instead.',
    'websocket': 'Open WebSocket connections prevent bfcache. Close them on pagehide.',
    'broadcastchannel': 'Open BroadcastChannel instances prevent bfcache. Close them on pagehide.',
    'indexeddb-connection': 'Open IndexedDB connections prevent bfcache. Close them on pagehide.',
    'masked': 'The browser does not disclose the exact reason (for example, a cross-origin frame).',
  };

  const serializeReasons = (node) =>
    node && {
      url: node.url ?? null,
      src: node.src ?? null,
      id: node.id ?? null,
      name: node.name ?? null,
      // Each entry is a NotRestoredReasonDetails object with a reason property
      // (plain strings are accepted as well)
      reasons: (node.reasons || []).map((r) => (typeof r === 'string' ? r : r?.reason)).filter(Boolean),
      children: (node.children || []).map(serializeReasons),
    };

  const flattenReasons = (node, frame) => [
    ...node.reasons.map((reason) => ({ reason, frame })),
    ...node.children.flatMap((child, i) =>
      flattenReasons(child, child.src || child.url || child.name || child.id || `iframe ${i + 1}`)
    ),
  ];

  const analyze = async () => {
    const issues = [];
    const navEntry = performance.getEntriesByType('navigation')[0];

    // 1. Blockers reported by the browser (after a back/forward navigation)
    results.notRestoredReasons = serializeReasons(navEntry?.notRestoredReasons);
    const confirmed = results.notRestoredReasons
      ? flattenReasons(results.notRestoredReasons, results.notRestoredReasons.url || 'main frame')
      : [];
    confirmed.forEach(({ reason, frame }) => {
      issues.push({
        reason: `${reason} (${frame})`,
        severity: 'high',
        source: 'browser',
        description: REASON_HELP[reason.toLowerCase()] || 'Reported by the browser as a bfcache blocker',
      });
    });

    // 2. unload handler assigned as a property. Listeners added with addEventListener
    // cannot be detected from JavaScript.
    if (window.onunload !== null && !confirmed.some(({ reason }) => reason === 'unload-listener')) {
      issues.push({
        reason: 'window.onunload handler set',
        severity: 'high',
        source: 'detected',
        description: REASON_HELP['unload-listener'],
      });
    }

    // 3. Cache-Control: no-store on the page response. A HEAD request to the current URL
    // exposes the header; the value can differ from the original navigation.
    if (/^https?:$/.test(location.protocol)) {
      try {
        const res = await fetch(location.href, { method: 'HEAD', credentials: 'same-origin' });
        const cacheControl = res.headers.get('cache-control') || '';
        if (/no-store/i.test(cacheControl) && !confirmed.some(({ reason }) => reason === 'response-cache-control-no-store')) {
          issues.push({
            reason: 'Cache-Control: no-store on the page response',
            severity: 'medium',
            source: 'detected',
            description: REASON_HELP['response-cache-control-no-store'],
          });
        }
      } catch {
        // The header could not be read; nothing is reported
      }
    }

    // 4. Context that is worth knowing but is not a blocker by itself
    const iframeCount = document.querySelectorAll('iframe').length;
    if (iframeCount > 0) {
      issues.push({
        reason: `${iframeCount} iframe(s) on the page`,
        severity: 'info',
        source: 'note',
        description: 'A bfcache blocker inside an iframe blocks the whole page. See notRestoredReasons after a back navigation.',
      });
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      issues.push({
        reason: 'Service Worker controls the page',
        severity: 'info',
        source: 'note',
        description: 'Service Workers are compatible with bfcache.',
      });
    }

    results.blockingReasons = issues;
    results.recommendations = [
      ...new Set(
        issues
          .filter((i) => i.severity !== 'info')
          .map((i) => i.description)
      ),
    ];

    if (issues.some((i) => i.source === 'browser')) {
      results.eligibility = 'blocked';
    } else if (issues.some((i) => i.source === 'detected')) {
      results.eligibility = 'likely-blocked';
    } else {
      results.eligibility = 'no-blockers-detected';
    }

    return results.eligibility;
  };

  const printReasons = (node, indent) => {
    const pad = ' '.repeat(indent);
    node.reasons.forEach((reason) => {
      console.log(`${pad}• ${reason}`);
      const help = REASON_HELP[reason.toLowerCase()];
      if (help) console.log(`${pad}  💡 ${help}`);
    });
    node.children.forEach((child, i) => {
      console.log(`${pad}Frame: ${child.src || child.url || child.name || child.id || `iframe ${i + 1}`}`);
      printReasons(child, indent + 3);
    });
  };

  const displayResults = () => {
    const statusIcons = { 'no-blockers-detected': '🟢', 'likely-blocked': '🟠', blocked: '🔴' };
    const statusColors = { 'no-blockers-detected': '#22c55e', 'likely-blocked': '#fb923c', blocked: '#ef4444' };
    const statusText = {
      'no-blockers-detected': 'No blockers detected',
      'likely-blocked': 'Likely blocked',
      blocked: 'Blocked (reported by the browser)',
    };

    console.group(
      `%c${statusIcons[results.eligibility] || '⚪'} bfcache: ${statusText[results.eligibility] || 'Unknown'}`,
      `color: ${statusColors[results.eligibility] || '#6b7280'}; font-weight: bold; font-size: 14px;`
    );

    const navEntry = performance.getEntriesByType('navigation')[0];
    console.log('');
    console.log('%c📊 Status:', 'font-weight: bold;');
    if (results.wasRestored) {
      console.log('%c   ✅ This page was restored from bfcache', 'color: #22c55e;');
    } else if (navEntry?.type === 'back_forward') {
      console.log('   ℹ️  This page was loaded by a back/forward navigation, not restored from bfcache');
    } else {
      console.log('   ℹ️  This page was loaded normally. Restoration is reported by a pageshow event.');
    }
    if (navEntry) console.log(`   Navigation type: ${navEntry.type}`);

    if (results.blockingReasons.length > 0) {
      console.log('');
      console.log('%c🔍 Findings:', 'font-weight: bold;');
      console.table(
        results.blockingReasons.map((i) => ({
          Severity: i.severity.toUpperCase(),
          Finding: i.reason,
          Detail: i.description,
        }))
      );
    } else {
      console.log('');
      console.log('%c✅ No bfcache blockers detected', 'color: #22c55e; font-weight: bold;');
    }

    if (results.notRestoredReasons) {
      console.log('');
      console.group('%c🔬 NotRestoredReasons (reported by the browser)', 'font-weight: bold; color: #3b82f6;');
      if (results.notRestoredReasons.reasons.length === 0 && results.notRestoredReasons.children.length === 0) {
        console.log('   No reasons reported');
      }
      printReasons(results.notRestoredReasons, 3);
      console.groupEnd();
    }

    console.log('');
    console.log(
      '%cNot every blocker is detectable from JavaScript: unload listeners added with addEventListener and open WebSocket, BroadcastChannel or IndexedDB connections only show up in NotRestoredReasons after a back navigation, or in DevTools → Application → Back/forward cache.',
      'color: #6b7280;'
    );

    if (results.recommendations.length > 0) {
      console.log('');
      console.log('%c💡 Recommendations:', 'color: #3b82f6; font-weight: bold;');
      results.recommendations.forEach((rec, idx) => console.log(`   ${idx + 1}. ${rec}`));
    }

    console.log('');
    console.log('%c🧪 How to test:', 'font-weight: bold;');
    console.log('   1. Navigate to another page');
    console.log('   2. Click the browser Back button');
    console.log('   3. Run this snippet again to read NotRestoredReasons, or use DevTools → Application → Back/forward cache');

    console.groupEnd();
  };

  const buildResult = () => ({
    script: 'Back-Forward-Cache',
    status: 'ok',
    details: {
      eligibility: results.eligibility,
      wasRestored: results.wasRestored,
      supported: results.supported,
      navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
      notRestoredReasons: results.notRestoredReasons,
    },
    issues: results.blockingReasons.map((i) => ({
      severity: i.severity === 'high' ? 'error' : i.severity === 'medium' ? 'warning' : 'info',
      message: i.reason,
    })),
  });

  // Expose function for manual check
  window.checkBfcache = async () => {
    await analyze();
    displayResults();
    return buildResult();
  };

  console.log('%c🚀 bfcache Analysis', 'font-weight: bold; font-size: 14px;');
  console.log(
    '   Call %ccheckBfcache()%c anytime to re-run analysis.',
    'font-family: monospace; background: #f3f4f6; padding: 2px 4px;',
    ''
  );

  await analyze();
  displayResults();
  return {
    ...buildResult(),
    message: 'bfcache analysis complete. Call checkBfcache() to re-run analysis.',
  };
})();
