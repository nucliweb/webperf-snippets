// Inline CSS Analysis - Find and analyze all inline style tags
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

  // Get all inline style tags
  const styleTags = Array.from(document.querySelectorAll("style"));

  if (styleTags.length === 0) {
    console.group("%c📝 Inline CSS Analysis", "font-weight: bold; font-size: 14px;");
    console.log("%c✅ No inline <style> tags found.", "color: #22c55e; font-weight: bold;");
    console.log("The page uses external stylesheets only.");
    console.groupEnd();
    return;
  }

  // Analyze each style tag
  const styles = styleTags.map((style, index) => {
    const content = style.innerHTML;
    const size = new Blob([content]).size;
    const parent = style.parentElement?.tagName.toLowerCase() || "unknown";
    const inHead = style.closest("head") !== null;

    // Count approximate number of rules
    const ruleCount = (content.match(/\{[^}]*\}/g) || []).length;

    // Get preview (first 100 chars, cleaned up)
    const preview = content
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    // Check for media queries
    const hasMediaQueries = /@media/i.test(content);

    // Check for keyframes (animation)
    const hasKeyframes = /@keyframes/i.test(content);

    return {
      index: index + 1,
      element: style,
      size,
      sizeKB: formatKB(size),
      parent,
      inHead,
      ruleCount,
      preview: preview + (content.length > 80 ? "..." : ""),
      hasMediaQueries,
      hasKeyframes,
      content,
    };
  });

  // Calculate totals and find issues
  const totalSize = styles.reduce((sum, s) => sum + s.size, 0);
  const totalRules = styles.reduce((sum, s) => sum + s.ruleCount, 0);
  const criticalBudget = 14 * 1024; // 14 KB

  // Find duplicated content
  const contentMap = new Map();
  styles.forEach((s) => {
    const normalized = s.content.replace(/\s+/g, " ").trim();
    if (!contentMap.has(normalized)) {
      contentMap.set(normalized, []);
    }
    contentMap.get(normalized).push(s.index);
  });
  const duplicates = Array.from(contentMap.entries())
    .filter(([_, indices]) => indices.length > 1)
    .map(([_, indices]) => indices);

  // Rating based on total size
  let rating, ratingColor;
  if (totalSize <= criticalBudget * 0.5) {
    rating = "Good";
    ratingColor = "#22c55e";
  } else if (totalSize <= criticalBudget) {
    rating = "Acceptable";
    ratingColor = "#f59e0b";
  } else {
    rating = "Too Large";
    ratingColor = "#ef4444";
  }

  // Display results
  console.group("%c📝 Inline CSS Analysis", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Total inline <style> tags: ${styles.length}`);
  console.log(`   Total size: ${formatBytes(totalSize)} (${formatKB(totalSize)} KB)`);
  console.log(`   Total CSS rules: ~${totalRules}`);
  console.log(
    `   Budget used: ${((totalSize / criticalBudget) * 100).toFixed(0)}% of 14 KB`
  );
  console.log(`   Rating: %c${rating}`, `color: ${ratingColor}; font-weight: bold;`);

  // Visual budget bar
  const budgetPct = Math.min((totalSize / criticalBudget) * 100, 100);
  const barWidth = Math.round(budgetPct / 5);
  const bar = "█".repeat(barWidth) + "░".repeat(20 - barWidth);
  console.log(`   [${bar}] ${budgetPct.toFixed(0)}%`);

  // Details table
  console.log("");
  console.group(
    `%c📊 Style Tags (${styles.length})`,
    "color: #3b82f6; font-weight: bold;"
  );

  const tableData = styles.map((s) => ({
    "#": s.index,
    Location: s.inHead ? "head" : "body",
    Size: formatBytes(s.size),
    Rules: s.ruleCount,
    "Media Queries": s.hasMediaQueries ? "Yes" : "-",
    Animations: s.hasKeyframes ? "Yes" : "-",
    Preview: s.preview,
  }));
  console.table(tableData);

  // Elements for inspection
  console.log("");
  console.log("%c🔎 Elements for inspection:", "font-weight: bold;");
  styles.forEach((s) => {
    const warning = s.size > 5 * 1024 ? " ⚠️ Large" : "";
    console.log(`${s.index}. (${formatBytes(s.size)})${warning}`, s.element);
  });

  console.groupEnd();

  // Issues
  const issues = [];

  if (totalSize > criticalBudget) {
    issues.push({
      type: "size",
      message: `Total inline CSS (${formatBytes(totalSize)}) exceeds 14 KB critical budget`,
      suggestion: "Move non-critical styles to external stylesheet",
    });
  }

  if (duplicates.length > 0) {
    issues.push({
      type: "duplicate",
      message: `Found ${duplicates.length} duplicated style block(s)`,
      details: duplicates.map((d) => `Tags #${d.join(", #")} have identical content`),
      suggestion: "Consolidate duplicate styles into a single block",
    });
  }

  const largeBlocks = styles.filter((s) => s.size > 5 * 1024);
  if (largeBlocks.length > 0) {
    issues.push({
      type: "large",
      message: `${largeBlocks.length} style block(s) over 5 KB`,
      details: largeBlocks.map((s) => `Tag #${s.index}: ${formatBytes(s.size)}`),
      suggestion: "Consider moving large blocks to external cached stylesheets",
    });
  }

  const bodyStyles = styles.filter((s) => !s.inHead);
  if (bodyStyles.length > 0) {
    issues.push({
      type: "location",
      message: `${bodyStyles.length} style block(s) in <body>`,
      details: bodyStyles.map((s) => `Tag #${s.index}`),
      suggestion: "Move styles to <head> or use external stylesheets for better parsing",
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
  } else {
    console.log("");
    console.log(
      "%c✅ No issues found. Inline CSS is within recommended limits.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Recommendations
  console.log("");
  console.group("%c📝 Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("• Keep critical CSS under 14 KB (fits in first TCP round-trip)");
  console.log("• Inline only above-the-fold critical styles");
  console.log("• Move large stylesheets to external files for caching");
  console.log("• Avoid duplicate style blocks");
  console.log("• Place <style> tags in <head> for optimal parsing");
  console.log("");
  console.log("%cExample critical CSS pattern:", "font-weight: bold;");
  console.log('%c<head>\n  <style>/* Critical above-fold CSS here */</style>\n  <link rel="preload" href="main.css" as="style">\n  <link rel="stylesheet" href="main.css" media="print" onload="this.media=\'all\'">\n</head>', "font-family: monospace; color: #22c55e;");
  console.groupEnd();

  console.groupEnd();
})();
