// Detect lazy loaded images above the fold
// https://webperf-snippets.nucliweb.net

(function() {
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

  function getDistanceFromViewportEdge(element) {
    const rect = element.getBoundingClientRect();
    const distances = [
      rect.top,
      window.innerHeight - rect.bottom,
      rect.left,
      window.innerWidth - rect.right
    ];
    return Math.min(...distances.map(d => Math.abs(d)));
  }

  function getFileSize(src) {
    if (!src) return null;
    try {
      const entries = performance.getEntriesByType("resource");
      const entry = entries.find(e => e.name === src || e.name.includes(src.split("/").pop()));
      if (entry && entry.transferSize) {
        return (entry.transferSize / 1024).toFixed(1) + " KB";
      }
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

  // Find all images with lazy loading
  const lazySelectors = '[loading="lazy"], [data-src], [data-lazy]';
  const lazyElements = document.querySelectorAll(`img${lazySelectors}, picture source${lazySelectors}`);

  // Also check all images in viewport to find LCP candidate
  const allViewportImages = Array.from(document.querySelectorAll("img"))
    .filter(img => isInViewport(img) && img.getBoundingClientRect().width > 0);

  // Find LCP candidate (largest visible image)
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

  // Process lazy loaded images in viewport
  lazyElements.forEach(element => {
    const img = element.tagName === "SOURCE"
      ? element.closest("picture")?.querySelector("img")
      : element;

    if (!img || !isInViewport(img)) return;

    const info = getElementInfo(img);
    info.isLcpCandidate = img === lcpCandidate;

    results.lazyImages.push(info);
    results.nodeArray.push(img);

    // Update summary
    results.summary.total++;
    if (info.lazyType === "loading-lazy" || info.lazyType === "both") {
      results.summary.withLoadingLazy++;
    }
    if (info.lazyType === "data-src" || info.lazyType === "both") {
      results.summary.withDataSrc++;
    }
    if (info.isLcpCandidate) {
      results.summary.lcpAffected = true;
      results.lcpCandidate = info;
    }
  });

  // Display results
  console.group("🔍 Lazy Loading Detection - Above The Fold");

  if (results.lazyImages.length === 0) {
    console.log(
      "%c✅ Good job! No lazily loaded images found in the viewport.",
      "background: #222; color: #22c55e; padding: 0.5ch 1ch; font-weight: bold;"
    );
  } else {
    // Summary
    console.log(
      `%c⚠️ Found ${results.summary.total} lazily loaded image(s) above the fold`,
      "color: #f59e0b; font-weight: bold; font-size: 14px;"
    );
    console.log("");

    // LCP Warning
    if (results.summary.lcpAffected) {
      console.group("🚨 Critical: LCP Candidate Has Lazy Loading");
      console.log(
        "%cThe largest image in your viewport has lazy loading enabled!",
        "color: #ef4444; font-weight: bold;"
      );
      console.log("This can significantly delay your Largest Contentful Paint.");
      console.log("");
      console.log("LCP Candidate:", results.lcpCandidate.selector);
      console.log("Dimensions:", results.lcpCandidate.dimensions);
      console.log("File size:", results.lcpCandidate.fileSize || "unknown");
      console.log("");
      console.log("%cFix: Remove loading=\"lazy\" and add fetchpriority=\"high\"", "color: #22c55e;");
      console.groupEnd();
      console.log("");
    }

    // Table of all problematic images
    console.group("📋 Lazy Loaded Images in Viewport");
    const tableData = results.lazyImages.map(({ element, area, position, ...rest }) => ({
      ...rest,
      top: position.top + "px",
      isLcpCandidate: rest.isLcpCandidate ? "⚠️ YES" : "no"
    }));
    console.table(tableData);
    console.groupEnd();

    // Elements for inspection
    console.group("🔎 Elements for inspection");
    console.log("Click to expand and inspect in Elements panel:");
    results.nodeArray.forEach((node, i) => {
      const marker = node === lcpCandidate ? " 🚨 LCP" : "";
      console.log(`${i + 1}.${marker}`, node);
    });
    console.groupEnd();

    // Quick fix suggestion
    console.log("");
    console.group("📝 Suggested Fix");
    console.log("For above-the-fold images, use:");
    console.log("");
    console.log(
      '%c<img src="hero.jpg" fetchpriority="high" alt="...">',
      "font-family: monospace; background: #1e1e1e; color: #9cdcfe; padding: 8px; border-radius: 4px;"
    );
    console.log("");
    console.log("Remove: loading=\"lazy\", data-src, data-lazy");
    console.log("Add: fetchpriority=\"high\" for LCP candidate");
    console.groupEnd();
  }

  console.groupEnd();
})();
