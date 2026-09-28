// Fetch & XHR Timeline — Run in console after page load
// https://webperf-snippets.nucliweb.net

(async () => {
  const calls = window.__perfCalls;

  if (!calls) {
    console.warn(
      "No data found. Make sure the inject snippet is active via DevTools Overrides and reload the page."
    );
    return;
  }

  // Chrome only exposes largest-contentful-paint entries through a PerformanceObserver,
  // so performance.getEntriesByType() returns [] here. Collect via a buffered observer.
  const lcpEntries = await new Promise((resolve) => {
    const entries = [];
    const obs = new PerformanceObserver((list) => entries.push(...list.getEntries()));
    obs.observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => { obs.disconnect(); resolve(entries); }, 100);
  });
  const lcpTime = lcpEntries.length
    ? Math.round(lcpEntries[lcpEntries.length - 1].startTime)
    : window.__lcpTime ?? null;

  const isAuthCall = (url = "") => {
    try {
      const { pathname, searchParams } = new URL(url, location.href);
      const path = pathname.toLowerCase();
      if (/\/(auth|login|logout|token|session|whoami|identity|oauth)/.test(path)) return true;
      if (/(^|\/)me(\/|$)/.test(path)) return true;
      if (searchParams.has("authIndexType") || searchParams.has("authIndexValue")) return true;
      return false;
    } catch {
      return false;
    }
  };

  const isError = (c) =>
    c.status === "ERROR" || (typeof c.status === "number" && c.status >= 400);

  const beforeLCP = lcpTime ? calls.filter((c) => c.end <= lcpTime) : [];
  const afterLCP = lcpTime ? calls.filter((c) => c.end > lcpTime) : calls;
  const errors = calls.filter(isError);
  const bootstrapErrors = errors.filter((c) => !lcpTime || c.end <= lcpTime);
  const postLCPErrors = errors.filter((c) => lcpTime && c.end > lcpTime);
  const authCalls = calls.filter((c) => isAuthCall(c.url));
  const authBeforeLCP = lcpTime ? authCalls.filter((c) => c.end <= lcpTime) : [];

  const row = (c) => ({
    Type: c.type,
    Status: c.status,
    "Start (ms)": c.start,
    "End (ms)": c.end,
    "Duration (ms)": c.duration,
    ...(lcpTime ? { "Before LCP": c.end <= lcpTime ? "⚠️ yes" : "no" } : {}),
    URL: c.url?.length > 80 ? "..." + c.url.slice(-77) : c.url,
  });

  console.group(
    "%c📡 Fetch & XHR Timeline",
    "font-weight: bold; font-size: 14px;"
  );
  console.log("");

  if (lcpTime) {
    console.log(`%cLCP: ${lcpTime}ms`, "font-weight: bold;");
    console.log("");
  } else {
    console.warn("LCP timing not available — before/after LCP analysis skipped. Make sure the inject snippet is active and reload the page.");
    console.log("");
  }

  if (calls.length === 0) {
    console.log(
      "%c✅ No fetch or XHR calls detected during page load",
      "color: #22c55e; font-weight: bold;"
    );
    console.groupEnd();
    return;
  }

  // Summary
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total calls: ${calls.length}`);
  if (lcpTime) {
    console.log(
      `   ${beforeLCP.length > 0 ? "⚠️" : "✅"} Before LCP (critical path candidates): ${beforeLCP.length}`
    );
    console.log(
      `   ✅ After LCP (confirmed non-blocking): ${afterLCP.length}`
    );
  }
  if (bootstrapErrors.length > 0) {
    console.log(`   🔴 Bootstrap errors (before LCP): ${bootstrapErrors.length}`);
  }
  if (postLCPErrors.length > 0) {
    console.log(`   🔴 Errors after LCP: ${postLCPErrors.length}`);
  }
  if (authCalls.length > 0) {
    console.log(
      `   🔑 Auth-related calls: ${authCalls.length}` +
        (authBeforeLCP.length > 0 ? ` — ${authBeforeLCP.length} before LCP ⚠️` : "")
    );
  }

  // Case 1 — API calls blocking LCP
  if (beforeLCP.length > 0) {
    console.log("");
    console.group(
      "%c⚠️ Calls completing before LCP — investigate as critical path blockers",
      "color: #ef4444; font-weight: bold;"
    );
    console.log(
      "%cCalls completing before LCP are candidates for deferral, aggressive caching, or parallelization. If a framework waits for their response before rendering, each one adds directly to LCP.",
      "color: #6b7280;"
    );
    console.table(beforeLCP.map(row));
    console.groupEnd();
  }

  // Case 2 — Bootstrap errors (before LCP)
  if (bootstrapErrors.length > 0) {
    console.log("");
    console.group(
      "%c🔴 Bootstrap errors — failed calls before LCP",
      "color: #ef4444; font-weight: bold;"
    );
    console.log(
      "%cA failed auth check or config endpoint during bootstrap can add hundreds of ms before first paint — even when the error is caught silently.",
      "color: #6b7280;"
    );
    console.table(
      bootstrapErrors.map((c) => ({
        Type: c.type,
        Status: c.status,
        Error: c.error || "-",
        "Start (ms)": c.start,
        "Duration (ms)": c.duration,
        URL: c.url?.length > 80 ? "..." + c.url.slice(-77) : c.url,
      }))
    );
    console.groupEnd();
  }

  if (postLCPErrors.length > 0) {
    console.log("");
    console.group(
      "%c🔴 Failed calls after LCP",
      "color: #ef4444; font-weight: bold;"
    );
    console.table(
      postLCPErrors.map((c) => ({
        Type: c.type,
        Status: c.status,
        Error: c.error || "-",
        "Start (ms)": c.start,
        "Duration (ms)": c.duration,
        URL: c.url?.length > 80 ? "..." + c.url.slice(-77) : c.url,
      }))
    );
    console.groupEnd();
  }

  // Case 4 — Unnecessary auth checks
  if (authCalls.length > 0) {
    console.log("");
    console.group(
      "%c🔑 Auth-related calls — verify these are necessary",
      "color: #f59e0b; font-weight: bold;"
    );
    console.log(
      "%cAuth calls on pages where the user is known to be unauthenticated add latency without value. Cross-reference with your routing guards.",
      "color: #6b7280;"
    );
    console.table(authCalls.map(row));
    console.groupEnd();
  }

  // Case 3 — Complete network inventory
  console.log("");
  console.group("%c📋 Complete network inventory", "font-weight: bold;");
  console.log(
    "%cIncludes cross-origin calls invisible to the Network panel timing data (no Timing-Allow-Origin header).",
    "color: #6b7280;"
  );
  console.table(
    calls
      .sort((a, b) => a.start - b.start)
      .map((c) => ({
        ...row(c),
        Auth: isAuthCall(c.url) ? "🔑" : "-",
      }))
  );
  console.groupEnd();

  console.groupEnd();
})();
