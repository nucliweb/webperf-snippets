// Find images with contradictory loading="lazy" and fetchpriority="high"
// https://webperf-snippets.net

(() => {
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


  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  // Find LCP candidate for context
  const viewportImages = Array.from(document.querySelectorAll("img")).filter(
    (img) => isInViewport(img) && img.getBoundingClientRect().width > 0
  );

  let lcpCandidate = null;
  let maxArea = 0;
  viewportImages.forEach((img) => {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      lcpCandidate = img;
    }
  });

  // Find conflicting elements
  const conflictingElements = document.querySelectorAll(
    "[loading=lazy][fetchpriority=high]"
  );

  console.group("%c🔍 Lazy + Fetchpriority Conflict Check", "font-weight: bold; font-size: 14px;");

  if (conflictingElements.length === 0) {
    console.log(
      "%c✅ No conflicts found. No elements have both loading=\"lazy\" and fetchpriority=\"high\".",
      "color: #22c55e; font-weight: bold;"
    );
  } else {
    console.log(
      `%c⚠️ Found ${conflictingElements.length} element(s) with contradictory attributes`,
      "color: #ef4444; font-weight: bold; font-size: 14px;"
    );
    console.log("");

    // Analyze each element
    const tableData = Array.from(conflictingElements).map((el) => {
      const rect = el.getBoundingClientRect();
      const inViewport = isInViewport(el);
      const isLcp = el === lcpCandidate;

      return {
        selector: uniqueSelector(el),
        dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        inViewport: inViewport ? "Yes" : "No",
        isLcpCandidate: isLcp ? "⚠️ Yes" : "No",
        src: (el.currentSrc || el.src || "").slice(-50),
        element: el,
      };
    });

    console.log("%c📋 Conflicting Elements:", "font-weight: bold;");
    console.table(tableData.map((item) => ({
      selector: item.selector,
      dimensions: item.dimensions,
      inViewport: item.inViewport,
      isLcpCandidate: item.isLcpCandidate,
      src: item.src,
    })));

    // Elements for inspection
    console.log("");
    console.log("%c🔎 Elements for inspection:", "font-weight: bold;");
    tableData.forEach(({ element, isLcpCandidate }, i) => {
      const marker = isLcpCandidate === "⚠️ Yes" ? " 🚨 LCP" : "";
      console.log(`${i + 1}.${marker}`, element);
    });

    // Recommendation
    console.log("");
    console.log("%c📝 How to fix:", "color: #3b82f6; font-weight: bold;");
    console.log("");

    tableData.forEach(({ selector, inViewport, isLcpCandidate }) => {
      console.log(`%c${selector}:`, "font-weight: bold;");
      if (inViewport === "Yes" || isLcpCandidate === "⚠️ Yes") {
        console.log("   → Image is in viewport. Remove loading=\"lazy\", keep fetchpriority=\"high\"");
        console.log(
          '%c   <img src="..." fetchpriority="high">',
          "font-family: monospace; color: #22c55e;"
        );
      } else {
        console.log("   → Image is outside viewport. Remove fetchpriority=\"high\", keep loading=\"lazy\"");
        console.log(
          '%c   <img src="..." loading="lazy">',
          "font-family: monospace; color: #22c55e;"
        );
      }
      console.log("");
    });

    console.log("%c💡 General rule:", "font-weight: bold;");
    console.log("   • Above the fold (LCP): fetchpriority=\"high\", NO lazy loading");
    console.log("   • Below the fold: loading=\"lazy\", NO fetchpriority");
  }

  console.groupEnd();

  return {
    script: "Find-Images-With-Lazy-and-Fetchpriority",
    status: "ok",
    count: conflictingElements.length,
    items: Array.from(conflictingElements).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        selector: uniqueSelector(el),
        src: el.currentSrc || el.src || "",
        inViewport: isInViewport(el),
        isLcpCandidate: el === lcpCandidate,
        widthPx: Math.round(rect.width),
        heightPx: Math.round(rect.height),
      };
    }),
    issues: conflictingElements.length > 0
      ? [{ code: "lazy-and-high-priority", severity: "error", message: `${conflictingElements.length} element(s) have conflicting loading="lazy" and fetchpriority="high"` }]
      : [],
  };
})();
