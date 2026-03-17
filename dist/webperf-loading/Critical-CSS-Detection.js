(() => {
  const formatBytes = bytes => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };
  const criticalBudget = 14 * 1024;
  const linkStylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const perfEntries = performance.getEntriesByType("resource");
  const externalCSSData = linkStylesheets.map(link => {
    const href = link.href;
    const media = link.getAttribute("media") || "all";
    const perfEntry = perfEntries.find(e => e.name === href);
    let isRenderBlocking;
    if (perfEntry && perfEntry.renderBlockingStatus !== void 0) isRenderBlocking = perfEntry.renderBlockingStatus === "blocking"; else isRenderBlocking = media === "all" || media === "" || media === "screen" || media.toLowerCase().includes("screen") && !media.toLowerCase().includes("print");
    const transferSize = perfEntry ? perfEntry.transferSize : 0;
    const decodedSize = perfEntry ? perfEntry.decodedBodySize : 0;
    const preloadLink = document.querySelector(`link[rel="preload"][as="style"][href="${href}"]`);
    let ruleCount = 0;
    let corsBlocked = false;
    try {
      const sheet = Array.from(document.styleSheets).find(s => s.href === href);
      if (sheet && sheet.cssRules) ruleCount = sheet.cssRules.length;
    } catch (_) {
      corsBlocked = true;
    }
    return {
      filename: href.split("/").pop().split("?")[0] || href,
      href: href,
      media: media,
      isRenderBlocking: isRenderBlocking,
      transferSize: transferSize,
      decodedSize: decodedSize,
      ruleCount: ruleCount,
      corsBlocked: corsBlocked,
      preloaded: preloadLink !== null
    };
  });
  const inlineStyles = Array.from(document.querySelectorAll("style")).map((style, i) => {
    const content = style.innerHTML;
    const size = new Blob([ content ]).size;
    const ruleCount = (content.match(/\{[^}]*\}/g) || []).length;
    return {
      index: i + 1,
      size: size,
      ruleCount: ruleCount,
      inHead: style.closest("head") !== null
    };
  });
  const renderBlockingCSS = externalCSSData.filter(s => s.isRenderBlocking);
  const nonBlockingCSS = externalCSSData.filter(s => !s.isRenderBlocking);
  const totalInlineBytes = inlineStyles.reduce((sum, s) => sum + s.size, 0);
  const totalRenderBlockingDecoded = renderBlockingCSS.reduce((sum, s) => sum + s.decodedSize, 0);
  const totalExternalTransfer = externalCSSData.reduce((sum, s) => sum + s.transferSize, 0);
  if (renderBlockingCSS.length > 0) {
    const budgetPct = Math.min(totalRenderBlockingDecoded / criticalBudget * 100, 200);
    const barWidth = Math.min(Math.round(budgetPct / 10), 20);
    "█".repeat(barWidth), "░".repeat(20 - barWidth);
  } else {
  }
  if (nonBlockingCSS.length > 0) {
  }
  if (inlineStyles.length > 0) {
    (totalInlineBytes / criticalBudget * 100).toFixed(0);
  }
  const issues = [];
  if (renderBlockingCSS.length > 0 && inlineStyles.length === 0) issues.push({
    severity: "high",
    message: "No critical CSS inlined — all CSS loads via render-blocking requests",
    suggestion: "Extract above-the-fold styles into a <style> tag in <head> and defer the rest"
  });
  if (totalRenderBlockingDecoded > criticalBudget) issues.push({
    severity: "high",
    message: `Render-blocking CSS (${formatBytes(totalRenderBlockingDecoded)}) exceeds the 14 KB critical budget`,
    suggestion: "Inline critical CSS and defer non-critical stylesheets using the media/onload pattern"
  });
  const largeUnpreloaded = renderBlockingCSS.filter(s => !s.preloaded && s.transferSize > 10 * 1024);
  if (largeUnpreloaded.length > 0) issues.push({
    severity: "medium",
    message: `${largeUnpreloaded.length} large render-blocking stylesheet(s) without preload`,
    details: largeUnpreloaded.map(s => `• ${s.filename} (${formatBytes(s.transferSize)})`),
    suggestion: 'Add <link rel="preload" as="style" href="..."> to start download earlier'
  });
  if (totalInlineBytes > criticalBudget) issues.push({
    severity: "high",
    message: `Inline CSS (${formatBytes(totalInlineBytes)}) exceeds the 14 KB critical budget`,
    suggestion: "Keep inline critical CSS under 14 KB. Move non-critical styles to an external deferred file."
  });
  const bodyInlineStyles = inlineStyles.filter(s => !s.inHead);
  if (bodyInlineStyles.length > 0) issues.push({
    severity: "medium",
    message: `${bodyInlineStyles.length} inline style block(s) found in <body>`,
    suggestion: "Move critical styles to <head> to avoid potential render-blocking reflows"
  });
  if (issues.length > 0) {
    issues.forEach(issue => {
      issue.severity === "high" || issue.severity;
      if (issue.details) issue.details.forEach(d => {});
    });
  } else {
  }
  return {
    script: "Critical-CSS-Detection",
    status: "ok",
    count: externalCSSData.length,
    details: {
      renderBlockingCount: renderBlockingCSS.length,
      nonBlockingCount: nonBlockingCSS.length,
      inlineCount: inlineStyles.length,
      totalExternalTransferBytes: totalExternalTransfer,
      renderBlockingDecodedBytes: totalRenderBlockingDecoded,
      inlineBytes: totalInlineBytes,
      criticalBudgetBytes: criticalBudget
    },
    items: externalCSSData.map(s => ({
      filename: s.filename,
      media: s.media,
      isRenderBlocking: s.isRenderBlocking,
      transferBytes: s.transferSize,
      decodedBytes: s.decodedSize,
      ruleCount: s.ruleCount,
      preloaded: s.preloaded,
      corsBlocked: s.corsBlocked
    })),
    issues: issues.map(i => ({
      severity: i.severity === "high" ? "error" : "warning",
      message: i.message
    }))
  };
})();
