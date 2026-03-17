(() => {
  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
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
    element && element.tagName.toLowerCase();
    const rating = valueToRating(lcpTime);
    if (lcp.url) void 0;
    if (element) void 0;
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
        isVideo: false
      },
      issues: []
    };
  }
  const posterAttr = element.getAttribute("poster") || "";
  const posterUrl = posterAttr ? normalizeUrl(posterAttr) : "";
  const lcpUrl = lcp.url || "";
  const rating = valueToRating(lcpTime);
  const posterFormat = detectFormat(lcpUrl || posterUrl);
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
  if (!posterAttr) issues.push({
    s: "error",
    msg: "No poster attribute — the browser has no image to use as LCP candidate"
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
    msg: "renderTime is 0 — poster is cross-origin and the server does not send Timing-Allow-Origin"
  });
  if (!autoplay && preload === "none") issues.push({
    s: "warning",
    msg: 'preload="none" on a non-autoplay video may delay poster image loading in some browsers'
  });
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
      posterUrl: lcpUrl || posterUrl || null,
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
      severity: i.s === "error" ? "error" : i.s === "warning" ? "warning" : "info",
      message: i.msg
    }))
  };
})();
