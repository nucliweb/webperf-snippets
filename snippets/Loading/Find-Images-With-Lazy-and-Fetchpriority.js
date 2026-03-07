// Find images with contradictory loading="lazy" and fetchpriority="high"
// https://webperf-snippets.nucliweb.net

(() => {
  function getSelector(node) {
    let sel = "";
    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const name = el.nodeName.toLowerCase();
        const part = el.id
          ? "#" + el.id
          : name +
            (el.classList && el.classList.value && el.classList.value.trim()
              ? "." + el.classList.value.trim().split(/\s+/).slice(0, 2).join(".")
              : "");
        if (sel.length + part.length > 80) return sel || part;
        sel = sel ? part + ">" + sel : part;
        if (el.id) break;
        node = el.parentNode;
      }
    } catch (err) {}
    return sel;
  }

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
        selector: getSelector(el),
        dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        inViewport: inViewport ? "Yes" : "No",
        isLcpCandidate: isLcp ? "⚠️ Yes" : "No",
        src: (el.currentSrc || el.src || "").slice(-50),
        element: el,
      };
    });

    console.log("%c📋 Conflicting Elements:", "font-weight: bold;");
    console.table(tableData.map(({ element, ...rest }) => rest));

    // Elements for inspection
    console.log("");
    console.log("%c🔎 Elements for inspection:", "font-weight: bold;");
    tableData.forEach(({ element, selector, isLcpCandidate }, i) => {
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
        selector: getSelector(el),
        src: el.currentSrc || el.src || "",
        inViewport: isInViewport(el),
        isLcpCandidate: el === lcpCandidate,
        widthPx: Math.round(rect.width),
        heightPx: Math.round(rect.height),
      };
    }),
    issues: conflictingElements.length > 0
      ? [{ severity: "error", message: `${conflictingElements.length} element(s) have conflicting loading="lazy" and fetchpriority="high"` }]
      : [],
  };
})();
