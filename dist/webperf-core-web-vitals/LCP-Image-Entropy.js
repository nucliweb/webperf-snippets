(() => {
  const formatBytes = bytes => {
    if (!bytes) return "-";
    const k = 1024;
    const sizes = [ "B", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };
  const LCP_THRESHOLD = 0.05;
  let lcpElement = null;
  let lcpUrl = null;
  const lcpObserver = new PerformanceObserver(list => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      lcpElement = lastEntry.element;
      lcpUrl = lastEntry.url;
    }
  });
  lcpObserver.observe({
    type: "largest-contentful-paint",
    buffered: true
  });
  setTimeout(() => {
    lcpObserver.disconnect();
    const images = [ ...document.images ].filter(img => {
      const src = img.currentSrc || img.src;
      return src && !src.startsWith("data:image");
    }).map(img => {
      const src = img.currentSrc || img.src;
      const resource = performance.getEntriesByName(src)[0];
      const fileSize = resource?.encodedBodySize || 0;
      const pixels = img.naturalWidth * img.naturalHeight;
      const bpp = pixels > 0 ? fileSize * 8 / pixels : 0;
      const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
      const isLCP = lcpElement === img || lcpUrl === src;
      return {
        element: img,
        src: src,
        shortSrc: src.split("/").pop()?.split("?")[0] || src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSize: fileSize,
        bpp: bpp,
        isLowEntropy: isLowEntropy,
        isLCP: isLCP,
        lcpEligible: !isLowEntropy && bpp > 0
      };
    }).filter(img => img.bpp > 0);
    if (images.length === 0) {
      return;
    }
    const lowEntropy = images.filter(img => img.isLowEntropy);
    images.filter(img => !img.isLowEntropy);
    const lcpImage = images.find(img => img.isLCP);
    if (lcpImage) {
      lcpImage.isLowEntropy;
    }
    images.sort((a, b) => b.bpp - a.bpp).map(img => ({
      Image: img.shortSrc.length > 30 ? "..." + img.shortSrc.slice(-27) : img.shortSrc,
      Dimensions: `${img.width}×${img.height}`,
      Size: formatBytes(img.fileSize),
      BPP: img.bpp.toFixed(4),
      Entropy: img.isLowEntropy ? "🔴 Low" : "🟢 Normal",
      "LCP Eligible": img.lcpEligible ? "✅" : "❌",
      "Is LCP": img.isLCP ? "👈" : ""
    }));
    if (lowEntropy.length > 0) {
      lowEntropy.forEach(img => {
      });
    }
    if (lcpImage && lcpImage.isLowEntropy) {
    }
    images.forEach((img, i) => {
      img.isLowEntropy;
      img.isLCP;
    });
  }, 100);
  const lcpEntriesSync = performance.getEntriesByType("largest-contentful-paint");
  const lcpEntrySync = lcpEntriesSync.at(-1);
  const lcpElementSync = lcpEntrySync?.element ?? null;
  const lcpUrlSync = lcpEntrySync?.url ?? null;
  const imagesSync = [ ...document.images ].filter(img => {
    const src = img.currentSrc || img.src;
    return src && !src.startsWith("data:image");
  }).map(img => {
    const src = img.currentSrc || img.src;
    const resource = performance.getEntriesByName(src)[0];
    const fileSize = resource?.encodedBodySize || 0;
    const pixels = img.naturalWidth * img.naturalHeight;
    const bpp = pixels > 0 ? fileSize * 8 / pixels : 0;
    const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
    const isLCP = lcpElementSync === img || lcpUrlSync === src;
    return {
      url: src.split("/").pop()?.split("?")[0] || src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      fileSizeBytes: fileSize,
      bpp: Math.round(bpp * 10000) / 10000,
      isLowEntropy: isLowEntropy,
      lcpEligible: !isLowEntropy && bpp > 0,
      isLCP: isLCP
    };
  }).filter(img => img.bpp > 0);
  const lowEntropyCount = imagesSync.filter(img => img.isLowEntropy).length;
  const lcpImageSync = imagesSync.find(img => img.isLCP);
  if (lcpElementSync) {
    lcpElementSync.style.outline = "3px dashed lime";
    lcpElementSync.style.outlineOffset = "2px";
  }
  const issuesSync = [];
  if (lowEntropyCount > 0) issuesSync.push({
    severity: "warning",
    message: `${lowEntropyCount} image(s) have low entropy and are LCP-ineligible in Chrome 112+`
  });
  if (lcpImageSync?.isLowEntropy) issuesSync.push({
    severity: "error",
    message: "Current LCP image has low entropy and may be skipped by Chrome"
  });
  return {
    script: "LCP-Image-Entropy",
    status: "ok",
    count: imagesSync.length,
    details: {
      totalImages: imagesSync.length,
      lowEntropyCount: lowEntropyCount,
      lcpImageEligible: lcpImageSync ? !lcpImageSync.isLowEntropy : null,
      lcpImage: lcpImageSync ? {
        url: lcpImageSync.url,
        bpp: lcpImageSync.bpp,
        isLowEntropy: lcpImageSync.isLowEntropy
      } : null
    },
    items: imagesSync,
    issues: issuesSync
  };
})();
