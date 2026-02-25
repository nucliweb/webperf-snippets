// Back/Forward Cache (bfcache) Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const results = {
    supported: 'PerformanceNavigationTiming' in window,
    wasRestored: false,
    eligibility: null,
    blockingReasons: [],
    recommendations: [],
  };

  // Check if current page was restored from bfcache
  const checkRestoration = () => {
    // Check via pageshow event
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        results.wasRestored = true;
        console.log(
          '%c⚡ Page restored from bfcache!',
          'color: #22c55e; font-weight: bold; font-size: 14px;'
        );
        console.log('   Navigation was instant (0ms)');
      }
    });

    // Check via Performance Navigation Timing
    if (results.supported) {
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry && navEntry.type === 'back_forward') {
        // Check activation timing for bfcache restore
        if (navEntry.activationStart > 0) {
          results.wasRestored = true;
        }
      }
    }
  };

  // Test bfcache eligibility
  const testEligibility = () => {
    const issues = [];
    const recs = [];

    // 1. Check for unload handlers
    const hasUnload = window.onunload !== null || window.onbeforeunload !== null;
    if (hasUnload) {
      issues.push({
        reason: 'unload/beforeunload handler detected',
        severity: 'high',
        description: 'These handlers block bfcache',
      });
      recs.push('Remove unload/beforeunload handlers. Use pagehide or visibilitychange instead.');
    }

    // 2. Check for Cache-Control: no-store
    // Note: Can't check response headers from JS, but we can detect it indirectly
    const meta = document.querySelector('meta[http-equiv="Cache-Control"]');
    if (meta && meta.content.includes('no-store')) {
      issues.push({
        reason: 'Cache-Control: no-store in meta tag',
        severity: 'high',
        description: 'Prevents page from being cached',
      });
      recs.push('Remove Cache-Control: no-store or change to no-cache.');
    }

    // 3. Check for open IndexedDB connections
    if (window.indexedDB) {
      // Can't directly check open connections, but we can warn
      const hasIndexedDB = performance.getEntriesByType('resource').some(
        r => r.name.includes('indexedDB')
      );
      if (hasIndexedDB) {
        issues.push({
          reason: 'IndexedDB may be in use',
          severity: 'medium',
          description: 'Open IndexedDB transactions block bfcache',
        });
        recs.push('Close IndexedDB connections before page hide.');
      }
    }

    // 4. Check for broadcast channels
    // Can't directly detect, but can check if BroadcastChannel exists
    if (window.BroadcastChannel) {
      // Just a warning - we can't detect if actually in use
      issues.push({
        reason: 'BroadcastChannel API available (check if in use)',
        severity: 'low',
        description: 'Open BroadcastChannel connections may block bfcache',
      });
    }

    // 5. Check for embedded iframes with issues
    const iframes = document.querySelectorAll('iframe');
    if (iframes.length > 0) {
      issues.push({
        reason: `${iframes.length} iframe(s) detected`,
        severity: 'medium',
        description: 'Iframes with bfcache blockers will block parent page',
      });
      recs.push('Ensure iframes are also bfcache compatible.');
    }

    // 6. Check for Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Service workers are OK, but just noting it
      issues.push({
        reason: 'Service Worker active',
        severity: 'info',
        description: 'Service Workers with fetch handlers are generally OK, but check for ongoing operations',
      });
    }

    // 7. Check for open WebSocket/WebRTC
    // Can't directly detect, but we can check for common libraries
    if (window.WebSocket) {
      issues.push({
        reason: 'WebSocket API available (check if connections are open)',
        severity: 'medium',
        description: 'Open WebSocket connections block bfcache',
      });
      recs.push('Close WebSocket connections before page hide.');
    }

    // 8. Check for ongoing fetch/XHR
    // Check if there are active resource requests
    const resources = performance.getEntriesByType('resource');
    const recent = resources.filter(r => r.responseEnd === 0 || (performance.now() - r.responseEnd < 100));
    if (recent.length > 0) {
      issues.push({
        reason: `${recent.length} recent/ongoing network requests`,
        severity: 'low',
        description: 'Ongoing requests may prevent bfcache',
      });
      recs.push('Ensure requests complete or are aborted on page hide.');
    }

    results.blockingReasons = issues;
    results.recommendations = recs;

    // Determine eligibility
    const highSeverity = issues.filter(i => i.severity === 'high').length;
    const mediumSeverity = issues.filter(i => i.severity === 'medium').length;

    if (highSeverity > 0) {
      results.eligibility = 'blocked';
    } else if (mediumSeverity > 1) {
      results.eligibility = 'likely-blocked';
    } else if (issues.length > 0) {
      results.eligibility = 'potentially-eligible';
    } else {
      results.eligibility = 'likely-eligible';
    }

    return results.eligibility;
  };

  // Display results
  const displayResults = () => {
    const statusIcons = {
      'likely-eligible': '🟢',
      'potentially-eligible': '🟡',
      'likely-blocked': '🟠',
      'blocked': '🔴',
    };

    const statusColors = {
      'likely-eligible': '#22c55e',
      'potentially-eligible': '#f59e0b',
      'likely-blocked': '#fb923c',
      'blocked': '#ef4444',
    };

    const statusText = {
      'likely-eligible': 'Likely Eligible',
      'potentially-eligible': 'Potentially Eligible',
      'likely-blocked': 'Likely Blocked',
      'blocked': 'Blocked',
    };

    const icon = statusIcons[results.eligibility] || '⚪';
    const color = statusColors[results.eligibility] || '#6b7280';
    const text = statusText[results.eligibility] || 'Unknown';

    console.group(
      `%c${icon} bfcache Status: ${text}`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    console.log('');
    console.log('%c📊 Status:', 'font-weight: bold;');

    if (results.wasRestored) {
      console.log('%c   ✅ This page WAS restored from bfcache', 'color: #22c55e;');
      console.log('      Navigation was instant!');
    } else {
      console.log('   ℹ️  This page was NOT restored from bfcache');
      console.log('      (Either first visit or bfcache was blocked on previous navigation)');
    }

    // Navigation timing comparison
    if (results.supported) {
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry) {
        console.log('');
        console.log('%c🕐 Navigation Timing:', 'font-weight: bold;');
        console.log(`   Type: ${navEntry.type}`);
        console.log(`   Duration: ${Math.round(navEntry.duration)}ms`);

        if (navEntry.type === 'back_forward') {
          if (navEntry.duration < 10) {
            console.log('%c   ⚡ Fast back/forward (likely from bfcache)', 'color: #22c55e;');
          } else {
            console.log('%c   🐌 Slow back/forward (full reload)', 'color: #ef4444;');
          }
        }
      }
    }

    // Display issues
    if (results.blockingReasons.length > 0) {
      console.log('');
      console.log('%c🔍 Potential Issues:', 'font-weight: bold;');

      const issueTable = results.blockingReasons.map(issue => ({
        Severity: issue.severity.toUpperCase(),
        Issue: issue.reason,
        Impact: issue.description,
      }));

      console.table(issueTable);
    } else {
      console.log('');
      console.log('%c✅ No obvious bfcache blockers detected!', 'color: #22c55e; font-weight: bold;');
    }

    // Recommendations
    if (results.recommendations.length > 0) {
      console.log('');
      console.log('%c💡 Recommendations:', 'color: #3b82f6; font-weight: bold;');
      results.recommendations.forEach((rec, idx) => {
        console.log(`   ${idx + 1}. ${rec}`);
      });
    }

    // How to test
    console.log('');
    console.log('%c🧪 How to Test:', 'font-weight: bold;');
    console.log('%c   IMPORTANT: Run snippet BEFORE navigating away!', 'color: #f59e0b;');
    console.log('');
    console.log('   1. Run this snippet (you already did this ✓)');
    console.log('   2. Navigate to another page');
    console.log('   3. Click browser Back button');
    console.log('   4. Check console for restoration message');
    console.log('');
    console.log('   Or use Chrome DevTools → Application → Back/forward cache');

    console.groupEnd();

    return results;
  };

  // Check for NotRestoredReasons API (Chrome 123+)
  const checkNotRestoredReasons = () => {
    if (!('PerformanceNavigationTiming' in window)) {
      return null;
    }

    const navEntry = performance.getEntriesByType('navigation')[0];
    if (!navEntry || !navEntry.notRestoredReasons) {
      return null;
    }

    console.group('%c🔬 Not Restored Reasons (Chrome 123+)', 'font-weight: bold; color: #3b82f6;');

    const reasons = navEntry.notRestoredReasons;

    console.log('');
    console.log('%cPage-level information:', 'font-weight: bold;');

    if (reasons.blocked === true) {
      console.log('%c   ❌ Page was blocked from bfcache', 'color: #ef4444;');
    } else {
      console.log('%c   ✅ Page was not blocked', 'color: #22c55e;');
    }

    if (reasons.url) {
      console.log(`   URL: ${reasons.url}`);
    }

    if (reasons.id) {
      console.log(`   Frame ID: ${reasons.id}`);
    }

    if (reasons.name) {
      console.log(`   Frame name: ${reasons.name}`);
    }

    if (reasons.src) {
      console.log(`   Source: ${reasons.src}`);
    }

    // Parse NotRestoredReasonDetails array
    // Each entry is an object with { reason: string, source: string }
    // Common reasons: "WebSocket", "unload-listener", "IndexedDB", etc.
    // Sources: "JavaScript", "UserAgentOnly", etc.
    if (reasons.reasons && reasons.reasons.length > 0) {
      console.log('');
      console.log('%cBlocking reasons:', 'font-weight: bold; color: #ef4444;');

      reasons.reasons.forEach((reasonDetail, idx) => {
        // reasonDetail is a NotRestoredReasonDetails object
        const reasonName = reasonDetail.reason || 'Unknown reason';
        const reasonSource = reasonDetail.source || 'Unknown source';

        console.group(`   ${idx + 1}. ${reasonName}`);

        // Show detailed information
        console.log(`      Reason: ${reasonName}`);
        console.log(`      Source: ${reasonSource}`);

        // Add helpful context for common reasons
        const reasonExplanations = {
          'WebSocket': 'Open WebSocket connections prevent bfcache. Close them on pagehide event.',
          'unload-listener': 'unload event listeners block bfcache. Use pagehide or visibilitychange instead.',
          'response-cache-control-no-store': 'Cache-Control: no-store header prevents caching. Change to no-cache.',
          'IndexedDB': 'Open IndexedDB transactions block bfcache. Close connections on pagehide.',
          'BroadcastChannel': 'Open BroadcastChannel prevents bfcache. Close it on pagehide.',
          'dedicated-worker': 'Dedicated workers can block bfcache. Terminate them on pagehide.',
        };

        if (reasonExplanations[reasonName]) {
          console.log(`      💡 ${reasonExplanations[reasonName]}`);
        }

        console.groupEnd();
      });
    }

    // Check children (iframes)
    if (reasons.children && reasons.children.length > 0) {
      console.log('');
      console.log('%cEmbedded frames:', 'font-weight: bold;');

      reasons.children.forEach((child, idx) => {
        console.group(`   ${idx + 1}. ${child.url || child.src || 'iframe'}`);

        if (child.blocked) {
          console.log('%c      Status: BLOCKED', 'color: #ef4444;');
        } else {
          console.log('%c      Status: OK', 'color: #22c55e;');
        }

        if (child.id) {
          console.log(`      Frame ID: ${child.id}`);
        }

        if (child.name) {
          console.log(`      Frame name: ${child.name}`);
        }

        if (child.reasons && child.reasons.length > 0) {
          console.log('      Blocking reasons:');
          child.reasons.forEach(reasonDetail => {
            console.log(`        • ${reasonDetail.reason || 'Unknown'}`);
            if (reasonDetail.source) {
              console.log(`          Source: ${reasonDetail.source}`);
            }
          });
        }

        console.groupEnd();
      });
    }

    // Summary table for easier visualization
    if (reasons.reasons && reasons.reasons.length > 0) {
      console.log('');
      console.log('%c📋 Summary Table:', 'font-weight: bold;');

      const reasonsTable = reasons.reasons.map(r => ({
        Reason: r.reason || 'Unknown',
        Source: r.source || 'N/A',
      }));

      console.table(reasonsTable);
    }

    console.groupEnd();
    return reasons;
  };

  // Check if snippet was executed after a back/forward navigation
  const checkExecutionTiming = () => {
    const navEntry = performance.getEntriesByType('navigation')[0];
    if (navEntry && navEntry.type === 'back_forward') {
      console.log('');
      console.group('%c⚠️  Timing Warning', 'color: #f59e0b; font-weight: bold;');
      console.log('%cSnippet executed AFTER back/forward navigation.', 'color: #f59e0b;');
      console.log('');
      console.log('For complete analysis including bfcache restoration detection:');
      console.log('   1. Run this snippet FIRST');
      console.log('   2. Then navigate away');
      console.log('   3. Then click Back button');
      console.log('');
      console.log('Current analysis shows NotRestoredReasons from the navigation that just occurred.');
      console.groupEnd();
      console.log('');
    }
  };

  // Initialize
  checkRestoration();
  const eligibility = testEligibility();

  // Display after a short delay to ensure pageshow event fires
  setTimeout(() => {
    checkExecutionTiming();
    displayResults();

    // Check NotRestoredReasons API if available
    const notRestoredReasons = checkNotRestoredReasons();
    if (!notRestoredReasons) {
      console.log('');
      console.log('%cℹ️  For detailed reasons, use Chrome 123+ and navigate back to this page.', 'color: #6b7280;');
    }
  }, 100);

  // Expose function for manual check
  window.checkBfcache = () => {
    testEligibility();
    displayResults();
    checkNotRestoredReasons();
    return results;
  };

  console.log('%c🚀 bfcache Analysis Running...', 'font-weight: bold; font-size: 14px;');
  console.log('   Results will appear shortly.');
  console.log(
    '   Call %ccheckBfcache()%c anytime to re-run analysis.',
    'font-family: monospace; background: #f3f4f6; padding: 2px 4px;',
    ''
  );
})();
