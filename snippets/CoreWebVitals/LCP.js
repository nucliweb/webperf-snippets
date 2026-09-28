// LCP Quick Check
// https://webperf-snippets.nucliweb.net

(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    console.warn("⚠️ largest-contentful-paint entries are not supported in this browser.");
    return { script: "LCP", status: "unsupported", error: "largest-contentful-paint entries not supported in this browser" };
  }
  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };

  let lastPrintedTime = -1;

  const printLCP = (entry) => {
    const activationStart = getActivationStart();
    const lcpTime = Math.max(0, entry.startTime - activationStart);
    if (lcpTime === lastPrintedTime) return;
    lastPrintedTime = lcpTime;

    const rating = valueToRating(lcpTime);
    const { icon, color } = RATING[rating];

    console.group(`%cLCP: ${icon} ${(lcpTime / 1000).toFixed(2)}s (${rating})`, `color: ${color}; font-weight: bold; font-size: 14px;`);

    const element = entry.element;
    if (element) {
      console.log("");
      console.log("%cLCP Element:", "font-weight: bold;");

      let selector = element.tagName.toLowerCase();
      if (element.id) selector = `#${element.id}`;
      else if (element.className && typeof element.className === "string") {
        const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (classes) selector = `${element.tagName.toLowerCase()}.${classes}`;
      }

      console.log(`   Element: ${selector}`, element);

      const tagName = element.tagName.toLowerCase();
      if (tagName === "img") {
        console.log(`   Type: Image`);
        console.log(`   URL: ${entry.url || element.src}`);
        if (element.naturalWidth) {
          console.log(`   Dimensions: ${element.naturalWidth}×${element.naturalHeight}`);
        }
      } else if (tagName === "video") {
        console.log(`   Type: Video poster`);
        console.log(`   URL: ${entry.url || element.poster}`);
      } else if (window.getComputedStyle(element).backgroundImage !== "none") {
        console.log(`   Type: Background image`);
        console.log(`   URL: ${entry.url}`);
      } else {
        console.log(`   Type: ${tagName === "h1" || tagName === "p" ? "Text block" : tagName}`);
      }

      if (entry.size) {
        console.log(`   Size: ${entry.size.toLocaleString()} px²`);
      }

      element.style.outline = "3px dashed lime";
      element.style.outlineOffset = "2px";
      console.log("");
      console.log("%c✓ Element highlighted with green dashed outline", "color: #22c55e;");
    }

    console.groupEnd();
  };

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) printLCP(lastEntry);
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  console.log("%c⏱️ LCP Tracking Active", "font-weight: bold; font-size: 14px;");
  console.log("   LCP may update as larger elements load.");

  // Return for agent — collect via buffered observer (getEntriesByType does not
  // expose largest-contentful-paint entries in Chrome without an active observer).
  // 100ms gives the observer time to process buffered entries on busy pages.
  const lastLcpEntry = await new Promise((resolve) => {
    const entries = [];
    const obs = new PerformanceObserver((list) => entries.push(...list.getEntries()));
    obs.observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => { obs.disconnect(); resolve(entries.at(-1) ?? null); }, 100);
  });
  if (!lastLcpEntry) {
    return { script: "LCP", status: "error", error: "No LCP entries buffered" };
  }

  const lcpActivationStart = getActivationStart();
  const lcpValue = Math.round(Math.max(0, lastLcpEntry.startTime - lcpActivationStart));
  const lcpRating = valueToRating(lcpValue);
  const lcpEl = lastLcpEntry.element;
  let lcpSelector = null;
  let lcpType = null;
  if (lcpEl) {
    lcpSelector = lcpEl.tagName.toLowerCase();
    if (lcpEl.id) lcpSelector = `#${lcpEl.id}`;
    else if (lcpEl.className && typeof lcpEl.className === "string") {
      const classes = lcpEl.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) lcpSelector = `${lcpEl.tagName.toLowerCase()}.${classes}`;
    }
    const tag = lcpEl.tagName.toLowerCase();
    lcpType = tag === "img" ? "Image" : tag === "video" ? "Video poster" :
      window.getComputedStyle(lcpEl).backgroundImage !== "none" ? "Background image" :
      (tag === "h1" || tag === "p" ? "Text block" : tag);
  }
  return {
    script: "LCP",
    status: "ok",
    metric: "LCP",
    value: lcpValue,
    unit: "ms",
    rating: lcpRating,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      element: lcpSelector,
      elementType: lcpType,
      url: lastLcpEntry.url || null,
      sizePixels: lastLcpEntry.size || null,
    },
  };
})();
