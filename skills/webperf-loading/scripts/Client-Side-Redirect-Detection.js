// Client-Side Redirect Detection
// https://webperf-snippets.nucliweb.net

(async () => {
  const navEntries = performance.getEntriesByType('navigation');

  if (navEntries.length === 0) {
    console.log(
      '%c⚠️ Navigation Timing not available',
      'color: #f59e0b; font-weight: bold;'
    );
    return;
  }

  const navEntry = navEntries[0];
  const currentURL = new URL(window.location.href);
  const resources = performance.getEntriesByType('resource');

  // Check for document navigations (only navigation type, exclude iframes)
  // Filter out third-party iframes (analytics, ads, etc.)
  const documentNavigations = resources.filter(
    (r) => {
      if (r.initiatorType !== 'navigation') return false;

      // Only count same-origin navigations as potential redirects
      try {
        const resourceURL = new URL(r.name);
        return resourceURL.origin === currentURL.origin;
      } catch {
        return false;
      }
    }
  );

  // Check for server-side redirects
  const serverRedirects = navEntry.redirectCount || 0;
  const redirectTime = navEntry.redirectEnd - navEntry.redirectStart;

  // Detect client-side redirect patterns
  const hasSPARouter = !!window.history?.state;
  const historyLength = window.history.length;

  // Check document.referrer for same-origin navigation
  const referrer = document.referrer ? new URL(document.referrer) : null;
  const sameOrigin = referrer && referrer.origin === currentURL.origin;
  const referrerPath = referrer?.pathname || '';
  const currentPath = currentURL.pathname;

  // Detect redirect indicators
  const hasRedirectParam =
    currentURL.searchParams.has('redirect') ||
    currentURL.searchParams.has('from') ||
    currentURL.searchParams.has('origin');

  console.group(
    '%c🔄 Client-Side Redirect Detection',
    'font-weight: bold; font-size: 14px;'
  );

  // Current page info
  console.log('');
  console.log('%c📍 Current Page:', 'font-weight: bold;');
  console.log(`   URL: ${currentURL.href}`);
  console.log(`   Path: ${currentPath}`);
  if (referrer) {
    console.log(`   Referrer: ${referrer.href}`);
    console.log(`   Referrer path: ${referrerPath}`);
  } else {
    console.log('   Referrer: (none - direct navigation or blocked)');
  }

  // Server-side redirects
  console.log('');
  console.log('%c🌐 Server-Side Redirects:', 'font-weight: bold;');
  if (serverRedirects > 0) {
    console.log(`%c   ⚠️ ${serverRedirects} redirect(s) detected`, 'color: #f59e0b;');
    console.log(`   Redirect time: ${redirectTime.toFixed(1)}ms`);
    console.log('   💡 Minimize redirect chains for better performance');
  } else {
    console.log('%c   ✅ No server-side redirects', 'color: #22c55e;');
  }

  // Client-side navigation detection
  console.log('');
  console.log('%c📱 Client-Side Navigation Indicators:', 'font-weight: bold;');

  let hasClientRedirect = false;
  const indicators = [];

  // Check 1: Same-origin referrer with different path (potential redirect)
  if (sameOrigin && referrerPath !== currentPath && referrerPath !== '') {
    hasClientRedirect = true;
    indicators.push({
      type: 'Same-origin navigation',
      from: referrerPath,
      to: currentPath,
      severity: 'warning'
    });
  }

  // Check 2: Document navigations in resource timing
  if (documentNavigations.length > 0) {
    hasClientRedirect = true;
    documentNavigations.forEach((nav) => {
      indicators.push({
        type: 'Document navigation',
        url: nav.name,
        duration: nav.duration.toFixed(1) + 'ms',
        severity: 'error'
      });
    });
  }

  // Check 3: Redirect URL parameters
  if (hasRedirectParam) {
    indicators.push({
      type: 'Redirect parameter in URL',
      params: Array.from(currentURL.searchParams.entries())
        .filter(([key]) =>
          key.toLowerCase().includes('redirect') ||
          key.toLowerCase().includes('from') ||
          key.toLowerCase().includes('origin')
        )
        .map(([key, val]) => `${key}=${val}`)
        .join(', '),
      severity: 'info'
    });
  }

  // Check 4: SPA router state
  if (hasSPARouter && historyLength > 1) {
    indicators.push({
      type: 'SPA router detected',
      historyLength: historyLength,
      state: JSON.stringify(window.history.state)?.slice(0, 100) || '{}',
      severity: 'info'
    });
  }

  // Check 5: Very fast navigation with minimal content (possible JS redirect)
  const navDuration = navEntry.loadEventEnd - navEntry.startTime;
  const domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.startTime;
  const responseSize = navEntry.transferSize || navEntry.encodedBodySize || 0;

  // Only flag if it's BOTH fast AND small (likely a redirect page)
  if (sameOrigin && domContentLoaded < 500 && responseSize < 10000) {
    indicators.push({
      type: 'Fast minimal-content navigation',
      duration: domContentLoaded.toFixed(1) + 'ms',
      size: (responseSize / 1024).toFixed(1) + ' KB',
      note: 'Small page that loads quickly - possible redirect page',
      severity: 'warning'
    });
  }

  if (indicators.length === 0) {
    console.log('%c   ✅ No client-side redirect detected', 'color: #22c55e;');
  } else {
    console.log(
      `%c   ⚠️ ${indicators.length} indicator(s) found`,
      'color: #f59e0b;'
    );
    console.log('');
    indicators.forEach((indicator, index) => {
      const icon =
        indicator.severity === 'error' ? '🔴' :
        indicator.severity === 'warning' ? '⚠️' : 'ℹ️';

      console.log(`   ${icon} ${indicator.type}`);
      Object.entries(indicator).forEach(([key, value]) => {
        if (key !== 'type' && key !== 'severity') {
          console.log(`      ${key}: ${value}`);
        }
      });
      if (index < indicators.length - 1) console.log('');
    });
  }

  // LCP Impact Analysis
  if (hasClientRedirect && documentNavigations.length > 0) {
    console.log('');
    console.log('%c⚡ Performance Impact:', 'font-weight: bold;');

    const totalRedirectOverhead = documentNavigations.reduce(
      (sum, nav) => sum + nav.duration,
      0
    );

    console.log(`   Total redirect overhead: ${totalRedirectOverhead.toFixed(0)}ms`);

    if (totalRedirectOverhead > 3000) {
      console.log(
        '%c   🔴 CRITICAL: High impact on LCP',
        'color: #ef4444; font-weight: bold;'
      );
      console.log('   💡 This redirect adds significant delay to page load');
    } else if (totalRedirectOverhead > 1000) {
      console.log(
        '%c   🟡 MODERATE: Noticeable impact on LCP',
        'color: #f59e0b;'
      );
    } else {
      console.log('%c   🟢 Low impact', 'color: #22c55e;');
    }
  }

  // Recommendations
  const hasDocumentNavigation = documentNavigations.length > 0;
  const hasSameOriginRedirect = sameOrigin && referrerPath !== currentPath && referrerPath !== '';
  const hasHighImpact = hasDocumentNavigation && documentNavigations.reduce((sum, nav) => sum + nav.duration, 0) > 1000;

  if (hasDocumentNavigation || serverRedirects > 0) {
    console.log('');
    console.log('%c💡 Recommendations:', 'font-weight: bold;');

    if (serverRedirects > 0) {
      console.log('');
      console.log('   Server-side redirects detected:');
      console.log('   • Minimize redirect chains');
      console.log('   • Use direct links when possible');
      console.log('   • Cache redirect responses with appropriate headers');
    }

    if (hasDocumentNavigation) {
      console.log('');
      console.log('   Client-side redirect detected:');
      console.log('   • Replace with server-side 301/302 redirects for better performance');

      if (referrerPath && currentPath) {
        console.log('');
        console.log('   Example Nginx config:');
        console.log('     %clocation = ' + referrerPath + ' {', 'color: #3b82f6; font-family: monospace;');
        console.log('     %c  return 301 ' + currentPath + ';', 'color: #3b82f6; font-family: monospace;');
        console.log('     %c}', 'color: #3b82f6; font-family: monospace;');

        if (referrerPath === '/' && currentPath.match(/^\/[a-z]{2}\//)) {
          console.log('');
          console.log('   Or with language detection:');
          console.log('     %cmap $http_accept_language $lang {', 'color: #3b82f6; font-family: monospace;');
          console.log('     %c  default ' + currentPath.split('/')[1] + ';', 'color: #3b82f6; font-family: monospace;');
          console.log('     %c  ~*^en en;', 'color: #3b82f6; font-family: monospace;');
          console.log('     %c}', 'color: #3b82f6; font-family: monospace;');
          console.log('     %clocation = / {', 'color: #3b82f6; font-family: monospace;');
          console.log('     %c  return 301 /$lang/;', 'color: #3b82f6; font-family: monospace;');
          console.log('     %c}', 'color: #3b82f6; font-family: monospace;');
        }
      }
    } else if (hasSameOriginRedirect) {
      console.log('');
      console.log('   Same-origin navigation detected (no document navigation overhead):');
      console.log('   • This may be SPA routing or a fast redirect');
      console.log('   • If this is intentional SPA behavior, no action needed');
      console.log('   • If this is a redirect, consider server-side 301/302 for consistency');
    }
  }

  // Detailed timing breakdown
  console.log('');
  console.log('%c⏱️ Navigation Timing:', 'font-weight: bold;');
  console.table({
    'TTFB': `${(navEntry.responseStart - navEntry.startTime).toFixed(1)}ms`,
    'DOM Content Loaded': `${domContentLoaded.toFixed(1)}ms`,
    'Load Complete': `${navDuration.toFixed(1)}ms`,
    'Redirect Time': serverRedirects > 0 ? `${redirectTime.toFixed(1)}ms` : 'N/A',
    'DNS Lookup': `${(navEntry.domainLookupEnd - navEntry.domainLookupStart).toFixed(1)}ms`,
    'TCP Connect': `${(navEntry.connectEnd - navEntry.connectStart).toFixed(1)}ms`,
    'Request/Response': `${(navEntry.responseEnd - navEntry.requestStart).toFixed(1)}ms`,
  });

  // Resource timing for document navigations
  if (documentNavigations.length > 0) {
    console.log('');
    console.log(
      '%c🔴 Same-Origin Document Navigations Detected (Potential Client-Side Redirects):',
      'font-weight: bold; color: #ef4444;'
    );
    console.log('');
    console.log(
      '   These are same-origin navigations that suggest client-side redirects.'
    );
    console.log(
      '   If these are not expected, consider replacing with server-side redirects.'
    );
    console.log('');
    console.table(
      documentNavigations.map((nav) => ({
        'Type': nav.initiatorType,
        'Duration (ms)': nav.duration.toFixed(1),
        'TTFB (ms)': (nav.responseStart - nav.startTime).toFixed(1),
        'Transfer (KB)': nav.transferSize > 0 ? (nav.transferSize / 1024).toFixed(1) : '0',
        'URL': nav.name.length > 60 ? '...' + nav.name.slice(-57) : nav.name,
      }))
    );
  }

  console.log('');

  if (hasDocumentNavigation) {
    console.log(
      '%cℹ️ Note: Document navigations detected indicate actual client-side redirects. ' +
      'For best performance, replace with server-side 301/302 redirects.',
      'color: #6b7280; font-style: italic;'
    );
  } else if (hasSameOriginRedirect) {
    console.log(
      '%cℹ️ Note: Same-origin navigation detected without document navigation overhead. ' +
      'This may be SPA routing or browser navigation, which is typically acceptable.',
      'color: #6b7280; font-style: italic;'
    );
  } else {
    console.log(
      '%cℹ️ Note: No client-side redirects detected. ' +
      'The current page was loaded directly or through server-side redirects.',
      'color: #6b7280; font-style: italic;'
    );
  }

  console.groupEnd();
})();
