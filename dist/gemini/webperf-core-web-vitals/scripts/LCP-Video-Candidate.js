(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    return {
      script: "LCP-Video-Candidate",
      status: "unsupported",
      error: "largest-contentful-paint entries not supported in this browser"
    };
  }
  const collectBuffered = (type, timeoutMs = 100) => new Promise(resolve => {
    const entries = [];
    try {
      const obs = new PerformanceObserver(list => entries.push(...list.getEntries()));
      obs.observe({
        type: type,
        buffered: true
      });
      setTimeout(() => {
        obs.disconnect();
        resolve(entries);
      }, timeoutMs);
    } catch {
      resolve(entries);
    }
  });
  const lcpEntries = await collectBuffered("largest-contentful-paint");
  if (lcpEntries.length === 0) {
    return {
      script: "LCP-Video-Candidate",
      status: "error",
      error: "No LCP entries found"
    };
  }
  const lcp = lcpEntries[lcpEntries.length - 1];
  const element = lcp.element;
  function valueToRating(ms) {
    return ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";
  }
  function detectFormat(url) {
    if (!url) return "unknown";
    const path = url.toLowerCase().split("?")[0];
    const ext = path.match(/\.(avif|webp|jxl|png|gif|jpg|jpeg|svg)(?:[?#]|$)/);
    if (ext) return ext[1] === "jpeg" ? "jpg" : ext[1];
    return "unknown";
  }
  function normalizeUrl(url) {
    try {
      return new URL(url, location.origin).href;
    } catch {
      return url;
    }
  }
  const activationStart = (() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return nav?.activationStart || 0;
  })();
  const lcpTime = Math.round(Math.max(0, lcp.startTime - activationStart));
  if (!element || element.tagName !== "VIDEO") {
    const tag = element ? element.tagName.toLowerCase() : null;
    const message = tag ? `The LCP element is <${tag}>, not a <video>. Run the LCP snippet to measure it, and LCP Subparts to see its phases.` : "The LCP element is no longer in the DOM, so it cannot be checked for a <video>. Run the LCP snippet to measure it.";
    if (lcp.url) void 0;
    if (element) void 0;
    return {
      script: "LCP-Video-Candidate",
      status: "ok",
      details: {
        isVideo: false,
        lcpElement: tag,
        lcpUrl: lcp.url || null
      },
      issues: [ {
        severity: "info",
        message: message
      } ]
    };
  }
  const posterAttr = element.getAttribute("poster") || "";
  const posterUrl = posterAttr ? normalizeUrl(posterAttr) : "";
  const lcpUrl = lcp.url ? normalizeUrl(lcp.url) : "";
  const videoUrls = [ element.currentSrc, element.getAttribute("src"), ...Array.from(element.querySelectorAll("source"), s => s.getAttribute("src")) ].filter(Boolean).map(normalizeUrl);
  const lcpSource = lcpUrl && videoUrls.includes(lcpUrl) ? "first-frame" : lcpUrl && lcpUrl === posterUrl ? "poster" : !posterAttr ? "first-frame" : lcpUrl ? "poster" : "unknown";
  const videoUrl = lcpSource === "first-frame" ? lcpUrl || videoUrls[0] || null : null;
  const loadEventEnd = performance.getEntriesByType("navigation")[0]?.loadEventEnd || 0;
  const secondsAfterLoad = loadEventEnd > 0 ? Math.round((lcp.startTime - loadEventEnd) / 1000) : 0;
  const rating = valueToRating(lcpTime);
  const posterFormat = detectFormat(posterUrl);
  const isModernFormat = [ "avif", "webp", "jxl" ].includes(posterFormat);
  const isCrossOrigin = lcp.renderTime === 0 && lcp.loadTime > 0;
  const preloadLinks = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'));
  const posterPreload = preloadLinks.find(link => {
    const href = link.getAttribute("href");
    if (!href) return false;
    try {
      return normalizeUrl(href) === posterUrl || normalizeUrl(href) === lcpUrl;
    } catch {
      return false;
    }
  }) ?? null;
  const preload = element.getAttribute("preload");
  const autoplay = element.hasAttribute("autoplay");
  const muted = element.hasAttribute("muted") || element.muted;
  const playsinline = element.hasAttribute("playsinline");
  const issues = [];
  if (secondsAfterLoad > 10) issues.push({
    s: "warning",
    msg: `The LCP candidate rendered ${secondsAfterLoad} s after the page loaded, because the page stayed open without interaction. Reload and run the snippet again to measure the LCP of the load`
  });
  if (lcpSource === "first-frame") issues.push({
    s: "info",
    msg: "LCP is the first video frame — adding a poster gives explicit control over the LCP image"
  });
  if (lcpSource === "first-frame" && (!autoplay || !muted)) issues.push({
    s: "warning",
    msg: "First-frame LCP requires autoplay + muted for the browser to render it immediately"
  });
  if (posterAttr && !posterPreload) issues.push({
    s: "warning",
    msg: 'No <link rel="preload" as="image"> for the poster — browser discovers it late'
  }); else if (posterPreload && posterPreload.getAttribute("fetchpriority") !== "high") issues.push({
    s: "info",
    msg: 'Preload found but missing fetchpriority="high" — may be deprioritised'
  });
  if (posterAttr && !isModernFormat && posterFormat !== "unknown") issues.push({
    s: "info",
    msg: `Poster uses ${posterFormat} — AVIF or WebP would reduce file size and LCP load time`
  });
  if (isCrossOrigin) issues.push({
    s: "info",
    msg: "renderTime is 0 — resource is cross-origin and the server does not send Timing-Allow-Origin"
  });
  if (!autoplay && preload === "none") issues.push({
    s: "warning",
    msg: 'preload="none" on a non-autoplay video may delay poster image loading in some browsers'
  });
  if (videoUrl) void 0;
  if (posterPreload) {
    posterPreload.getAttribute("fetchpriority");
  } else {
    if (posterAttr) void 0;
  }
  if (issues.length > 0) {
    issues.filter(i => i.s === "error").length;
    issues.filter(i => i.s === "warning").length;
    issues.filter(i => i.s === "info").length;
    issues.forEach(issue => {
      issue.s === "error" || issue.s;
    });
  } else {
  }
  return {
    script: "LCP-Video-Candidate",
    status: "ok",
    metric: "LCP",
    value: lcpTime,
    unit: "ms",
    rating: rating,
    thresholds: {
      good: 2500,
      needsImprovement: 4000
    },
    details: {
      isVideo: true,
      lcpSource: lcpSource,
      posterUrl: posterUrl || null,
      videoUrl: videoUrl,
      posterFormat: posterFormat,
      posterPreloaded: !!posterPreload,
      fetchpriorityOnPreload: posterPreload?.getAttribute("fetchpriority") ?? null,
      isCrossOrigin: isCrossOrigin,
      videoAttributes: {
        autoplay: autoplay,
        muted: muted,
        playsinline: playsinline,
        preload: preload
      }
    },
    issues: issues.map(i => ({
      severity: i.s === "warning" ? "warning" : "info",
      message: i.msg
    }))
  };
})();
