(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    return {
      script: "LCP",
      status: "unsupported",
      error: "largest-contentful-paint entries not supported in this browser"
    };
  }
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
  function uniqueSelector(el) {
    const root = el.getRootNode();
    const matchesOne = selector => {
      try {
        return root.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.id && matchesOne(`#${window.CSS.escape(node.id)}`)) {
        parts.unshift(`#${window.CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let part = tag + Array.from(node.classList).slice(0, 2).map(c => `.${window.CSS.escape(c)}`).join("");
      const siblings = node.parentNode ? Array.from(node.parentNode.children) : [ node ];
      if (siblings.filter(s => s.matches(part)).length > 1) part += `:nth-of-type(${siblings.filter(s => s.localName === tag).indexOf(node) + 1})`;
      parts.unshift(part);
      if (matchesOne(parts.join(" > "))) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };
  let lastPrintedTime = -1;
  const printLCP = entry => {
    const activationStart = getActivationStart();
    const lcpTime = Math.max(0, entry.startTime - activationStart);
    if (lcpTime === lastPrintedTime) return;
    lastPrintedTime = lcpTime;
    const rating = valueToRating(lcpTime);
    const {icon: icon, color: color} = RATING[rating];
    const element = entry.element;
    if (element) {
      const tagName = element.tagName.toLowerCase();
      if (tagName === "img") {
        if (element.naturalWidth) void 0;
      } else if (tagName === "video") {
      } else if (window.getComputedStyle(element).backgroundImage !== "none") {
      } else void 0;
      if (entry.size) void 0;
      element.style.outline = "3px dashed lime";
      element.style.outlineOffset = "2px";
    }
  };
  const observer = new PerformanceObserver(list => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) printLCP(lastEntry);
  });
  observer.observe({
    type: "largest-contentful-paint",
    buffered: true
  });
  const lastLcpEntry = await new Promise(resolve => {
    const entries = [];
    const obs = new PerformanceObserver(list => entries.push(...list.getEntries()));
    obs.observe({
      type: "largest-contentful-paint",
      buffered: true
    });
    setTimeout(() => {
      obs.disconnect();
      resolve(entries.at(-1) ?? null);
    }, 100);
  });
  if (!lastLcpEntry) return {
    script: "LCP",
    status: "error",
    error: "No LCP entries buffered"
  };
  const lcpActivationStart = getActivationStart();
  const lcpValue = Math.round(Math.max(0, lastLcpEntry.startTime - lcpActivationStart));
  const lcpRating = valueToRating(lcpValue);
  const lcpEl = lastLcpEntry.element;
  let lcpSelector = null;
  let lcpType = null;
  if (lcpEl) {
    lcpSelector = uniqueSelector(lcpEl);
    const tag = lcpEl.tagName.toLowerCase();
    lcpType = tag === "img" ? "Image" : tag === "video" ? "Video poster" : window.getComputedStyle(lcpEl).backgroundImage !== "none" ? "Background image" : tag === "h1" || tag === "p" ? "Text block" : tag;
  }
  return {
    script: "LCP",
    status: "ok",
    metric: "LCP",
    value: lcpValue,
    unit: "ms",
    rating: lcpRating,
    thresholds: {
      good: 2500,
      needsImprovement: 4000
    },
    details: {
      element: lcpSelector,
      elementType: lcpType,
      url: lastLcpEntry.url || null,
      sizePixels: lastLcpEntry.size || null
    }
  };
})();
