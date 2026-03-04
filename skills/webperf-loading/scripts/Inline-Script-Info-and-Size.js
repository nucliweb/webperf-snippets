// Inline Script Analysis - Find and analyze all inline scripts
// https://webperf-snippets.nucliweb.net

(() => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  const formatKB = (bytes) => (bytes / 1024).toFixed(2);

  // Get all inline scripts (no src attribute)
  const scriptTags = Array.from(
    document.querySelectorAll("script:not([src])")
  ).filter((s) => s.innerHTML.trim().length > 0);

  if (scriptTags.length === 0) {
    console.group("%c📜 Inline Script Analysis", "font-weight: bold; font-size: 14px;");
    console.log("%c✅ No inline scripts found.", "color: #22c55e; font-weight: bold;");
    console.log("The page uses external scripts only.");
    console.groupEnd();
    return;
  }

  // Analyze each script
  const scripts = scriptTags.map((script, index) => {
    const content = script.innerHTML;
    const size = new Blob([content]).size;
    const type = script.type || "text/javascript";
    const inHead = script.closest("head") !== null;

    // Determine script category
    let category = "classic";
    if (type === "module") {
      category = "module";
    } else if (type === "application/ld+json") {
      category = "json-ld";
    } else if (type.includes("template") || type === "text/html") {
      category = "template";
    } else if (type !== "text/javascript" && type !== "") {
      category = "other";
    }

    // Check if parser-blocking (classic scripts without async/defer)
    const isParserBlocking =
      category === "classic" &&
      !script.hasAttribute("async") &&
      !script.hasAttribute("defer");

    // Get preview (first 80 chars, cleaned up)
    const preview = content
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    // Check for common patterns
    const hasGlobalVars = /^(var|let|const|window\.)/.test(content.trim());
    const isConfig = /config|settings|options|__/i.test(content.slice(0, 200));
    const isAnalytics = /gtag|analytics|gtm|fbq|_gaq/i.test(content);

    return {
      index: index + 1,
      element: script,
      size,
      sizeKB: formatKB(size),
      type,
      category,
      inHead,
      isParserBlocking,
      hasGlobalVars,
      isConfig,
      isAnalytics,
      preview: preview + (content.length > 80 ? "..." : ""),
      content,
    };
  });

  // Separate by category
  const executableScripts = scripts.filter(
    (s) => s.category === "classic" || s.category === "module"
  );
  const jsonLdScripts = scripts.filter((s) => s.category === "json-ld");
  const otherScripts = scripts.filter(
    (s) => s.category === "template" || s.category === "other"
  );

  // Calculate totals for executable scripts
  const totalSize = executableScripts.reduce((sum, s) => sum + s.size, 0);
  const parserBlockingScripts = executableScripts.filter((s) => s.isParserBlocking);
  const parserBlockingInHead = parserBlockingScripts.filter((s) => s.inHead);

  // Find duplicated content
  const contentMap = new Map();
  executableScripts.forEach((s) => {
    const normalized = s.content.replace(/\s+/g, " ").trim();
    if (normalized.length > 50) {
      // Only check substantial scripts
      if (!contentMap.has(normalized)) {
        contentMap.set(normalized, []);
      }
      contentMap.get(normalized).push(s.index);
    }
  });
  const duplicates = Array.from(contentMap.entries())
    .filter(([_, indices]) => indices.length > 1)
    .map(([_, indices]) => indices);

  // Rating
  let rating, ratingColor;
  const inlineThreshold = 3 * 1024; // 3 KB recommended max
  if (totalSize <= inlineThreshold && parserBlockingInHead.length === 0) {
    rating = "Good";
    ratingColor = "#22c55e";
  } else if (totalSize <= inlineThreshold * 2 || parserBlockingInHead.length <= 2) {
    rating = "Needs Review";
    ratingColor = "#f59e0b";
  } else {
    rating = "Needs Optimization";
    ratingColor = "#ef4444";
  }

  // Display results
  console.group("%c📜 Inline Script Analysis", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total inline scripts: ${scripts.length}`);
  console.log(`   Executable scripts: ${executableScripts.length}`);
  if (jsonLdScripts.length > 0) {
    console.log(`   JSON-LD (structured data): ${jsonLdScripts.length}`);
  }
  if (otherScripts.length > 0) {
    console.log(`   Templates/Other: ${otherScripts.length}`);
  }
  console.log(`   Total executable size: ${formatBytes(totalSize)} (${formatKB(totalSize)} KB)`);
  console.log(`   Parser-blocking scripts: ${parserBlockingScripts.length}`);
  if (parserBlockingInHead.length > 0) {
    console.log(
      `   %c⚠️ Parser-blocking in <head>: ${parserBlockingInHead.length}`,
      "color: #ef4444;"
    );
  }
  console.log(`   Rating: %c${rating}`, `color: ${ratingColor}; font-weight: bold;`);

  // Executable scripts table
  if (executableScripts.length > 0) {
    console.log("");
    console.group(
      `%c⚡ Executable Scripts (${executableScripts.length})`,
      "color: #f59e0b; font-weight: bold;"
    );

    const execTable = executableScripts
      .sort((a, b) => b.size - a.size)
      .map((s) => ({
        "#": s.index,
        Location: s.inHead ? "head" : "body",
        Type: s.category,
        Size: formatBytes(s.size),
        "Parser-Blocking": s.isParserBlocking ? "⚠️ Yes" : "No",
        Pattern: s.isAnalytics
          ? "Analytics"
          : s.isConfig
          ? "Config"
          : s.hasGlobalVars
          ? "Globals"
          : "-",
        Preview: s.preview,
      }));
    console.table(execTable);

    // Elements for inspection
    console.log("");
    console.log("%c🔎 Elements for inspection:", "font-weight: bold;");
    executableScripts
      .sort((a, b) => b.size - a.size)
      .forEach((s) => {
        const warnings = [];
        if (s.isParserBlocking && s.inHead) warnings.push("blocking");
        if (s.size > 2 * 1024) warnings.push("large");
        const warningStr = warnings.length > 0 ? ` ⚠️ ${warnings.join(", ")}` : "";
        console.log(`${s.index}. (${formatBytes(s.size)})${warningStr}`, s.element);
      });

    console.groupEnd();
  }

  // JSON-LD scripts
  if (jsonLdScripts.length > 0) {
    console.log("");
    console.group(
      `%c📋 JSON-LD Structured Data (${jsonLdScripts.length})`,
      "color: #8b5cf6; font-weight: bold;"
    );

    const jsonTable = jsonLdScripts.map((s) => {
      let schemaType = "-";
      try {
        const parsed = JSON.parse(s.content);
        schemaType = parsed["@type"] || (Array.isArray(parsed) ? "Array" : "-");
      } catch {}
      return {
        "#": s.index,
        "Schema Type": schemaType,
        Size: formatBytes(s.size),
      };
    });
    console.table(jsonTable);
    console.groupEnd();
  }

  // Issues
  const issues = [];

  if (parserBlockingInHead.length > 0) {
    issues.push({
      type: "blocking",
      message: `${parserBlockingInHead.length} parser-blocking script(s) in <head>`,
      details: parserBlockingInHead.map(
        (s) => `Script #${s.index}: ${formatBytes(s.size)}`
      ),
      suggestion: "Move to end of <body> or add 'defer' attribute",
    });
  }

  const largeScripts = executableScripts.filter((s) => s.size > 2 * 1024);
  if (largeScripts.length > 0) {
    issues.push({
      type: "large",
      message: `${largeScripts.length} script(s) over 2 KB`,
      details: largeScripts.map((s) => `Script #${s.index}: ${formatBytes(s.size)}`),
      suggestion: "Consider moving large scripts to external cacheable files",
    });
  }

  if (duplicates.length > 0) {
    issues.push({
      type: "duplicate",
      message: `${duplicates.length} duplicated script(s) detected`,
      details: duplicates.map((d) => `Scripts #${d.join(", #")} have identical content`),
      suggestion: "Remove duplicate scripts or consolidate into one",
    });
  }

  const analyticsInHead = executableScripts.filter(
    (s) => s.isAnalytics && s.inHead && s.isParserBlocking
  );
  if (analyticsInHead.length > 0) {
    issues.push({
      type: "analytics",
      message: `${analyticsInHead.length} analytics script(s) blocking in <head>`,
      details: analyticsInHead.map((s) => `Script #${s.index}`),
      suggestion: "Load analytics scripts with 'async' or move to <body>",
    });
  }

  if (issues.length > 0) {
    console.log("");
    console.group("%c⚠️ Issues Found", "color: #ef4444; font-weight: bold;");

    issues.forEach((issue) => {
      console.log("");
      console.log(`%c${issue.message}`, "font-weight: bold;");
      if (issue.details) {
        issue.details.forEach((d) => console.log(`   • ${d}`));
      }
      console.log(`   → ${issue.suggestion}`);
    });

    console.groupEnd();
  } else if (executableScripts.length > 0) {
    console.log("");
    console.log(
      "%c✅ No major issues found. Inline scripts look reasonable.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Best practices
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("• Keep inline scripts small (< 1-2 KB)");
  console.log("• Avoid parser-blocking scripts in <head>");
  console.log("• Use 'defer' or 'async' for non-critical scripts");
  console.log("• Move large scripts to external files for caching");
  console.log("• Place non-critical scripts at end of <body>");
  console.log("");
  console.log("%cFor critical inline scripts:", "font-weight: bold;");
  console.log(
    '%c<script>\n  // Small critical code only\n  window.__CONFIG = { ... };\n</script>',
    "font-family: monospace; color: #22c55e;"
  );
  console.log("");
  console.log("%cFor larger scripts:", "font-weight: bold;");
  console.log(
    '%c<script src="app.js" defer></script>',
    "font-family: monospace; color: #22c55e;"
  );
  console.groupEnd();

  console.groupEnd();
})();
