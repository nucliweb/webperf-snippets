// LCP Trail
// Tracks all LCP candidate elements during page load
// https://webperf-snippets.net

(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    console.warn("⚠️ largest-contentful-paint entries are not supported in this browser.");
    return { script: "LCP-Trail", status: "unsupported", error: "largest-contentful-paint entries not supported in this browser" };
  }
  const PALETTE = [
    { color: "#EF4444", name: "Red" },
    { color: "#F97316", name: "Orange" },
    { color: "#22C55E", name: "Green" },
    { color: "#3B82F6", name: "Blue" },
    { color: "#A855F7", name: "Purple" },
    { color: "#EC4899", name: "Pink" },
  ];

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

  // @shared uniqueSelector
  // A CSS selector that matches only el in its document (or shadow root): its id when it is unique,
  // otherwise a path of tag, classes and :nth-of-type() that goes up to the nearest ancestor with a
  // unique id, or to the root, and stops as soon as it matches one element.
  function uniqueSelector(el) {
    const root = el.getRootNode();
    const matchesOne = (selector) => {
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
      let part = tag + Array.from(node.classList).slice(0, 2).map((c) => `.${window.CSS.escape(c)}`).join("");
      const siblings = node.parentNode ? Array.from(node.parentNode.children) : [node];
      if (siblings.filter((s) => s.matches(part)).length > 1) {
        part += `:nth-of-type(${siblings.filter((s) => s.localName === tag).indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (matchesOne(parts.join(" > "))) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  // @end-shared uniqueSelector

  // The element of an entry is null once its node has left the DOM, as with a loading spinner that
  // an app removes when it renders. The entry keeps its time, size and URL.
  const REMOVED = "(removed from DOM)";

  const getElementInfo = (element, entry) => {
    if (!element) return entry.url ? { type: "Image", url: entry.url } : { type: "Removed element" };
    const tag = element.tagName.toLowerCase();
    if (tag === "img") return { type: "Image", url: entry.url || element.src };
    if (tag === "video") return { type: "Video poster", url: entry.url || element.poster };
    if (window.getComputedStyle(element).backgroundImage !== "none") return { type: "Background image", url: entry.url };
    return { type: tag === "h1" || tag === "p" ? "Text block" : tag };
  };

  // One candidate per element, or per entry when its element was removed
  const candidateKey = (entry) => entry.element ?? `${entry.startTime}|${entry.size}`;

  // A data: URL keeps its media type, and another URL its file name
  const shortUrl = (url) => {
    if (url.startsWith("data:")) return `${url.split(",")[0]},…`;
    try {
      const u = new URL(url);
      const file = u.pathname.split("/").pop()?.split("?")[0];
      return u.hostname !== location.hostname ? `${u.hostname}/…/${file}` : file || url;
    } catch { return url; }
  };

  const candidates = [];

  const logTrail = () => {
    const current = candidates[candidates.length - 1];
    if (!current) return;

    const rating = valueToRating(current.time);
    const { icon, color: ratingColor } = RATING[rating];

    console.group(
      `%cLCP: ${icon} ${(current.time / 1000).toFixed(2)}s (${rating})`,
      `color: ${ratingColor}; font-weight: bold; font-size: 14px;`
    );

    // Current LCP element attribution
    console.log("");
    console.log("%cLCP Element:", "font-weight: bold;");
    if (current.element) console.log(`   Element: ${current.selector}`, current.element);
    else console.log(`   Element: ${REMOVED}${current.entry.id ? ` #${current.entry.id}` : ""}`);

    const { type, url } = getElementInfo(current.element, current.entry);
    console.log(`   Type: ${type}`);
    if (url) console.log(`   URL: ${shortUrl(url)}`);
    if (current.element?.naturalWidth) {
      console.log(
        `   Dimensions: ${current.element.naturalWidth}×${current.element.naturalHeight}`
      );
    }
    if (current.entry.size) {
      console.log(`   Size: ${current.entry.size.toLocaleString()} px²`);
    }

    // Trail legend
    console.log("");
    console.log("%cCandidates Trail:", "font-weight: bold;");
    candidates.forEach(({ index, selector, color, name, time, element }) => {
      const isCurrent = index === candidates.length;
      console.log(
        `%c  ● ${index}. ${selector}`,
        `color: ${color}; font-weight: ${isCurrent ? "bold" : "normal"};`,
        `| ${(time / 1000).toFixed(2)}s${element ? ` — ${name}` : ""}${isCurrent ? " ← LCP" : ""}`,
        ...(element ? [element] : [])
      );
    });

    console.log("");
    console.log(
      "%c✓ Each candidate in the DOM highlighted with a colored dashed outline",
      "color: #22c55e;"
    );
    console.groupEnd();
  };

  const observer = new PerformanceObserver((list) => {
    const activationStart = getActivationStart();
    const seen = new Set(candidates.map((c) => candidateKey(c.entry)));

    for (const entry of list.getEntries()) {
      const key = candidateKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);

      const { element } = entry;
      const { color, name } = PALETTE[candidates.length % PALETTE.length];

      if (element) {
        element.style.outline = `3px dashed ${color}`;
        element.style.outlineOffset = "2px";
      }

      candidates.push({
        index: candidates.length + 1,
        element,
        selector: element ? uniqueSelector(element) : REMOVED,
        color: element ? color : "#9CA3AF",
        name,
        time: Math.max(0, entry.startTime - activationStart),
        entry,
      });
    }

    logTrail();
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  console.log("%c⏱️ LCP Trail Active", "font-weight: bold; font-size: 14px;");
  console.log("   Highlights all LCP candidate elements with distinct colors.");

  // Return for agent (buffered entries)
  // Chrome only exposes largest-contentful-paint entries through a PerformanceObserver,
  // so performance.getEntriesByType() returns [] here. Collect via a buffered observer.
  const trailEntries = await new Promise((resolve) => {
    const entries = [];
    const obs = new PerformanceObserver((list) => entries.push(...list.getEntries()));
    obs.observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => { obs.disconnect(); resolve(entries); }, 100);
  });
  if (trailEntries.length === 0) {
    return { script: "LCP-Trail", status: "error", error: "No LCP entries yet" };
  }
  const trailActivationStart = getActivationStart();
  const byKey = new Map();
  for (const entry of trailEntries) {
    const key = candidateKey(entry);
    if (byKey.has(key)) continue;
    const el = entry.element;
    const { type, url } = getElementInfo(el, entry);
    byKey.set(key, {
      index: byKey.size + 1,
      selector: el ? uniqueSelector(el) : null,
      ...(el ? {} : { removed: true }),
      ...(!el && entry.id ? { id: entry.id } : {}),
      time: Math.round(Math.max(0, entry.startTime - trailActivationStart)),
      elementType: type,
      sizePixels: entry.size,
      ...(url ? { url: shortUrl(url) } : {}),
    });
  }
  const syncCandidates = [...byKey.values()];
  // The LCP is the last entry, whether or not its element is still in the DOM
  const lastEntry = trailEntries.at(-1);
  const lastCandidate = byKey.get(candidateKey(lastEntry));
  const trailValue = Math.round(Math.max(0, lastEntry.startTime - trailActivationStart));
  const trailRating = valueToRating(trailValue);
  return {
    script: "LCP-Trail",
    status: "ok",
    metric: "LCP",
    value: trailValue,
    unit: "ms",
    rating: trailRating,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      candidateCount: syncCandidates.length,
      finalElement: lastCandidate.selector,
      candidates: syncCandidates,
    },
  };
})();
