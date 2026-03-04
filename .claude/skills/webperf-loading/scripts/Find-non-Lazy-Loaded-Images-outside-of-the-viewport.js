// Execute after page load without user interaction (scroll, click, etc)
// https://webperf-snippets.nucliweb.net

(function () {
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

  function isInHiddenContainer(element) {
    let parent = element.parentElement;
    const hiddenSelectors = [
      "[hidden]",
      '[aria-hidden="true"]',
      ".modal:not(.show)",
      ".tab-pane:not(.active)",
      '[role="tabpanel"]:not(.active)',
      ".accordion-collapse:not(.show)",
      ".carousel-item:not(.active)",
      ".swiper-slide:not(.swiper-slide-active)",
    ];

    while (parent && parent !== document.body) {
      const cs = window.getComputedStyle(parent);
      if (cs.display === "none" || cs.visibility === "hidden") {
        return { hidden: true, reason: "CSS hidden", container: getSelector(parent) };
      }
      for (const selector of hiddenSelectors) {
        try {
          if (parent.matches(selector)) {
            return { hidden: true, reason: selector, container: getSelector(parent) };
          }
        } catch (e) {}
      }
      parent = parent.parentElement;
    }
    return { hidden: false };
  }

  function getImageSize(imgElement) {
    const src = imgElement.currentSrc || imgElement.src;
    if (!src || src.startsWith("data:")) return 0;

    const perfEntries = performance.getEntriesByType("resource");
    const imgEntry = perfEntries.find((entry) => entry.name === src);

    if (imgEntry) {
      return imgEntry.transferSize || imgEntry.encodedBodySize || 0;
    }
    return 0;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // Find LCP candidate (largest visible image) to exclude from recommendations
  const allViewportImages = Array.from(document.querySelectorAll("img")).filter(
    (img) => isInViewport(img) && img.getBoundingClientRect().width > 0
  );

  let lcpCandidate = null;
  let maxArea = 0;

  allViewportImages.forEach((img) => {
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      lcpCandidate = img;
    }
  });

  // Find images without lazy loading
  const notLazyImages = document.querySelectorAll('img:not([data-src]):not([loading="lazy"])');

  const results = {
    belowFold: [],
    hiddenContainers: [],
    excluded: {
      inViewport: 0,
      lcpCandidate: null,
      tooSmall: 0,
    },
    elements: [],
  };

  notLazyImages.forEach((img) => {
    const rect = img.getBoundingClientRect();

    // Skip images in viewport (they shouldn't be lazy loaded)
    if (isInViewport(img)) {
      if (img === lcpCandidate) {
        results.excluded.lcpCandidate = getSelector(img);
      } else {
        results.excluded.inViewport++;
      }
      return;
    }

    // Skip very small images (likely icons/tracking pixels)
    if (rect.width < 50 || rect.height < 50) {
      results.excluded.tooSmall++;
      return;
    }

    const src = img.currentSrc || img.src;
    const size = getImageSize(img);
    const hiddenCheck = isInHiddenContainer(img);

    const imageData = {
      selector: getSelector(img),
      src: src.length > 60 ? "..." + src.slice(-57) : src,
      fullSrc: src,
      dimensions: `${img.naturalWidth}×${img.naturalHeight}`,
      size: size,
      sizeFormatted: size > 0 ? formatBytes(size) : "unknown",
      element: img,
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

  // Sort below-fold images by distance (furthest first)
  results.belowFold.sort((a, b) => parseInt(b.distanceFromViewport) - parseInt(a.distanceFromViewport));

  const totalImages = results.belowFold.length + results.hiddenContainers.length;
  const totalSize = [...results.belowFold, ...results.hiddenContainers].reduce((sum, img) => sum + img.size, 0);

  // Display results
  console.group("💡 Lazy Loading Opportunities");

  if (totalImages === 0) {
    console.log(
      "%c✅ Good job! All images outside the viewport have lazy loading.",
      "background: #222; color: #22c55e; padding: 0.5ch 1ch; font-weight: bold"
    );
  } else {
    console.log(
      `%c⚠️ Found ${totalImages} image(s) that should have lazy loading`,
      "color: #f59e0b; font-weight: bold; font-size: 14px"
    );

    if (totalSize > 0) {
      console.log(
        `%c📊 Potential savings: ${formatBytes(totalSize)} on initial load`,
        "color: #22c55e; font-weight: bold"
      );
    }
    console.log("");

    // Below the fold images
    if (results.belowFold.length > 0) {
      console.group(`📍 Below The Fold (${results.belowFold.length} images)`);
      const tableData = results.belowFold.slice(0, 20).map(({ element, fullSrc, ...rest }) => rest);
      console.table(tableData);
      if (results.belowFold.length > 20) {
        console.log(`... and ${results.belowFold.length - 20} more images`);
      }
      console.groupEnd();
    }

    // Hidden container images
    if (results.hiddenContainers.length > 0) {
      console.log("");
      console.group(`🔒 In Hidden Containers (${results.hiddenContainers.length} images)`);
      console.log("Images in tabs, modals, carousels, or other hidden elements:");
      console.log("");
      const tableData = results.hiddenContainers.slice(0, 15).map(({ element, fullSrc, distanceFromViewport, ...rest }) => rest);
      console.table(tableData);
      if (results.hiddenContainers.length > 15) {
        console.log(`... and ${results.hiddenContainers.length - 15} more images`);
      }
      console.groupEnd();
    }

    // Excluded summary
    console.log("");
    console.group("ℹ️ Correctly Excluded (should NOT be lazy loaded)");
    console.log(`• LCP candidate: ${results.excluded.lcpCandidate || "none detected"}`);
    console.log(`• Other in-viewport images: ${results.excluded.inViewport}`);
    console.log(`• Too small (<50px): ${results.excluded.tooSmall}`);
    console.groupEnd();

    // Elements for inspection
    console.log("");
    console.group("🔎 Elements for inspection");
    console.log("Click to inspect in Elements panel:");
    results.elements.slice(0, 15).forEach((img, i) => console.log(`${i + 1}.`, img));
    if (results.elements.length > 15) {
      console.log(`... and ${results.elements.length - 15} more`);
    }
    console.groupEnd();

    // Quick fix
    console.log("");
    console.group("📝 Quick Fix");
    console.log("Add lazy loading to these images:");
    console.log("");
    console.log(
      '%c<img src="image.jpg" loading="lazy" alt="...">',
      "font-family: monospace; background: #1e1e1e; color: #9cdcfe; padding: 8px; border-radius: 4px"
    );
    console.groupEnd();
  }

  console.groupEnd();
})();
