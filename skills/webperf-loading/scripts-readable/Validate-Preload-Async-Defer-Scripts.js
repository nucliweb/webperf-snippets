(() => {
  const preloadedScripts = Array.from(document.querySelectorAll('link[rel="preload"][as="script"]'));
  if (preloadedScripts.length === 0) {
    return {
      script: "Validate-Preload-Async-Defer-Scripts",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const performanceScripts = performance.getEntriesByType("resource").filter(r => r.initiatorType === "script" || r.initiatorType === "link");
  const issues = [];
  const validPreloads = [];
  const allScripts = Array.from(document.querySelectorAll("script[src]"));
  preloadedScripts.forEach(preload => {
    const preloadHref = preload.href;
    const preloadUrl = new URL(preloadHref, location.origin).href;
    const matchingScript = allScripts.find(script => {
      try {
        const scriptUrl = new URL(script.src, location.origin).href;
        return scriptUrl === preloadUrl;
      } catch {
        return false;
      }
    });
    const shortUrl = preloadHref.split("/").pop()?.split("?")[0] || preloadHref;
    if (!matchingScript) {
      const wasLoaded = performanceScripts.some(entry => {
        try {
          if (entry.name === preloadUrl) return true;
          const entryUrl = new URL(entry.name, location.origin);
          const preloadUrlObj = new URL(preloadUrl, location.origin);
          return entryUrl.pathname.endsWith(preloadUrlObj.pathname);
        } catch {
          return false;
        }
      });
      if (wasLoaded) validPreloads.push({
        type: "dynamic",
        preload: preload,
        url: preloadHref,
        shortUrl: shortUrl,
        note: "Dynamic script (not in DOM, but loaded)"
      }); else issues.push({
        type: "orphan",
        severity: "warning",
        preload: preload,
        url: preloadHref,
        shortUrl: shortUrl,
        message: "Preloaded script not found or loaded",
        explanation: "This preload appears unused - script not in DOM and not in Performance API",
        fix: "Verify the script is needed, or remove the preload"
      });
    } else {
      const isAsync = matchingScript.async;
      const isDefer = matchingScript.defer;
      const isModule = matchingScript.type === "module";
      const inHead = matchingScript.closest("head") !== null;
      const scriptLocation = inHead ? "head" : "body";
      const fetchPriority = matchingScript.getAttribute("fetchpriority");
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
      if (isAsync || isDefer) {
        const attributes = [];
        if (isAsync) attributes.push("async");
        if (isDefer) attributes.push("defer");
        if (isModule) attributes.push("type='module'");
        const hasMitigation = fetchPriority === "low";
        if (hasMitigation) validPreloads.push({
          type: "mitigated",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          location: scriptLocation,
          attributes: attributes.join(" + ") + " + fetchpriority='low'",
          naturalPriority: naturalPriority,
          note: "Early discovery with low priority - acceptable pattern"
        }); else issues.push({
          type: "async-defer-preload",
          severity: "error",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          attributes: attributes.join(" + "),
          location: scriptLocation,
          naturalPriority: naturalPriority,
          preloadPriority: "Medium/High",
          fetchPriority: fetchPriority || "not set",
          message: `Script has ${attributes.join("/")} but is also preloaded`,
          explanation: `${attributes.join("/")} scripts load at ${naturalPriority} priority. Preloading escalates them to Medium/High, causing bandwidth competition with critical resources.`,
          fix: `Remove the preload, OR add fetchpriority="low" to the <script> tag to keep early discovery without priority escalation`
        });
      } else if (isModule) issues.push({
        type: "module-preload",
        severity: "warning",
        preload: preload,
        script: matchingScript,
        url: preloadHref,
        shortUrl: shortUrl,
        attributes: "type='module'",
        location: scriptLocation,
        naturalPriority: "Lowest/Low (module default)",
        preloadPriority: "Medium/High",
        message: "ES module is using rel='preload' instead of rel='modulepreload'",
        explanation: "ES modules behave like defer scripts by default (low priority). Using rel='preload' as='script' escalates priority unnecessarily. For modules, use rel='modulepreload' instead.",
        fix: "Change <link rel='preload' as='script'> to <link rel='modulepreload'> for proper module preloading"
      }); else {
        const needsReview = !inHead;
        validPreloads.push({
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          location: scriptLocation,
          naturalPriority: naturalPriority,
          needsReview: needsReview,
          reviewNote: needsReview ? "Consider using 'defer' instead" : "Valid for critical scripts"
        });
      }
    }
  });
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  if (errors.length > 0) {
    const errorTable = errors.filter(e => e.type === "async-defer-preload").map(issue => ({
      Script: issue.shortUrl,
      Location: issue.location,
      Attributes: issue.attributes,
      "Natural Priority": issue.naturalPriority,
      "Preload Priority": "⚠️ Medium/High",
      Issue: "❌ Priority escalation"
    }));
    if (errorTable.length > 0) void 0;
    errors.filter(e => e.type === "async-defer-preload").forEach((issue, i) => {
    });
  }
  if (warnings.length > 0) {
    warnings.forEach(issue => {
    });
  }
  if (validPreloads.length > 0) {
    const blockingScripts = validPreloads.filter(v => v.type !== "dynamic");
    const dynamicScripts = validPreloads.filter(v => v.type === "dynamic");
    if (blockingScripts.length > 0) {
      blockingScripts.map(v => ({
        Script: v.shortUrl,
        Location: v.location,
        Priority: v.naturalPriority,
        Status: v.needsReview ? "⚠️ Review needed" : "✅ Valid",
        Note: v.reviewNote
      }));
      if (blockingScripts.some(v => v.needsReview)) {
      }
    }
    if (dynamicScripts.length > 0) {
      dynamicScripts.map(v => ({
        Script: v.shortUrl,
        Type: "Dynamic/Code-split",
        Status: "✅ OK",
        Note: v.note
      }));
    }
  }
  if (errors.length === 0 && warnings.length === 0) {
  } else {
  }
  return {
    script: "Validate-Preload-Async-Defer-Scripts",
    status: "ok",
    count: preloadedScripts.length,
    details: {
      validCount: validPreloads.length,
      issueCount: issues.length
    },
    items: preloadedScripts.map(p => ({
      url: p.href.split("/").pop()?.split("?")[0] || p.href
    })),
    issues: issues.map(i => ({
      severity: i.severity,
      message: i.message
    }))
  };
})();
