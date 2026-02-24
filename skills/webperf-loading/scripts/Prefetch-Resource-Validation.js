// Prefetch Resource Validation
// https://webperf-snippets.nucliweb.net

(() => {
  // Get all prefetch hints
  const prefetchLinks = Array.from(document.querySelectorAll('link[rel="prefetch"]'));

  if (prefetchLinks.length === 0) {
    // Early return is safe here - console.group hasn't been opened yet
    console.log(
      '%c✅ No prefetch hints found (rel="prefetch").',
      "color: #22c55e; font-weight: bold;",
    );
    console.log(
      "%cℹ️ Prefetch is for future navigation resources. Use it sparingly for predictable user journeys.",
      "color: #3b82f6;",
    );
    return;
  }

  // Get performance entries for all resources
  const performanceEntries = performance.getEntriesByType("resource");

  // Pre-normalize URLs for efficient matching (avoids repeated URL parsing in nested loops)
  const entryUrlMap = new Map();
  performanceEntries.forEach((entry) => {
    try {
      const normalizedUrl = new URL(entry.name, location.origin).href;
      if (!entryUrlMap.has(normalizedUrl)) {
        entryUrlMap.set(normalizedUrl, []);
      }
      entryUrlMap.get(normalizedUrl).push(entry);
    } catch {
      // Ignore malformed URLs in performance entries
    }
  });

  // Valid 'as' attribute values for prefetch (per HTML spec)
  const validAsValues = new Set([
    "script",
    "style",
    "font",
    "image",
    "video",
    "audio",
    "document",
    "fetch",
    "track",
    "worker",
    // Note: "media" is not a valid spec value, use "video" or "audio" instead
  ]);

  // Thresholds
  const THRESHOLDS = {
    maxCount: 10,
    largeFileSize: 500 * 1024, // 500KB
    largeScriptSize: 1024 * 1024, // 1MB for scripts specifically
    totalSizeWarning: 2 * 1024 * 1024, // 2MB
    totalSizeCritical: 5 * 1024 * 1024, // 5MB
  };

  // Analyze each prefetch
  const issues = [];
  const validPrefetch = [];
  const seenUrls = new Set(); // Track duplicates
  let totalSize = 0;
  let totalTransferSize = 0;

  prefetchLinks.forEach((link) => {
    const href = link.href;
    const as = link.getAttribute("as") || "unknown";
    // Extract filename from URL; fallback to full href if URL is just origin
    // Note: Removes query params but preserves hash (e.g., page#section)
    const shortUrl = href.split("/").pop()?.split("?")[0]?.split("#")[0] || href;

    // Normalize URL for matching
    let normalizedUrl;
    try {
      normalizedUrl = new URL(href, location.origin).href;
    } catch {
      // Invalid href - will be caught later
      normalizedUrl = href;
    }

    // Find matching performance entries using pre-built map
    const matchingEntries = entryUrlMap.get(normalizedUrl) || [];
    const perfEntry = matchingEntries[0]; // Use first matching entry

    const analysis = {
      link,
      href,
      shortUrl,
      as,
      size: 0,
      transferSize: 0,
      duration: 0,
      loaded: false,
      isCurrentPage: false,
      warnings: [],
    };

    // Check for missing or invalid 'as' attribute
    if (as === "unknown") {
      analysis.warnings.push({
        type: "missing-as",
        severity: "warning",
        message: "Missing 'as' attribute - browser cannot apply correct MIME type matching",
      });
    } else if (!validAsValues.has(as)) {
      analysis.warnings.push({
        type: "invalid-as",
        severity: "warning",
        message: `Invalid 'as' value: "${as}" - should be one of: ${Array.from(validAsValues).join(", ")}`,
      });
    }

    // Check for duplicate prefetch
    if (seenUrls.has(normalizedUrl)) {
      analysis.warnings.push({
        type: "duplicate-prefetch",
        severity: "warning",
        message: "Duplicate prefetch - this URL is prefetched multiple times",
      });
    }
    seenUrls.add(normalizedUrl);

    // Check if resource was actually loaded
    if (perfEntry) {
      analysis.loaded = true;
      analysis.size = perfEntry.decodedBodySize || 0;
      analysis.transferSize = perfEntry.transferSize || 0;
      analysis.duration = perfEntry.duration || 0;

      // Cache status detection with CORS considerations
      // transferSize === 0 can mean: (1) cached, or (2) cross-origin without Timing-Allow-Origin
      if (perfEntry.encodedBodySize > 0 && perfEntry.transferSize === 0) {
        analysis.cacheStatus = "cached";
      } else if (perfEntry.encodedBodySize === 0 && perfEntry.transferSize === 0) {
        // Both zero = likely CORS-blocked timing info
        analysis.cacheStatus = "unknown (CORS)";
      } else {
        analysis.cacheStatus = "network";
      }

      totalSize += analysis.size;
      totalTransferSize += analysis.transferSize;

      // Check if it's a current page resource
      // Uses 5s heuristic: resources loaded in first 5s are likely for current page, not prefetch
      // This cutoff works for most pages but may flag slow pages incorrectly
      const isCurrentPageResource = matchingEntries.some(
        (entry) => entry.initiatorType !== "link" && entry.startTime < 5000,
      );

      if (isCurrentPageResource) {
        analysis.isCurrentPage = true;
        analysis.warnings.push({
          type: "wrong-hint",
          severity: "error",
          message: "Resource used on current page - should use preload instead",
        });
      }

      // Check file size
      if (analysis.size > THRESHOLDS.largeFileSize) {
        const sizeMB = (analysis.size / (1024 * 1024)).toFixed(2);
        analysis.warnings.push({
          type: "large-file",
          severity: "warning",
          message: `Large file (${sizeMB}MB) - consider if prefetch is appropriate`,
        });
      }

      // Check resource type appropriateness (size-based)
      // Note: Only checks if resource has loaded (has perfEntry with size)
      let isInappropriate = false;
      let inappropriateReason = "";

      if (as === "video" || as === "audio") {
        isInappropriate = true;
        inappropriateReason = "Video/audio files are typically too large for prefetch";
      } else if (as === "image" && analysis.size > 200 * 1024) {
        isInappropriate = true;
        inappropriateReason = `Image is ${(analysis.size / 1024).toFixed(0)}KB (>200KB threshold)`;
      } else if (as === "script" && analysis.size > THRESHOLDS.largeScriptSize) {
        isInappropriate = true;
        inappropriateReason = `Script is ${(analysis.size / 1024).toFixed(0)}KB (>1MB threshold)`;
      }

      if (isInappropriate) {
        analysis.warnings.push({
          type: "inappropriate-type",
          severity: "warning",
          message: `Type "${as}" may not be suitable for prefetch: ${inappropriateReason}`,
        });
      }
    } else {
      // Prefetch defined but not loaded yet (or failed)
      analysis.warnings.push({
        type: "not-loaded",
        severity: "info",
        message: "Not loaded yet or failed to load",
      });
    }

    // Categorize
    if (analysis.warnings.length > 0) {
      issues.push(analysis);
    } else {
      validPrefetch.push(analysis);
    }
  });

  // Check total count
  const countIssues = [];
  if (prefetchLinks.length > THRESHOLDS.maxCount) {
    countIssues.push({
      type: "excessive-count",
      severity: "warning",
      message: `${prefetchLinks.length} prefetch hints found (recommended: <${THRESHOLDS.maxCount})`,
      explanation: "Excessive prefetch can waste bandwidth, especially on mobile networks",
    });
  }

  // Check total size
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  const totalTransferMB = (totalTransferSize / (1024 * 1024)).toFixed(2);

  if (totalSize > THRESHOLDS.totalSizeCritical) {
    countIssues.push({
      type: "excessive-size",
      severity: "error",
      message: `Total prefetch size: ${totalSizeMB}MB (critical threshold exceeded)`,
      explanation: "This is very high and will significantly impact mobile users",
    });
  } else if (totalSize > THRESHOLDS.totalSizeWarning) {
    countIssues.push({
      type: "high-size",
      severity: "warning",
      message: `Total prefetch size: ${totalSizeMB}MB (warning threshold exceeded)`,
      explanation: "Consider reducing prefetch to improve mobile experience",
    });
  }

  // Display results
  console.group("%c🔍 Prefetch Resource Validation", "font-weight: bold; font-size: 14px;");

  // Count actually loaded resources
  const loadedCount = [...issues, ...validPrefetch].filter((item) => item.loaded).length;

  // Count meaningful issues (exclude "info" severity)
  const meaningfulIssues = issues.filter((i) =>
    i.warnings.some((w) => w.severity === "error" || w.severity === "warning"),
  );
  const totalMeaningfulIssues = meaningfulIssues.length + countIssues.length;

  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total prefetch hints: ${prefetchLinks.length}`);
  console.log(`   Loaded resources: ${loadedCount}`);
  console.log(`   Total size: ${totalSizeMB} MB (decompressed)`);
  console.log(`   Transfer size: ${totalTransferMB} MB (over network)`);
  console.log(`   Issues found: ${totalMeaningfulIssues} (excluding "not loaded" info)`);

  // Show count/size issues first
  if (countIssues.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Overall Issues (${countIssues.length})`,
      "color: #ef4444; font-weight: bold;",
    );

    countIssues.forEach((issue) => {
      const color = issue.severity === "error" ? "#ef4444" : "#f59e0b";
      const icon = issue.severity === "error" ? "🔴" : "⚠️";
      console.log("");
      console.log(`%c${icon} ${issue.message}`, `color: ${color}; font-weight: bold;`);
      console.log(`   ${issue.explanation}`);
    });

    console.groupEnd();
  }

  // Show resource-specific issues
  const errors = issues.filter((i) => i.warnings.some((w) => w.severity === "error"));
  const warnings = issues.filter(
    (i) =>
      !i.warnings.some((w) => w.severity === "error") &&
      i.warnings.some((w) => w.severity === "warning"),
  );
  const infos = issues.filter((i) => i.warnings.every((w) => w.severity === "info"));

  if (errors.length > 0) {
    console.log("");
    console.group(`%c🔴 Critical Issues (${errors.length})`, "color: #ef4444; font-weight: bold;");

    const errorTable = errors.map((item) => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Issue: item.warnings.map((w) => w.message).join("; "),
    }));

    console.table(errorTable);

    console.log("");
    console.log("%cDetails:", "font-weight: bold;");
    errors.forEach((item, i) => {
      console.log("");
      console.log(`%c${i + 1}. ${item.shortUrl}`, "font-weight: bold;");
      console.log(`   URL: ${item.href}`);
      console.log(`   Type: ${item.as}`);
      if (item.size > 0) {
        console.log(`   Size: ${(item.size / 1024).toFixed(1)} KB`);
      }
      item.warnings.forEach((w) => {
        console.log(`   ❌ ${w.message}`);
      });
      console.log("   Element:", item.link);
    });

    console.groupEnd();
  }

  if (warnings.length > 0) {
    console.log("");
    console.group(`%c⚠️ Warnings (${warnings.length})`, "color: #f59e0b; font-weight: bold;");

    const warningTable = warnings.map((item) => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Issue: item.warnings.map((w) => w.message).join("; "),
    }));

    console.table(warningTable);

    console.groupEnd();
  }

  if (infos.length > 0) {
    console.log("");
    console.group(`%cℹ️ Info (${infos.length})`, "color: #3b82f6; font-weight: bold;");

    const infoTable = infos.map((item) => ({
      Resource: item.shortUrl,
      Type: item.as,
      Status: item.warnings.map((w) => w.message).join("; "),
    }));

    console.table(infoTable);

    console.groupEnd();
  }

  // Show valid prefetch
  if (validPrefetch.length > 0) {
    console.log("");
    console.group(
      `%c✅ Valid Prefetch (${validPrefetch.length})`,
      "color: #22c55e; font-weight: bold;",
    );

    const validTable = validPrefetch.map((item) => ({
      Resource: item.shortUrl,
      Type: item.as,
      Size: item.size > 0 ? `${(item.size / 1024).toFixed(1)} KB` : "Unknown",
      Duration: item.duration > 0 ? `${item.duration.toFixed(0)} ms` : "N/A",
      Status: item.loaded ? "✅ Loaded" : "Pending",
      Cache: item.cacheStatus || "N/A",
    }));

    console.table(validTable);

    console.groupEnd();
  }

  // Best practices
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%c✅ Good uses of prefetch:", "font-weight: bold; color: #22c55e;");
  console.log("   • Next page chunks in predictable navigation (e.g., multi-step forms)");
  console.log("   • Fonts used on commonly visited next pages");
  console.log("   • Small scripts/styles for main navigation targets");
  console.log("   • Resources based on user behavior analytics");
  console.log("");
  console.log("%c❌ Bad uses of prefetch:", "font-weight: bold; color: #ef4444;");
  console.log("   • Resources needed on current page (use preload instead)");
  console.log("   • Large images/videos without user intent analysis");
  console.log("   • Excessive prefetch (>10 resources) hurting mobile users");
  console.log("   • Resources without proper cache headers");
  console.log("");
  console.log("%cRecommended thresholds:", "font-weight: bold;");
  console.log(`   • Resource count: <${THRESHOLDS.maxCount} resources`);
  console.log(`   • Individual file size: <${THRESHOLDS.largeFileSize / 1024} KB`);
  console.log(`   • Total prefetch size: <${THRESHOLDS.totalSizeWarning / (1024 * 1024)} MB`);
  console.log("");
  console.log("%cCode examples:", "font-weight: bold;");
  console.log("");
  console.log("%c  ✅ Good: Prefetch next page script", "color: #22c55e;");
  console.log(
    '%c  <link rel="prefetch" href="/checkout-page.js" as="script">',
    "font-family: monospace;",
  );
  console.log("");
  console.log("%c  ❌ Bad: Prefetch current page resource", "color: #ef4444;");
  console.log(
    '%c  <link rel="prefetch" href="/hero-image.jpg" as="image">',
    "font-family: monospace;",
  );
  console.log('%c  <!-- Should be: rel="preload" -->', "font-family: monospace; color: #22c55e;");

  console.groupEnd();

  // Summary
  if (totalMeaningfulIssues === 0) {
    console.log("");
    console.log(
      "%c✅ Great! No issues detected with prefetch usage.",
      "color: #22c55e; font-weight: bold; font-size: 14px;",
    );
    console.log(
      "%cAll prefetch hints appear appropriate for future navigation.",
      "color: #22c55e;",
    );
  } else {
    console.log("");
    console.log(
      `%c⚠️ Found ${totalMeaningfulIssues} issue(s). Review recommendations above.`,
      "color: #ef4444; font-weight: bold;",
    );
  }

  console.groupEnd();
})();
