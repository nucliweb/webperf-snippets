(() => {
  function getSelector(node) {
    let sel = "";
    try {
      while (node && node.nodeType !== 9) {
        const el = node;
        const name = el.nodeName.toLowerCase();
        const part = el.id ? "#" + el.id : name + (el.classList && el.classList.value && el.classList.value.trim() ? "." + el.classList.value.trim().split(/\s+/).slice(0, 2).join(".") : "");
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
        selector: getSelector(el),
        dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        inViewport: inViewport ? "Yes" : "No",
        isLcpCandidate: isLcp ? "⚠️ Yes" : "No",
        src: (el.currentSrc || el.src || "").slice(-50),
        element: el
      };
    });
    tableData.forEach(({element: element, selector: selector, isLcpCandidate: isLcpCandidate}, i) => {
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
        selector: getSelector(el),
        src: el.currentSrc || el.src || "",
        inViewport: isInViewport(el),
        isLcpCandidate: el === lcpCandidate,
        widthPx: Math.round(rect.width),
        heightPx: Math.round(rect.height)
      };
    }),
    issues: conflictingElements.length > 0 ? [ {
      severity: "error",
      message: `${conflictingElements.length} element(s) have conflicting loading="lazy" and fetchpriority="high"`
    } ] : []
  };
})();
