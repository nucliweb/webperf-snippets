// Validate Preload on Async/Defer Scripts
// https://webperf-snippets.nucliweb.net

(() => {
  // Get all preloaded scripts
  const preloadedScripts = Array.from(
    document.querySelectorAll('link[rel="preload"][as="script"]'),
  );

  if (preloadedScripts.length === 0) {
    console.log(
      '%c✅ No script preloads found (rel="preload" as="script").',
      "color: #22c55e; font-weight: bold;",
    );
    console.log(
      "%cℹ️ This is fine - only preload scripts if they're critical and blocking.",
      "color: #3b82f6;",
    );
    return;
  }

  // Get performance entries for scripts
  const performanceScripts = performance
    .getEntriesByType("resource")
    .filter((r) => r.initiatorType === "script" || r.initiatorType === "link");

  // Find corresponding script elements for each preload
  const issues = [];
  const validPreloads = [];
  const allScripts = Array.from(document.querySelectorAll("script[src]"));

  preloadedScripts.forEach((preload) => {
    const preloadHref = preload.href;
    const preloadUrl = new URL(preloadHref, location.origin).href;

    // Find matching script element
    const matchingScript = allScripts.find((script) => {
      try {
        const scriptUrl = new URL(script.src, location.origin).href;
        return scriptUrl === preloadUrl;
      } catch {
        return false;
      }
    });

    const shortUrl = preloadHref.split("/").pop()?.split("?")[0] || preloadHref;

    if (!matchingScript) {
      // Check if script was loaded via Performance API (dynamic import, etc.)
      const wasLoaded = performanceScripts.some((entry) => {
        try {
          // First try exact URL match
          if (entry.name === preloadUrl) return true;

          // For relative/partial matches, compare pathnames to reduce false positives
          const entryUrl = new URL(entry.name, location.origin);
          const preloadUrlObj = new URL(preloadUrl, location.origin);

          // Match if pathnames end with the same file (more precise than includes)
          return entryUrl.pathname.endsWith(preloadUrlObj.pathname);
        } catch {
          return false;
        }
      });

      if (wasLoaded) {
        // Script was loaded dynamically (import(), injected, etc.) - this is actually OK
        validPreloads.push({
          type: "dynamic",
          preload,
          url: preloadHref,
          shortUrl,
          note: "Dynamic script (not in DOM, but loaded)",
        });
      } else {
        // Preload without matching script and not loaded - likely unused
        issues.push({
          type: "orphan",
          severity: "warning",
          preload,
          url: preloadHref,
          shortUrl,
          message: "Preloaded script not found or loaded",
          explanation: "This preload appears unused - script not in DOM and not in Performance API",
          fix: "Verify the script is needed, or remove the preload",
        });
      }
    } else {
      const isAsync = matchingScript.async;
      const isDefer = matchingScript.defer;
      const isModule = matchingScript.type === "module";
      const inHead = matchingScript.closest("head") !== null;
      const scriptLocation = inHead ? "head" : "body";
      const fetchPriority = matchingScript.getAttribute("fetchpriority");

      // Determine natural priority
      let naturalPriority = "Medium/High";
      let executionPriority = "Low";

      if (isAsync) {
        naturalPriority = "Lowest/Low";
        executionPriority = "High";
      } else if (isDefer) {
        naturalPriority = "Lowest/Low";
        executionPriority = "VeryLow";
      } else if (inHead) {
        naturalPriority = "Medium/High";
        executionPriority = "VeryHigh";
      }

      // Check for anti-pattern: preload + async/defer
      if (isAsync || isDefer) {
        const attributes = [];
        if (isAsync) attributes.push("async");
        if (isDefer) attributes.push("defer");
        if (isModule) attributes.push("type='module'");

        // Check if fetchpriority="low" is used to mitigate the issue
        const hasMitigation = fetchPriority === "low";

        if (hasMitigation) {
          // Valid: preload with async/defer but fetchpriority="low" mitigates the issue
          validPreloads.push({
            type: "mitigated",
            preload,
            script: matchingScript,
            url: preloadHref,
            shortUrl,
            location: scriptLocation,
            attributes: attributes.join(" + ") + " + fetchpriority='low'",
            naturalPriority,
            note: "Early discovery with low priority - acceptable pattern",
          });
        } else {
          issues.push({
            type: "async-defer-preload",
            severity: "error",
            preload,
            script: matchingScript,
            url: preloadHref,
            shortUrl,
            attributes: attributes.join(" + "),
            location: scriptLocation,
            naturalPriority,
            preloadPriority: "Medium/High",
            fetchPriority: fetchPriority || "not set",
            message: `Script has ${attributes.join("/")} but is also preloaded`,
            explanation: `${attributes.join("/")} scripts load at ${naturalPriority} priority. Preloading escalates them to Medium/High, causing bandwidth competition with critical resources.`,
            fix: `Remove the preload, OR add fetchpriority="low" to the <script> tag to keep early discovery without priority escalation`,
          });
        }
      } else if (isModule) {
        // ES modules without async/defer behave like defer by default
        issues.push({
          type: "module-preload",
          severity: "warning",
          preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl,
          attributes: "type='module'",
          location: scriptLocation,
          naturalPriority: "Lowest/Low (module default)",
          preloadPriority: "Medium/High",
          message: "ES module is using rel='preload' instead of rel='modulepreload'",
          explanation:
            "ES modules behave like defer scripts by default (low priority). Using rel='preload' as='script' escalates priority unnecessarily. For modules, use rel='modulepreload' instead.",
          fix: "Change <link rel='preload' as='script'> to <link rel='modulepreload'> for proper module preloading",
        });
      } else {
        // Valid preload (blocking script) - but check if it's really needed
        const needsReview = !inHead; // Blocking scripts at end of body rarely need preload

        validPreloads.push({
          preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl,
          location: scriptLocation,
          naturalPriority,
          needsReview,
          reviewNote: needsReview ? "Consider using 'defer' instead" : "Valid for critical scripts",
        });
      }
    }
  });

  // Display results
  console.group(
    "%c🔍 Preload + Async/Defer Script Validation",
    "font-weight: bold; font-size: 14px;",
  );

  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total preloaded scripts: ${preloadedScripts.length}`);
  console.log(`   Valid preloads (blocking scripts): ${validPreloads.length}`);
  console.log(`   Issues found: ${issues.length}`);

  // Show issues
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (errors.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Anti-patterns Found (${errors.length})`,
      "color: #ef4444; font-weight: bold;",
    );

    const errorTable = errors
      .filter((e) => e.type === "async-defer-preload")
      .map((issue) => ({
        Script: issue.shortUrl,
        Location: issue.location,
        Attributes: issue.attributes,
        "Natural Priority": issue.naturalPriority,
        "Preload Priority": "⚠️ Medium/High",
        Issue: "❌ Priority escalation",
      }));

    if (errorTable.length > 0) {
      console.table(errorTable);
    }

    console.log("");
    console.log("%c🔴 Detailed Issues:", "font-weight: bold; color: #ef4444;");
    errors
      .filter((e) => e.type === "async-defer-preload")
      .forEach((issue, i) => {
        console.log("");
        console.log(`%c${i + 1}. ${issue.message}`, "font-weight: bold;");
        console.log(`   URL: ${issue.url}`);
        console.log(`   Problem: ${issue.explanation}`);
        console.log(`   Fix: ${issue.fix}`);
        console.log("");
        console.log("   Elements:");
        console.log("   Preload:", issue.preload);
        console.log("   Script:", issue.script);
      });

    console.groupEnd();
  }

  if (warnings.length > 0) {
    console.log("");
    console.group(`%c💡 Warnings (${warnings.length})`, "color: #f59e0b; font-weight: bold;");

    warnings.forEach((issue) => {
      console.log("");
      console.log(`%c${issue.message}`, "font-weight: bold;");
      console.log(`   URL: ${issue.url}`);
      console.log(`   ${issue.fix}`);
    });

    console.groupEnd();
  }

  // Show valid preloads
  if (validPreloads.length > 0) {
    console.log("");
    console.group(
      `%c✅ Valid Preloads (${validPreloads.length})`,
      "color: #22c55e; font-weight: bold;",
    );

    const blockingScripts = validPreloads.filter((v) => v.type !== "dynamic");
    const dynamicScripts = validPreloads.filter((v) => v.type === "dynamic");

    if (blockingScripts.length > 0) {
      console.log("Blocking scripts that may benefit from preload:");
      console.log("");

      const validTable = blockingScripts.map((v) => ({
        Script: v.shortUrl,
        Location: v.location,
        Priority: v.naturalPriority,
        Status: v.needsReview ? "⚠️ Review needed" : "✅ Valid",
        Note: v.reviewNote,
      }));

      console.table(validTable);

      if (blockingScripts.some((v) => v.needsReview)) {
        console.log("");
        console.log(
          "%c💡 Tip: Blocking scripts at end of <body> rarely need preload.",
          "color: #f59e0b;",
        );
        console.log("   Consider using 'defer' instead for better performance.");
      }
    }

    if (dynamicScripts.length > 0) {
      console.log("");
      console.log(
        `%c📦 Dynamic Scripts (${dynamicScripts.length})`,
        "font-weight: bold; color: #3b82f6;",
      );
      console.log("These scripts are loaded dynamically (import(), code splitting, etc.):");
      console.log("");

      const dynamicTable = dynamicScripts.map((v) => ({
        Script: v.shortUrl,
        Type: "Dynamic/Code-split",
        Status: "✅ OK",
        Note: v.note,
      }));

      console.table(dynamicTable);

      console.log("");
      console.log(
        "%c💡 Info: Dynamic scripts don't appear in the DOM but are loaded by other scripts.",
        "color: #3b82f6;",
      );
      console.log("   This is normal for code-splitting, dynamic imports, or lazy-loaded modules.");
    }

    console.groupEnd();
  }

  // Recommendations
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%c❌ DON'T preload async/defer scripts:", "font-weight: bold;");
  console.log("   Bad pattern:");
  console.log(
    '%c   <link rel="preload" href="analytics.js" as="script">',
    "font-family: monospace; color: #ef4444;",
  );
  console.log(
    '%c   <script src="analytics.js" async></script>',
    "font-family: monospace; color: #ef4444;",
  );
  console.log("");
  console.log("%c✅ DO let async scripts load naturally:", "font-weight: bold;");
  console.log("   Good pattern:");
  console.log(
    '%c   <script src="analytics.js" async></script>',
    "font-family: monospace; color: #22c55e;",
  );
  console.log("");
  console.log("%c✅ DO preload ONLY critical blocking scripts:", "font-weight: bold;");
  console.log("   When script is needed early and blocks parsing:");
  console.log(
    '%c   <link rel="preload" href="critical.js" as="script">',
    "font-family: monospace; color: #22c55e;",
  );
  console.log(
    '%c   <script src="critical.js"></script>',
    "font-family: monospace; color: #22c55e;",
  );
  console.log("");
  console.log("%cResource priority order:", "font-weight: bold;");
  console.log("   1. Critical CSS (for LCP)");
  console.log("   2. Critical fonts (with crossorigin)");
  console.log("   3. LCP images (fetchpriority='high')");
  console.log("   4. Critical blocking scripts (rare)");
  console.log("   5. Everything else (no preload needed)");
  console.groupEnd();

  // Summary
  if (errors.length === 0 && warnings.length === 0) {
    console.log("");
    console.log(
      "%c✅ Great! No anti-patterns detected.",
      "color: #22c55e; font-weight: bold; font-size: 14px;",
    );
    console.log(
      '%cAll script preloads are either on blocking scripts or properly mitigated with fetchpriority="low".',
      "color: #22c55e;",
    );
  } else {
    console.log("");
    console.log(
      `%c⚠️ Found ${errors.length} error(s) and ${warnings.length} warning(s). Review recommendations above.`,
      "color: #ef4444; font-weight: bold;",
    );
  }

  console.groupEnd();
})();
