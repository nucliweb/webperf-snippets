(() => {
  const valueToRating = score => score <= 0.1 ? "good" : score <= 0.25 ? "needs-improvement" : "poor";
  const RATING_COLORS = {
    good: "#0CCE6A",
    "needs-improvement": "#FFA400",
    poor: "#FF4E42"
  };
  const RATING_ICONS = {
    good: "🟢",
    "needs-improvement": "🟡",
    poor: "🔴"
  };
  let totalCLS = 0;
  const allShifts = [];
  const elementShifts = new Map;
  const getElementSelector = element => {
    if (!element) return "(unknown)";
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === "string") {
      const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName?.toLowerCase() || "(unknown)";
  };
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const countedForCLS = !entry.hadRecentInput;
      if (countedForCLS) totalCLS += entry.value;
      const sources = entry.sources || [];
      const elements = sources.map(source => ({
        element: source.node,
        selector: getElementSelector(source.node),
        previousRect: source.previousRect,
        currentRect: source.currentRect
      }));
      elements.forEach(el => {
        if (!elementShifts.has(el.selector)) elementShifts.set(el.selector, {
          count: 0,
          totalShift: 0,
          element: el.element
        });
        const data = elementShifts.get(el.selector);
        data.count++;
        data.totalShift += entry.value;
      });
      const shift = {
        value: entry.value,
        countedForCLS: countedForCLS,
        elements: elements,
        time: entry.startTime,
        entry: entry
      };
      allShifts.push(shift);
      if (entry.value > 0.001) {
        const rating = valueToRating(totalCLS);
        countedForCLS && RATING_ICONS[rating];
        RATING_COLORS[rating];
        if (elements.length > 0) {
          elements.forEach((el, i) => {
            if (el.previousRect && el.currentRect) {
              const dx = el.currentRect.x - el.previousRect.x;
              const dy = el.currentRect.y - el.previousRect.y;
              const dw = el.currentRect.width - el.previousRect.width;
              const dh = el.currentRect.height - el.previousRect.height;
              const changes = [];
              if (Math.abs(dx) > 0) changes.push(`x: ${dx > 0 ? "+" : ""}${Math.round(dx)}px`);
              if (Math.abs(dy) > 0) changes.push(`y: ${dy > 0 ? "+" : ""}${Math.round(dy)}px`);
              if (Math.abs(dw) > 0) changes.push(`width: ${dw > 0 ? "+" : ""}${Math.round(dw)}px`);
              if (Math.abs(dh) > 0) changes.push(`height: ${dh > 0 ? "+" : ""}${Math.round(dh)}px`);
              if (changes.length > 0) void 0;
            }
          });
        } else void 0;
      }
    }
  });
  observer.observe({
    type: "layout-shift",
    buffered: true
  });
  window.getLayoutShiftSummary = () => {
    const rating = valueToRating(totalCLS);
    RATING_ICONS[rating];
    RATING_COLORS[rating];
    const countedShifts = allShifts.filter(s => s.countedForCLS);
    const excludedShifts = allShifts.filter(s => !s.countedForCLS);
    if (countedShifts.length > 0) {
      Math.max(...countedShifts.map(s => s.value));
    }
    if (elementShifts.size > 0) {
      const sortedElements = Array.from(elementShifts.entries()).sort((a, b) => b[1].totalShift - a[1].totalShift).slice(0, 5);
      sortedElements.map(([selector, data]) => ({
        Element: selector,
        "Shift Count": data.count,
        "Total Impact": data.totalShift.toFixed(4)
      }));
      sortedElements.forEach(([selector, data], i) => {
      });
    }
    if (countedShifts.length > 0) {
      const significant = countedShifts.filter(s => s.value > 0.001);
      if (significant.length > 0) {
        significant.map(s => ({
          "Time (ms)": Math.round(s.time),
          Value: s.value.toFixed(4),
          Elements: s.elements.map(e => e.selector).join(", ") || "(unknown)"
        }));
      } else void 0;
    }
    if (rating !== "good") {
    }
    const topElementsData = Array.from(elementShifts.entries()).sort((a, b) => b[1].totalShift - a[1].totalShift).slice(0, 5).map(([selector, data]) => ({
      selector: selector,
      shiftCount: data.count,
      totalImpact: Math.round(data.totalShift * 10000) / 10000
    }));
    return {
      script: "Layout-Shift-Loading-and-Interaction",
      status: "ok",
      metric: "CLS",
      value: Math.round(totalCLS * 10000) / 10000,
      unit: "score",
      rating: rating,
      thresholds: {
        good: 0.1,
        needsImprovement: 0.25
      },
      details: {
        currentCLS: Math.round(totalCLS * 10000) / 10000,
        shiftCount: allShifts.length,
        countedShifts: countedShifts.length,
        excludedShifts: excludedShifts.length,
        topElements: topElementsData
      }
    };
  };
  const rating = valueToRating(totalCLS);
  RATING_ICONS[rating];
  const clsBufferedSync = performance.getEntriesByType("layout-shift").reduce((sum, e) => !e.hadRecentInput ? sum + e.value : sum, 0);
  const countedSync = performance.getEntriesByType("layout-shift").filter(e => !e.hadRecentInput).length;
  const excludedSync = performance.getEntriesByType("layout-shift").filter(e => e.hadRecentInput).length;
  const clsRatingSync = valueToRating(clsBufferedSync);
  return {
    script: "Layout-Shift-Loading-and-Interaction",
    status: "tracking",
    metric: "CLS",
    value: Math.round(clsBufferedSync * 10000) / 10000,
    unit: "score",
    rating: clsRatingSync,
    thresholds: {
      good: 0.1,
      needsImprovement: 0.25
    },
    details: {
      currentCLS: Math.round(clsBufferedSync * 10000) / 10000,
      shiftCount: countedSync + excludedSync,
      countedShifts: countedSync,
      excludedShifts: excludedSync
    },
    message: "Layout shift tracking active. Call getLayoutShiftSummary() for full element attribution.",
    getDataFn: "getLayoutShiftSummary"
  };
})();
