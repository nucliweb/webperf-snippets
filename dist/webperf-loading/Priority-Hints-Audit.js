(() => {
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
  }
  function findLcpCandidate() {
    const imgs = Array.from(document.querySelectorAll("img")).filter(isInViewport);
    let candidate = null;
    let maxArea = 0;
    imgs.forEach(img => {
      const {width: width, height: height} = img.getBoundingClientRect();
      const area = width * height;
      if (area > maxArea) {
        maxArea = area;
        candidate = img;
      }
    });
    return candidate;
  }
  function shortUrl(el) {
    const src = el.src || el.href || el.getAttribute("href") || "";
    return src.split("/").pop()?.split("?")[0] || src.slice(-50) || "(unknown)";
  }
  const entryMap = new Map;
  performance.getEntriesByType("resource").forEach(e => {
    try {
      entryMap.set(new URL(e.name, location.origin).href, e);
    } catch {}
  });
  function getEntry(el) {
    const src = el.src || el.href || el.getAttribute("href") || "";
    if (!src) return null;
    try {
      return entryMap.get(new URL(src, location.origin).href) || null;
    } catch {
      return null;
    }
  }
  const allElements = Array.from(document.querySelectorAll("[fetchpriority]"));
  const nonImageElements = allElements.filter(el => el.tagName !== "IMG");
  allElements.filter(el => el.tagName === "IMG");
  const preloadsWithPriority = Array.from(document.querySelectorAll('link[rel="preload"][fetchpriority]'));
  const lcpCandidate = findLcpCandidate();
  const issues = [];
  preloadsWithPriority.filter(link => link.getAttribute("fetchpriority") === "low").forEach(link => {
    issues.push({
      severity: "error",
      element: link,
      resource: shortUrl(link),
      message: 'preload + fetchpriority="low" is contradictory',
      detail: 'preload signals this resource is critical for the current page; fetchpriority="low" contradicts that.',
      fix: 'Remove fetchpriority="low", or use fetchpriority="high" if the resource is truly critical'
    });
  });
  allElements.filter(el => el.getAttribute("fetchpriority") === "low").forEach(el => {
    const entry = getEntry(el);
    if (entry && entry.startTime < 500) issues.push({
      severity: "warning",
      element: el,
      resource: shortUrl(el),
      message: `fetchpriority="low" but loaded at ${entry.startTime.toFixed(0)}ms`,
      detail: "This resource loaded very early. If it's genuinely non-critical, the browser is deprioritizing it correctly. Otherwise, reconsider the priority.",
      fix: 'Verify the resource is non-critical, or remove fetchpriority="low"'
    });
  });
  allElements.filter(el => el.getAttribute("fetchpriority") === "high").forEach(el => {
    const entry = getEntry(el);
    if (entry && entry.startTime > 3000) issues.push({
      severity: "warning",
      element: el,
      resource: shortUrl(el),
      message: `fetchpriority="high" but loaded at ${entry.startTime.toFixed(0)}ms`,
      detail: "High-priority resources should load early. A late start may indicate render-blocking dependencies or incorrect placement in the document.",
      fix: "Move the element earlier in the HTML or investigate render-blocking dependencies"
    });
  });
  if (lcpCandidate && lcpCandidate.getAttribute("fetchpriority") !== "high") {
    const fp = lcpCandidate.getAttribute("fetchpriority");
    issues.push({
      severity: "warning",
      element: lcpCandidate,
      resource: (lcpCandidate.currentSrc || lcpCandidate.src).split("/").pop()?.split("?")[0] || "LCP image",
      message: `LCP candidate image ${fp ? `has fetchpriority="${fp}"` : "has no fetchpriority set"}`,
      detail: 'The largest visible image is likely the LCP element and benefits most from fetchpriority="high".',
      fix: 'Add fetchpriority="high" to the LCP image to improve Largest Contentful Paint'
    });
  }
  const highCount = allElements.filter(el => el.getAttribute("fetchpriority") === "high").length;
  const lowCount = allElements.filter(el => el.getAttribute("fetchpriority") === "low").length;
  const autoCount = allElements.filter(el => el.getAttribute("fetchpriority") === "auto").length;
  if (allElements.length === 0 && !lcpCandidate) {
    return {
      script: "Priority-Hints-Audit",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  if (lcpCandidate) {
    lcpCandidate.getAttribute("fetchpriority");
  }
  if (nonImageElements.length > 0) {
    nonImageElements.forEach((el, i) => {});
  }
  if (preloadsWithPriority.length > 0) {
  }
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  if (issues.length > 0) {
    [ ...errors, ...warnings ].forEach(issue => {
      issue.severity;
      issue.severity;
    });
  } else {
  }
  return {
    script: "Priority-Hints-Audit",
    status: "ok",
    count: allElements.length,
    details: {
      highCount: highCount,
      lowCount: lowCount,
      autoCount: autoCount,
      preloadsWithPriorityCount: preloadsWithPriority.length,
      lcpCandidateHasFetchpriority: lcpCandidate ? lcpCandidate.getAttribute("fetchpriority") === "high" : null
    },
    items: allElements.map(el => ({
      tag: el.tagName.toLowerCase(),
      fetchpriority: el.getAttribute("fetchpriority"),
      resource: (el.src || el.href || el.getAttribute("href") || "").split("/").pop()?.split("?")[0] || ""
    })),
    issues: issues.map(i => ({
      severity: i.severity,
      message: i.message
    }))
  };
})();
