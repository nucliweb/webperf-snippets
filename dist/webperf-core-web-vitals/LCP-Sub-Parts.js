(() => {
  const formatMs = ms => `${Math.round(ms)}ms`;
  const formatPercent = (value, total) => `${Math.round(value / total * 100)}%`;
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
  const SUB_PARTS = [ {
    name: "Time to First Byte",
    key: "ttfb",
    target: 800
  }, {
    name: "Resource Load Delay",
    key: "resourceLoadDelay",
    targetPercent: 10
  }, {
    name: "Resource Load Time",
    key: "resourceLoadTime",
    targetPercent: 40
  }, {
    name: "Element Render Delay",
    key: "elementRenderDelay",
    targetPercent: 10
  } ];
  const getNavigationEntry = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (navEntry?.responseStart > 0 && navEntry.responseStart < performance.now()) return navEntry;
    return null;
  };
  const observer = new PerformanceObserver(list => {
    const lcpEntry = list.getEntries().at(-1);
    if (!lcpEntry) return;
    const navEntry = getNavigationEntry();
    if (!navEntry) return;
    const lcpResEntry = performance.getEntriesByType("resource").find(e => e.name === lcpEntry.url);
    const activationStart = navEntry.activationStart || 0;
    const ttfb = Math.max(0, navEntry.responseStart - activationStart);
    const lcpRequestStart = Math.max(ttfb, lcpResEntry ? (lcpResEntry.requestStart || lcpResEntry.startTime) - activationStart : 0);
    const lcpResponseEnd = Math.max(lcpRequestStart, lcpResEntry ? lcpResEntry.responseEnd - activationStart : 0);
    const lcpRenderTime = Math.max(lcpResponseEnd, lcpEntry.startTime - activationStart);
    const subPartValues = {
      ttfb: ttfb,
      resourceLoadDelay: lcpRequestStart - ttfb,
      resourceLoadTime: lcpResponseEnd - lcpRequestStart,
      elementRenderDelay: lcpRenderTime - lcpResponseEnd
    };
    const rating = valueToRating(lcpRenderTime);
    const {icon: icon, color: color} = RATING[rating];
    if (lcpEntry.element) {
      const el = lcpEntry.element;
      let selector = el.tagName.toLowerCase();
      if (el.id) selector = `#${el.id}`; else if (el.className && typeof el.className === "string") {
        const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (classes) selector = `${el.tagName.toLowerCase()}.${classes}`;
      }
      if (lcpEntry.url) {
        (() => {
          try {
            const u = new URL(lcpEntry.url);
            return u.hostname !== location.hostname ? `${u.hostname}/…/${u.pathname.split("/").pop()?.split("?")[0]}` : u.pathname.split("/").pop()?.split("?")[0] || lcpEntry.url;
          } catch {
            return lcpEntry.url;
          }
        })();
      }
      el.style.outline = "3px dashed lime";
      el.style.outlineOffset = "2px";
    }
    const phases = SUB_PARTS.map(part => ({
      ...part,
      value: subPartValues[part.key],
      percent: subPartValues[part.key] / lcpRenderTime * 100
    }));
    const slowest = phases.reduce((a, b) => a.value > b.value ? a : b);
    phases.map(part => {
      const isSlowest = part.key === slowest.key;
      const isOverTarget = part.target ? part.value > part.target : part.percent > part.targetPercent;
      return {
        "Sub-part": isSlowest ? `⚠️ ${part.name}` : part.name,
        Time: formatMs(part.value),
        "%": formatPercent(part.value, lcpRenderTime),
        Status: isOverTarget ? "🔴 Over target" : "✅ OK"
      };
    });
    const barWidth = 40;
    const bars = phases.map(p => {
      const width = Math.max(1, Math.round(p.value / lcpRenderTime * barWidth));
      return {
        key: p.key,
        bar: width
      };
    });
    "█".repeat(bars[0].bar);
    "▓".repeat(bars[1].bar);
    "▒".repeat(bars[2].bar);
    "░".repeat(bars[3].bar);
    if (slowest.key === "ttfb") {
    } else if (slowest.key === "resourceLoadDelay") {
    } else if (slowest.key === "resourceLoadTime") {
    } else if (slowest.key === "elementRenderDelay") {
    }
    SUB_PARTS.forEach(part => performance.clearMeasures(part.name));
    phases.forEach(part => {
      const startTimes = {
        ttfb: 0,
        resourceLoadDelay: ttfb,
        resourceLoadTime: lcpRequestStart,
        elementRenderDelay: lcpResponseEnd
      };
      performance.measure(part.name, {
        start: startTimes[part.key],
        end: startTimes[part.key] + part.value
      });
    });
  });
  observer.observe({
    type: "largest-contentful-paint",
    buffered: true
  });
  const lcpBuffered = performance.getEntriesByType("largest-contentful-paint");
  const lcpEntry = lcpBuffered.at(-1);
  if (!lcpEntry) return {
    script: "LCP-Sub-Parts",
    status: "error",
    error: "No LCP entries yet"
  };
  const navEntrySync = getNavigationEntry();
  if (!navEntrySync) return {
    script: "LCP-Sub-Parts",
    status: "error",
    error: "No navigation entry"
  };
  const lcpResEntrySync = performance.getEntriesByType("resource").find(e => e.name === lcpEntry.url);
  const activationStartSync = navEntrySync.activationStart || 0;
  const ttfbSync = Math.max(0, navEntrySync.responseStart - activationStartSync);
  const lcpRequestStartSync = Math.max(ttfbSync, lcpResEntrySync ? (lcpResEntrySync.requestStart || lcpResEntrySync.startTime) - activationStartSync : 0);
  const lcpResponseEndSync = Math.max(lcpRequestStartSync, lcpResEntrySync ? lcpResEntrySync.responseEnd - activationStartSync : 0);
  const lcpRenderTimeSync = Math.max(lcpResponseEndSync, lcpEntry.startTime - activationStartSync);
  const totalSync = Math.round(lcpRenderTimeSync);
  const ratingSync = valueToRating(totalSync);
  const ttfbVal = Math.round(ttfbSync);
  const loadDelayVal = Math.round(lcpRequestStartSync - ttfbSync);
  const loadTimeVal = Math.round(lcpResponseEndSync - lcpRequestStartSync);
  const renderDelayVal = Math.round(lcpRenderTimeSync - lcpResponseEndSync);
  const subPartsForRank = [ {
    key: "ttfb",
    value: ttfbVal
  }, {
    key: "resourceLoadDelay",
    value: loadDelayVal
  }, {
    key: "resourceLoadTime",
    value: loadTimeVal
  }, {
    key: "elementRenderDelay",
    value: renderDelayVal
  } ];
  const slowestPhaseSync = subPartsForRank.reduce((a, b) => a.value > b.value ? a : b).key;
  let lcpSelectorSync = null;
  if (lcpEntry.element) {
    const el = lcpEntry.element;
    lcpSelectorSync = el.tagName.toLowerCase();
    if (el.id) lcpSelectorSync = `#${el.id}`; else if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) lcpSelectorSync = `${el.tagName.toLowerCase()}.${classes}`;
    }
  }
  const shortUrlSync = lcpEntry.url ? (() => {
    try {
      const u = new URL(lcpEntry.url);
      return u.hostname !== location.hostname ? `${u.hostname}/…/${u.pathname.split("/").pop()?.split("?")[0]}` : u.pathname.split("/").pop()?.split("?")[0] || lcpEntry.url;
    } catch {
      return lcpEntry.url;
    }
  })() : null;
  return {
    script: "LCP-Sub-Parts",
    status: "ok",
    metric: "LCP",
    value: totalSync,
    unit: "ms",
    rating: ratingSync,
    thresholds: {
      good: 2500,
      needsImprovement: 4000
    },
    details: {
      element: lcpSelectorSync,
      url: shortUrlSync,
      subParts: {
        ttfb: {
          value: ttfbVal,
          percent: Math.round(ttfbVal / totalSync * 100),
          overTarget: ttfbVal > 800
        },
        resourceLoadDelay: {
          value: loadDelayVal,
          percent: Math.round(loadDelayVal / totalSync * 100),
          overTarget: loadDelayVal / totalSync * 100 > 10
        },
        resourceLoadTime: {
          value: loadTimeVal,
          percent: Math.round(loadTimeVal / totalSync * 100),
          overTarget: loadTimeVal / totalSync * 100 > 40
        },
        elementRenderDelay: {
          value: renderDelayVal,
          percent: Math.round(renderDelayVal / totalSync * 100),
          overTarget: renderDelayVal / totalSync * 100 > 10
        }
      },
      slowestPhase: slowestPhaseSync
    }
  };
})();
