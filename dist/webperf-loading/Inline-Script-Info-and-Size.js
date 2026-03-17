(() => {
  const formatBytes = bytes => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };
  const formatKB = bytes => (bytes / 1024).toFixed(2);
  const scriptTags = Array.from(document.querySelectorAll("script:not([src])")).filter(s => s.innerHTML.trim().length > 0);
  if (scriptTags.length === 0) {
    return {
      script: "Inline-Script-Info-and-Size",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const scripts = scriptTags.map((script, index) => {
    const content = script.innerHTML;
    const size = new Blob([ content ]).size;
    const type = script.type || "text/javascript";
    const inHead = script.closest("head") !== null;
    let category = "classic";
    if (type === "module") category = "module"; else if (type === "application/ld+json") category = "json-ld"; else if (type.includes("template") || type === "text/html") category = "template"; else if (type !== "text/javascript" && type !== "") category = "other";
    const isParserBlocking = category === "classic" && !script.hasAttribute("async") && !script.hasAttribute("defer");
    const preview = content.replace(/\s+/g, " ").trim().slice(0, 80);
    const hasGlobalVars = /^(var|let|const|window\.)/.test(content.trim());
    const isConfig = /config|settings|options|__/i.test(content.slice(0, 200));
    const isAnalytics = /gtag|analytics|gtm|fbq|_gaq/i.test(content);
    return {
      index: index + 1,
      element: script,
      size: size,
      sizeKB: formatKB(size),
      type: type,
      category: category,
      inHead: inHead,
      isParserBlocking: isParserBlocking,
      hasGlobalVars: hasGlobalVars,
      isConfig: isConfig,
      isAnalytics: isAnalytics,
      preview: preview + (content.length > 80 ? "..." : ""),
      content: content
    };
  });
  const executableScripts = scripts.filter(s => s.category === "classic" || s.category === "module");
  const jsonLdScripts = scripts.filter(s => s.category === "json-ld");
  const otherScripts = scripts.filter(s => s.category === "template" || s.category === "other");
  const totalSize = executableScripts.reduce((sum, s) => sum + s.size, 0);
  const parserBlockingScripts = executableScripts.filter(s => s.isParserBlocking);
  const parserBlockingInHead = parserBlockingScripts.filter(s => s.inHead);
  const contentMap = new Map;
  executableScripts.forEach(s => {
    const normalized = s.content.replace(/\s+/g, " ").trim();
    if (normalized.length > 50) {
      if (!contentMap.has(normalized)) contentMap.set(normalized, []);
      contentMap.get(normalized).push(s.index);
    }
  });
  const duplicates = Array.from(contentMap.entries()).filter(([_, indices]) => indices.length > 1).map(([_, indices]) => indices);
  let rating, ratingColor;
  const inlineThreshold = 3 * 1024;
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
  if (jsonLdScripts.length > 0) void 0;
  if (otherScripts.length > 0) void 0;
  if (parserBlockingInHead.length > 0) void 0;
  if (executableScripts.length > 0) {
    executableScripts.sort((a, b) => b.size - a.size).map(s => ({
      "#": s.index,
      Location: s.inHead ? "head" : "body",
      Type: s.category,
      Size: formatBytes(s.size),
      "Parser-Blocking": s.isParserBlocking ? "⚠️ Yes" : "No",
      Pattern: s.isAnalytics ? "Analytics" : s.isConfig ? "Config" : s.hasGlobalVars ? "Globals" : "-",
      Preview: s.preview
    }));
    executableScripts.sort((a, b) => b.size - a.size).forEach(s => {
      const warnings = [];
      if (s.isParserBlocking && s.inHead) warnings.push("blocking");
      if (s.size > 2 * 1024) warnings.push("large");
      warnings.length > 0 && warnings.join(", ");
    });
  }
  if (jsonLdScripts.length > 0) {
    jsonLdScripts.map(s => {
      let schemaType = "-";
      try {
        const parsed = JSON.parse(s.content);
        schemaType = parsed["@type"] || (Array.isArray(parsed) ? "Array" : "-");
      } catch {}
      return {
        "#": s.index,
        "Schema Type": schemaType,
        Size: formatBytes(s.size)
      };
    });
  }
  const issues = [];
  if (parserBlockingInHead.length > 0) issues.push({
    type: "blocking",
    message: `${parserBlockingInHead.length} parser-blocking script(s) in <head>`,
    details: parserBlockingInHead.map(s => `Script #${s.index}: ${formatBytes(s.size)}`),
    suggestion: "Move to end of <body> or add 'defer' attribute"
  });
  const largeScripts = executableScripts.filter(s => s.size > 2 * 1024);
  if (largeScripts.length > 0) issues.push({
    type: "large",
    message: `${largeScripts.length} script(s) over 2 KB`,
    details: largeScripts.map(s => `Script #${s.index}: ${formatBytes(s.size)}`),
    suggestion: "Consider moving large scripts to external cacheable files"
  });
  if (duplicates.length > 0) issues.push({
    type: "duplicate",
    message: `${duplicates.length} duplicated script(s) detected`,
    details: duplicates.map(d => `Scripts #${d.join(", #")} have identical content`),
    suggestion: "Remove duplicate scripts or consolidate into one"
  });
  const analyticsInHead = executableScripts.filter(s => s.isAnalytics && s.inHead && s.isParserBlocking);
  if (analyticsInHead.length > 0) issues.push({
    type: "analytics",
    message: `${analyticsInHead.length} analytics script(s) blocking in <head>`,
    details: analyticsInHead.map(s => `Script #${s.index}`),
    suggestion: "Load analytics scripts with 'async' or move to <body>"
  });
  if (issues.length > 0) {
    issues.forEach(issue => {
      if (issue.details) issue.details.forEach(d => {});
    });
  } else if (executableScripts.length > 0) {
  }
  return {
    script: "Inline-Script-Info-and-Size",
    status: "ok",
    count: scripts.length,
    details: {
      executableCount: executableScripts.length,
      jsonLdCount: jsonLdScripts.length,
      otherCount: otherScripts.length,
      totalSizeBytes: totalSize,
      parserBlockingCount: parserBlockingScripts.length,
      parserBlockingInHeadCount: parserBlockingInHead.length
    },
    items: executableScripts.map(s => ({
      index: s.index,
      sizeBytes: s.size,
      category: s.category,
      inHead: s.inHead,
      isParserBlocking: s.isParserBlocking,
      isAnalytics: s.isAnalytics,
      isConfig: s.isConfig
    })),
    issues: issues.map(i => ({
      severity: i.type === "blocking" ? "error" : "warning",
      message: i.message
    }))
  };
})();
