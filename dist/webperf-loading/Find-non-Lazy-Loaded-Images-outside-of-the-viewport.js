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
  function isInHiddenContainer(element) {
    let parent = element.parentElement;
    const hiddenSelectors = [ "[hidden]", '[aria-hidden="true"]', ".modal:not(.show)", ".tab-pane:not(.active)", '[role="tabpanel"]:not(.active)', ".accordion-collapse:not(.show)", ".carousel-item:not(.active)", ".swiper-slide:not(.swiper-slide-active)" ];
    while (parent && parent !== document.body) {
      const cs = window.getComputedStyle(parent);
      if (cs.display === "none" || cs.visibility === "hidden") return {
        hidden: true,
        reason: "CSS hidden",
        container: uniqueSelector(parent)
      };
      for (const selector of hiddenSelectors) try {
        if (parent.matches(selector)) return {
          hidden: true,
          reason: selector,
          container: uniqueSelector(parent)
        };
      } catch {}
      parent = parent.parentElement;
    }
    return {
      hidden: false
    };
  }
  function getImageSize(imgElement) {
    const src = imgElement.currentSrc || imgElement.src;
    if (!src || src.startsWith("data:")) return 0;
    const perfEntries = performance.getEntriesByType("resource").filter(e => !isOwnRequest(e));
    const imgEntry = perfEntries.find(entry => entry.name === src);
    if (imgEntry) return imgEntry.transferSize || imgEntry.encodedBodySize || 0;
    return 0;
  }
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
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
  const notLazyImages = document.querySelectorAll('img:not([data-src]):not([loading="lazy"])');
  const results = {
    belowFold: [],
    hiddenContainers: [],
    excluded: {
      inViewport: 0,
      lcpCandidate: null,
      tooSmall: 0
    },
    elements: []
  };
  notLazyImages.forEach(img => {
    const rect = img.getBoundingClientRect();
    if (isInViewport(img)) {
      if (img === lcpCandidate) results.excluded.lcpCandidate = uniqueSelector(img); else results.excluded.inViewport++;
      return;
    }
    if (rect.width < 50 || rect.height < 50) {
      results.excluded.tooSmall++;
      return;
    }
    const src = img.currentSrc || img.src;
    const size = getImageSize(img);
    const hiddenCheck = isInHiddenContainer(img);
    const imageData = {
      selector: uniqueSelector(img),
      src: src.length > 60 ? "..." + src.slice(-57) : src,
      fullSrc: src,
      dimensions: `${img.naturalWidth}×${img.naturalHeight}`,
      size: size,
      sizeFormatted: size > 0 ? formatBytes(size) : "unknown",
      element: img
    };
    if (hiddenCheck.hidden) {
      imageData.hiddenReason = hiddenCheck.reason;
      imageData.container = hiddenCheck.container;
      results.hiddenContainers.push(imageData);
    } else {
      imageData.distanceFromViewport = Math.round(rect.top - window.innerHeight) + "px";
      results.belowFold.push(imageData);
    }
    results.elements.push(img);
  });
  results.belowFold.sort((a, b) => parseInt(b.distanceFromViewport) - parseInt(a.distanceFromViewport));
  const totalImages = results.belowFold.length + results.hiddenContainers.length;
  const totalSize = [ ...results.belowFold, ...results.hiddenContainers ].reduce((sum, img) => sum + img.size, 0);
  if (totalImages === 0) void 0; else {
    if (totalSize > 0) void 0;
    if (results.belowFold.length > 0) {
      results.belowFold.slice(0, 20).map(img => ({
        selector: img.selector,
        src: img.src,
        dimensions: img.dimensions,
        size: img.size,
        sizeFormatted: img.sizeFormatted,
        distanceFromViewport: img.distanceFromViewport
      }));
      if (results.belowFold.length > 20) void 0;
    }
    if (results.hiddenContainers.length > 0) {
      results.hiddenContainers.slice(0, 15).map(img => ({
        selector: img.selector,
        src: img.src,
        dimensions: img.dimensions,
        size: img.size,
        sizeFormatted: img.sizeFormatted,
        hiddenReason: img.hiddenReason,
        container: img.container
      }));
      if (results.hiddenContainers.length > 15) void 0;
    }
    results.elements.slice(0, 15).forEach((img, i) => {});
    if (results.elements.length > 15) void 0;
  }
  return {
    script: "Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
    status: "ok",
    count: totalImages,
    details: {
      belowFoldCount: results.belowFold.length,
      hiddenContainerCount: results.hiddenContainers.length,
      totalSizeBytes: totalSize,
      excluded: {
        inViewport: results.excluded.inViewport,
        lcpCandidate: results.excluded.lcpCandidate,
        tooSmall: results.excluded.tooSmall
      }
    },
    items: [ ...results.belowFold.map(img => ({
      selector: img.selector,
      src: img.fullSrc,
      sizeBytes: img.size,
      category: "below-fold",
      distancePx: parseInt(img.distanceFromViewport)
    })), ...results.hiddenContainers.map(img => ({
      selector: img.selector,
      src: img.fullSrc,
      sizeBytes: img.size,
      category: "hidden-container",
      hiddenReason: img.hiddenReason,
      container: img.container
    })) ],
    issues: totalImages > 0 ? [ {
      code: "eager-off-viewport",
      severity: "warning",
      message: `${totalImages} image(s) outside the viewport are missing loading="lazy"`
    } ] : []
  };
})();
