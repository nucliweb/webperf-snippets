(() => {
  const formatBytes = bytes => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };
  const formatKB = bytes => (bytes / 1024).toFixed(2);
  const styleTags = Array.from(document.querySelectorAll("style"));
  if (styleTags.length === 0) {
    return {
      script: "Inline-CSS-Info-and-Size",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const styles = styleTags.map((style, index) => {
    const content = style.innerHTML;
    const size = new Blob([ content ]).size;
    const parent = style.parentElement?.tagName.toLowerCase() || "unknown";
    const inHead = style.closest("head") !== null;
    const ruleCount = (content.match(/\{[^}]*\}/g) || []).length;
    const preview = content.replace(/\s+/g, " ").trim().slice(0, 80);
    const hasMediaQueries = /@media/i.test(content);
    const hasKeyframes = /@keyframes/i.test(content);
    return {
      index: index + 1,
      element: style,
      size: size,
      sizeKB: formatKB(size),
      parent: parent,
      inHead: inHead,
      ruleCount: ruleCount,
      preview: preview + (content.length > 80 ? "..." : ""),
      hasMediaQueries: hasMediaQueries,
      hasKeyframes: hasKeyframes,
      content: content
    };
  });
  const totalSize = styles.reduce((sum, s) => sum + s.size, 0);
  const totalRules = styles.reduce((sum, s) => sum + s.ruleCount, 0);
  const criticalBudget = 14 * 1024;
  const contentMap = new Map;
  styles.forEach(s => {
    const normalized = s.content.replace(/\s+/g, " ").trim();
    if (!contentMap.has(normalized)) contentMap.set(normalized, []);
    contentMap.get(normalized).push(s.index);
  });
  const duplicates = Array.from(contentMap.entries()).filter(([_, indices]) => indices.length > 1).map(([_, indices]) => indices);
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
  const budgetPct = Math.min(totalSize / criticalBudget * 100, 100);
  const barWidth = Math.round(budgetPct / 5);
  "█".repeat(barWidth), "░".repeat(20 - barWidth);
  styles.map(s => ({
    "#": s.index,
    Location: s.inHead ? "head" : "body",
    Size: formatBytes(s.size),
    Rules: s.ruleCount,
    "Media Queries": s.hasMediaQueries ? "Yes" : "-",
    Animations: s.hasKeyframes ? "Yes" : "-",
    Preview: s.preview
  }));
  styles.forEach(s => {
    s.size;
  });
  const issues = [];
  if (totalSize > criticalBudget) issues.push({
    type: "size",
    message: `Total inline CSS (${formatBytes(totalSize)}) exceeds 14 KB critical budget`,
    suggestion: "Move non-critical styles to external stylesheet"
  });
  if (duplicates.length > 0) issues.push({
    type: "duplicate",
    message: `Found ${duplicates.length} duplicated style block(s)`,
    details: duplicates.map(d => `Tags #${d.join(", #")} have identical content`),
    suggestion: "Consolidate duplicate styles into a single block"
  });
  const largeBlocks = styles.filter(s => s.size > 5 * 1024);
  if (largeBlocks.length > 0) issues.push({
    type: "large",
    message: `${largeBlocks.length} style block(s) over 5 KB`,
    details: largeBlocks.map(s => `Tag #${s.index}: ${formatBytes(s.size)}`),
    suggestion: "Consider moving large blocks to external cached stylesheets"
  });
  const bodyStyles = styles.filter(s => !s.inHead);
  if (bodyStyles.length > 0) issues.push({
    type: "location",
    message: `${bodyStyles.length} style block(s) in <body>`,
    details: bodyStyles.map(s => `Tag #${s.index}`),
    suggestion: "Move styles to <head> or use external stylesheets for better parsing"
  });
  if (issues.length > 0) {
    issues.forEach(issue => {
      if (issue.details) issue.details.forEach(d => {});
    });
  } else {
  }
  return {
    script: "Inline-CSS-Info-and-Size",
    status: "ok",
    count: styles.length,
    details: {
      totalSizeBytes: totalSize,
      totalRules: totalRules,
      criticalBudgetBytes: criticalBudget,
      duplicateBlocks: duplicates.length,
      bodyStyleBlocks: styles.filter(s => !s.inHead).length
    },
    items: styles.map(s => ({
      index: s.index,
      sizeBytes: s.size,
      parent: s.parent,
      inHead: s.inHead,
      ruleCount: s.ruleCount,
      hasMediaQueries: s.hasMediaQueries,
      hasKeyframes: s.hasKeyframes
    })),
    issues: issues.map(i => ({
      severity: "warning",
      message: i.message
    }))
  };
})();
