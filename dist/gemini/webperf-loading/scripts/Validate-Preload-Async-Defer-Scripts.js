(() => {
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
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
  const performanceScripts = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e)).filter(r => r.initiatorType === "script" || r.initiatorType === "link");
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
        code: "orphan-preload",
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
      const preloadPriority = (preload.getAttribute("fetchpriority") || "").toLowerCase();
      let naturalPriority = "Medium/High";
      if (isAsync) naturalPriority = "Lowest/Low"; else if (isDefer) naturalPriority = "Lowest/Low"; else if (inHead) naturalPriority = "Medium/High";
      const credentialsOf = el => !el.hasAttribute("crossorigin") ? null : el.getAttribute("crossorigin").toLowerCase() === "use-credentials" ? "include" : "same-origin";
      if (isModule) {
        const attributes = [ "type='module'", ...isAsync ? [ "async" ] : [] ].join(" + ");
        if (credentialsOf(preload) === (credentialsOf(matchingScript) ?? "same-origin")) validPreloads.push({
          type: "module",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          location: scriptLocation,
          attributes: attributes,
          naturalPriority: "High",
          note: "The module uses the preload, since their crossorigin match; rel='modulepreload' is the link made for modules"
        }); else issues.push({
          code: "module-preload",
          type: "module-preload",
          severity: "warning",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          attributes: attributes,
          location: scriptLocation,
          message: "ES module preloaded with rel='preload' whose crossorigin does not match the module's, so the module does not use the preload and fetches the file again",
          explanation: "A module script is fetched in CORS mode. A rel='preload' as='script' without the same crossorigin is fetched in another mode, so the browser cannot use it for the module and downloads the file twice.",
          fix: "Change <link rel='preload' as='script'> to <link rel='modulepreload'>, which fetches the file as a module"
        });
      } else if (isAsync || isDefer) {
        const attributes = [];
        if (isAsync) attributes.push("async");
        if (isDefer) attributes.push("defer");
        const hasMitigation = preloadPriority === "low";
        if (hasMitigation) validPreloads.push({
          type: "mitigated",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          location: scriptLocation,
          attributes: attributes.join(" + ") + ", preload with fetchpriority='low'",
          naturalPriority: naturalPriority,
          note: "Early discovery with low priority - acceptable pattern"
        }); else issues.push({
          code: "async-defer-preload",
          type: "async-defer-preload",
          severity: "error",
          preload: preload,
          script: matchingScript,
          url: preloadHref,
          shortUrl: shortUrl,
          attributes: attributes.join(" + "),
          location: scriptLocation,
          naturalPriority: naturalPriority,
          preloadPriority: "High",
          fetchPriority: preloadPriority || "not set",
          message: `Script has ${attributes.join("/")} but is also preloaded`,
          explanation: `${attributes.join("/")} scripts load at ${naturalPriority} priority. The preload fetches them at High priority, causing bandwidth competition with critical resources; fetchpriority on the <script> does not change it.`,
          fix: `Remove the preload, OR add fetchpriority="low" to the <link rel="preload">, which sets the priority, to keep early discovery without priority escalation`
        });
      } else {
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
      "Preload Priority": "⚠️ High",
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
        Note: v.reviewNote || v.note
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
  const itemsByUrl = new Map;
  validPreloads.forEach(v => itemsByUrl.set(v.url, {
    url: v.shortUrl,
    type: [ "dynamic", "mitigated", "module" ].includes(v.type) ? v.type : "blocking",
    strategy: v.attributes || "blocking-script",
    location: v.location || "unknown",
    reviewNote: v.reviewNote || v.note || ""
  }));
  issues.forEach(i => itemsByUrl.set(i.url, {
    url: i.shortUrl,
    type: "issue",
    strategy: i.attributes || i.type,
    location: i.location || "unknown",
    reviewNote: i.fix || ""
  }));
  return {
    script: "Validate-Preload-Async-Defer-Scripts",
    status: "ok",
    count: preloadedScripts.length,
    details: {
      validCount: validPreloads.length,
      issueCount: issues.length
    },
    items: Array.from(itemsByUrl.values()).slice(0, 50),
    issues: issues.map(i => ({
      code: i.code,
      severity: i.severity,
      message: i.fix ? `${i.message.replace(/\.$/, "")}. Fix: ${i.fix}` : i.message,
      target: i.url
    }))
  };
})();
