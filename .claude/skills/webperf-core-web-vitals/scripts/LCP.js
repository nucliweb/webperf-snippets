// LCP Quick Check
// https://webperf-snippets.nucliweb.net

(() => {
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

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];

    if (!lastEntry) return;

    const activationStart = getActivationStart();
    const lcpTime = Math.max(0, lastEntry.startTime - activationStart);
    const rating = valueToRating(lcpTime);
    const { icon, color } = RATING[rating];

    console.group(`%cLCP: ${icon} ${(lcpTime / 1000).toFixed(2)}s (${rating})`, `color: ${color}; font-weight: bold; font-size: 14px;`);

    // Element info
    const element = lastEntry.element;
    if (element) {
      console.log("");
      console.log("%cLCP Element:", "font-weight: bold;");

      // Get element identifier
      let selector = element.tagName.toLowerCase();
      if (element.id) selector = `#${element.id}`;
      else if (element.className && typeof element.className === "string") {
        const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (classes) selector = `${element.tagName.toLowerCase()}.${classes}`;
      }

      console.log(`   Element: ${selector}`, element);

      // Element type and details
      const tagName = element.tagName.toLowerCase();
      if (tagName === "img") {
        console.log(`   Type: Image`);
        console.log(`   URL: ${lastEntry.url || element.src}`);
        if (element.naturalWidth) {
          console.log(`   Dimensions: ${element.naturalWidth}×${element.naturalHeight}`);
        }
      } else if (tagName === "video") {
        console.log(`   Type: Video poster`);
        console.log(`   URL: ${lastEntry.url || element.poster}`);
      } else if (element.style?.backgroundImage) {
        console.log(`   Type: Background image`);
        console.log(`   URL: ${lastEntry.url}`);
      } else {
        console.log(`   Type: ${tagName === "h1" || tagName === "p" ? "Text block" : tagName}`);
      }

      // Size
      if (lastEntry.size) {
        console.log(`   Size: ${lastEntry.size.toLocaleString()} px²`);
      }

      // Highlight element
      element.style.outline = "3px dashed lime";
      element.style.outlineOffset = "2px";
      console.log("");
      console.log("%c✓ Element highlighted with green dashed outline", "color: #22c55e;");
    }

    console.groupEnd();
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  console.log("%c⏱️ LCP Tracking Active", "font-weight: bold; font-size: 14px;");
  console.log("   LCP may update as larger elements load.");
})();
