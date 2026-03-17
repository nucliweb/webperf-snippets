(() => {
  const PALETTE = [ {
    color: "#EF4444",
    name: "Red"
  }, {
    color: "#F97316",
    name: "Orange"
  }, {
    color: "#22C55E",
    name: "Green"
  }, {
    color: "#3B82F6",
    name: "Blue"
  }, {
    color: "#A855F7",
    name: "Purple"
  }, {
    color: "#EC4899",
    name: "Pink"
  } ];
  const valueToRating = ms => ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";
  const RATING = {
    good: {
      icon: "🟢",
      color: "#0CCE6A"
    },
    "needs-improvement": {
      icon: "🟡",
      color: "#FFA400"
    },
    poor: {
      icon: "🔴",
      color: "#FF4E42"
    }
  };
  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };
  const getSelector = element => {
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === "string") {
      const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  };
  const getElementInfo = (element, entry) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "img") return {
      type: "Image",
      url: entry.url || element.src
    };
    if (tag === "video") return {
      type: "Video poster",
      url: entry.url || element.poster
    };
    if (window.getComputedStyle(element).backgroundImage !== "none") return {
      type: "Background image",
      url: entry.url
    };
    return {
      type: tag === "h1" || tag === "p" ? "Text block" : tag
    };
  };
  const candidates = [];
  const logTrail = () => {
    const current = candidates[candidates.length - 1];
    if (!current) return;
    const rating = valueToRating(current.time);
    const {icon: icon, color: ratingColor} = RATING[rating];
    const {type: type, url: url} = getElementInfo(current.element, current.entry);
    if (url) void 0;
    if (current.element.naturalWidth) void 0;
    if (current.entry.size) void 0;
    candidates.forEach(({index: index, selector: selector, color: color, name: name, time: time, element: element}) => {
      candidates.length;
    });
  };
  const observer = new PerformanceObserver(list => {
    const activationStart = getActivationStart();
    const seen = new Set(candidates.map(c => c.element));
    for (const entry of list.getEntries()) {
      const {element: element} = entry;
      if (!element || seen.has(element)) continue;
      const {color: color, name: name} = PALETTE[candidates.length % PALETTE.length];
      element.style.outline = `3px dashed ${color}`;
      element.style.outlineOffset = "2px";
      candidates.push({
        index: candidates.length + 1,
        element: element,
        selector: getSelector(element),
        color: color,
        name: name,
        time: Math.max(0, entry.startTime - activationStart),
        entry: entry
      });
      seen.add(element);
    }
    logTrail();
  });
  observer.observe({
    type: "largest-contentful-paint",
    buffered: true
  });
  const trailEntries = performance.getEntriesByType("largest-contentful-paint");
  if (trailEntries.length === 0) return {
    script: "LCP-Trail",
    status: "error",
    error: "No LCP entries yet"
  };
  const trailActivationStart = getActivationStart();
  const seenEls = new Set;
  const syncCandidates = [];
  for (const entry of trailEntries) {
    const el = entry.element;
    if (!el || seenEls.has(el)) continue;
    seenEls.add(el);
    const selector = getSelector(el);
    const time = Math.round(Math.max(0, entry.startTime - trailActivationStart));
    const {type: type, url: url} = getElementInfo(el, entry);
    syncCandidates.push({
      index: syncCandidates.length + 1,
      selector: selector,
      time: time,
      elementType: type,
      ...url ? {
        url: (() => {
          try {
            const u = new URL(url);
            return u.hostname !== location.hostname ? `${u.hostname}/…/${u.pathname.split("/").pop()?.split("?")[0]}` : u.pathname.split("/").pop()?.split("?")[0] || url;
          } catch {
            return url;
          }
        })()
      } : {}
    });
  }
  if (syncCandidates.length === 0) return {
    script: "LCP-Trail",
    status: "error",
    error: "No LCP elements in DOM"
  };
  const lastCandidate = syncCandidates.at(-1);
  const trailValue = lastCandidate.time;
  const trailRating = valueToRating(trailValue);
  return {
    script: "LCP-Trail",
    status: "ok",
    metric: "LCP",
    value: trailValue,
    unit: "ms",
    rating: trailRating,
    thresholds: {
      good: 2500,
      needsImprovement: 4000
    },
    details: {
      candidateCount: syncCandidates.length,
      finalElement: lastCandidate.selector,
      candidates: syncCandidates
    }
  };
})();
