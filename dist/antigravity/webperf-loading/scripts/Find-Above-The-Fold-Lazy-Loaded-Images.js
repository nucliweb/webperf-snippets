(function() {
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
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
  function getDistanceFromViewportEdge(element) {
    const rect = element.getBoundingClientRect();
    const distances = [ rect.top, window.innerHeight - rect.bottom, rect.left, window.innerWidth - rect.right ];
    return Math.min(...distances.map(d => Math.abs(d)));
  }
  function getFileSize(src) {
    if (!src) return null;
    try {
      const entries = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e));
      const entry = entries.find(e => e.name === src || e.name.includes(src.split("/").pop()));
      if (entry && entry.transferSize) return (entry.transferSize / 1024).toFixed(1) + " KB";
    } catch {}
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
      selector: uniqueSelector(img),
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
    results.lazyImages.map(image => ({
      selector: image.selector,
      lazyType: image.lazyType,
      dimensions: image.dimensions,
      top: image.position.top + "px",
      distanceFromEdge: image.distanceFromEdge,
      src: image.src,
      srcset: image.srcset,
      sizes: image.sizes,
      alt: image.alt,
      fetchPriority: image.fetchPriority,
      fileSize: image.fileSize,
      isLcpCandidate: image.isLcpCandidate ? "⚠️ YES" : "no"
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
    items: results.lazyImages.map(image => ({
      selector: image.selector,
      lazyType: image.lazyType,
      dimensions: image.dimensions,
      position: `${image.position.top}px, ${image.position.left}px`,
      distanceFromEdge: image.distanceFromEdge,
      src: image.src,
      srcset: image.srcset,
      sizes: image.sizes,
      alt: image.alt,
      fetchPriority: image.fetchPriority,
      fileSize: image.fileSize,
      isLcpCandidate: image.isLcpCandidate
    })),
    issues: [ ...results.summary.lcpAffected ? [ {
      code: "lcp-lazy",
      severity: "error",
      message: 'LCP candidate image has lazy loading: remove loading="lazy" and add fetchpriority="high"'
    } ] : [], ...results.lazyImages.filter(i => !i.isLcpCandidate).length > 0 ? [ {
      code: "lazy-above-fold",
      severity: "warning",
      message: `${results.lazyImages.filter(i => !i.isLcpCandidate).length} above-fold image(s) have lazy loading: remove loading="lazy"`
    } ] : [] ]
  };
})();
