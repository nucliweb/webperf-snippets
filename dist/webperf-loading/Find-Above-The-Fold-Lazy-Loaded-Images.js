(function() {
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
  function getDistanceFromViewportEdge(element) {
    const rect = element.getBoundingClientRect();
    const distances = [ rect.top, window.innerHeight - rect.bottom, rect.left, window.innerWidth - rect.right ];
    return Math.min(...distances.map(d => Math.abs(d)));
  }
  function getFileSize(src) {
    if (!src) return null;
    try {
      const entries = performance.getEntriesByType("resource");
      const entry = entries.find(e => e.name === src || e.name.includes(src.split("/").pop()));
      if (entry && entry.transferSize) return (entry.transferSize / 1024).toFixed(1) + " KB";
    } catch (err) {}
    return null;
  }
  function getLazyType(element) {
    const hasLoadingLazy = element.getAttribute("loading") === "lazy";
    const hasDataSrc = element.hasAttribute("data-src") || element.hasAttribute("data-lazy");
    if (hasLoadingLazy && hasDataSrc) return "both";
    if (hasLoadingLazy) return "loading-lazy";
    if (hasDataSrc) return "data-src";
    return null;
  }
  function getElementInfo(img) {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    return {
      selector: getSelector(img),
      lazyType: getLazyType(img),
      dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      position: {
        top: Math.round(rect.top + window.scrollY),
        left: Math.round(rect.left + window.scrollX)
      },
      distanceFromEdge: Math.round(getDistanceFromViewportEdge(img)) + "px",
      src: img.currentSrc || img.src || img.getAttribute("data-src") || "",
      srcset: img.srcset || null,
      sizes: img.sizes || null,
      alt: img.alt || "(no alt)",
      fetchPriority: img.fetchPriority || "auto",
      fileSize: getFileSize(img.currentSrc || img.src),
      area: area,
      element: img
    };
  }
  const results = {
    lazyImages: [],
    lcpCandidate: null,
    nodeArray: [],
    summary: {
      total: 0,
      withLoadingLazy: 0,
      withDataSrc: 0,
      lcpAffected: false
    }
  };
  const lazySelectors = '[loading="lazy"], [data-src], [data-lazy]';
  const lazyElements = document.querySelectorAll(`img${lazySelectors}, picture source${lazySelectors}`);
  const allViewportImages = Array.from(document.querySelectorAll("img")).filter(img => isInViewport(img) && img.getBoundingClientRect().width > 0);
  let lcpCandidate = null;
  let maxArea = 0;
  allViewportImages.forEach(img => {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      lcpCandidate = img;
    }
  });
  lazyElements.forEach(element => {
    const img = element.tagName === "SOURCE" ? element.closest("picture")?.querySelector("img") : element;
    if (!img || !isInViewport(img)) return;
    const info = getElementInfo(img);
    info.isLcpCandidate = img === lcpCandidate;
    results.lazyImages.push(info);
    results.nodeArray.push(img);
    results.summary.total++;
    if (info.lazyType === "loading-lazy" || info.lazyType === "both") results.summary.withLoadingLazy++;
    if (info.lazyType === "data-src" || info.lazyType === "both") results.summary.withDataSrc++;
    if (info.isLcpCandidate) {
      results.summary.lcpAffected = true;
      results.lcpCandidate = info;
    }
  });
  if (results.lazyImages.length === 0) void 0; else {
    if (results.summary.lcpAffected) {
    }
    results.lazyImages.map(({element: element, area: area, position: position, ...rest}) => ({
      ...rest,
      top: position.top + "px",
      isLcpCandidate: rest.isLcpCandidate ? "⚠️ YES" : "no"
    }));
    results.nodeArray.forEach((node, i) => {
    });
  }
  return {
    script: "Find-Above-The-Fold-Lazy-Loaded-Images",
    status: "ok",
    count: results.lazyImages.length,
    details: {
      total: results.summary.total,
      withLoadingLazy: results.summary.withLoadingLazy,
      withDataSrc: results.summary.withDataSrc,
      lcpAffected: results.summary.lcpAffected
    },
    items: results.lazyImages.map(({element: element, area: area, ...rest}) => rest),
    issues: [ ...results.summary.lcpAffected ? [ {
      severity: "error",
      message: 'LCP candidate image has lazy loading — remove loading="lazy" and add fetchpriority="high"'
    } ] : [], ...results.lazyImages.filter(i => !i.isLcpCandidate).length > 0 ? [ {
      severity: "warning",
      message: `${results.lazyImages.filter(i => !i.isLcpCandidate).length} above-fold image(s) have lazy loading — remove loading="lazy"`
    } ] : [] ]
  };
})();
