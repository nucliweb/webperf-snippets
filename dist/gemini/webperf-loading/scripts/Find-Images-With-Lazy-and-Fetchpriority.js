(() => {
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
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
  }
  const viewportImages = Array.from(document.querySelectorAll("img")).filter(img => isInViewport(img) && img.getBoundingClientRect().width > 0);
  let lcpCandidate = null;
  let maxArea = 0;
  viewportImages.forEach(img => {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      lcpCandidate = img;
    }
  });
  const conflictingElements = document.querySelectorAll("[loading=lazy][fetchpriority=high]");
  if (conflictingElements.length === 0) void 0; else {
    const tableData = Array.from(conflictingElements).map(el => {
      const rect = el.getBoundingClientRect();
      const inViewport = isInViewport(el);
      const isLcp = el === lcpCandidate;
      return {
        selector: uniqueSelector(el),
        dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        inViewport: inViewport ? "Yes" : "No",
        isLcpCandidate: isLcp ? "⚠️ Yes" : "No",
        src: (el.currentSrc || el.src || "").slice(-50),
        element: el
      };
    });
    tableData.forEach(({element: element, isLcpCandidate: isLcpCandidate}, i) => {
    });
    tableData.forEach(({selector: selector, inViewport: inViewport, isLcpCandidate: isLcpCandidate}) => {
      if (inViewport === "Yes" || isLcpCandidate === "⚠️ Yes") {
      } else {
      }
    });
  }
  return {
    script: "Find-Images-With-Lazy-and-Fetchpriority",
    status: "ok",
    count: conflictingElements.length,
    items: Array.from(conflictingElements).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        selector: uniqueSelector(el),
        src: el.currentSrc || el.src || "",
        inViewport: isInViewport(el),
        isLcpCandidate: el === lcpCandidate,
        widthPx: Math.round(rect.width),
        heightPx: Math.round(rect.height)
      };
    }),
    issues: conflictingElements.length > 0 ? [ {
      code: "lazy-and-high-priority",
      severity: "error",
      message: `${conflictingElements.length} element(s) have conflicting loading="lazy" and fetchpriority="high"`
    } ] : []
  };
})();
