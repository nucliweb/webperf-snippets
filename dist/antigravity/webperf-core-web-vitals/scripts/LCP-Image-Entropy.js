(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    return {
      script: "LCP-Image-Entropy",
      status: "unsupported",
      error: "largest-contentful-paint entries not supported in this browser"
    };
  }
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  const LCP_THRESHOLD = 0.05;
  function displayedSize(img) {
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const px = prop => parseFloat(style[prop]) || 0;
    return {
      width: Math.max(0, rect.width - px("borderLeftWidth") - px("borderRightWidth") - px("paddingLeft") - px("paddingRight")),
      height: Math.max(0, rect.height - px("borderTopWidth") - px("borderBottomWidth") - px("paddingTop") - px("paddingBottom"))
    };
  }
  function bitsPerPixel(img, fileSize) {
    const displayed = displayedSize(img);
    const pixels = Math.min(displayed.width * displayed.height, img.naturalWidth * img.naturalHeight);
    return {
      displayed: displayed,
      bpp: pixels > 0 ? fileSize * 8 / pixels : 0
    };
  }
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
      const {displayed: displayed, bpp: bpp} = bitsPerPixel(img, fileSize);
      const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
      const isLCP = lcpElement === img || lcpUrl === src;
      return {
        element: img,
        src: src,
        shortSrc: src.split("/").pop()?.split("?")[0] || src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        displayedWidth: Math.round(displayed.width),
        displayedHeight: Math.round(displayed.height),
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
      Displayed: `${img.displayedWidth}×${img.displayedHeight}`,
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
  const lcpEntriesSync = await new Promise(resolve => {
    const entries = [];
    const obs = new PerformanceObserver(list => entries.push(...list.getEntries()));
    obs.observe({
      type: "largest-contentful-paint",
      buffered: true
    });
    setTimeout(() => {
      obs.disconnect();
      resolve(entries);
    }, 100);
  });
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
    const {displayed: displayed, bpp: bpp} = bitsPerPixel(img, fileSize);
    const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
    const isLCP = lcpElementSync === img || lcpUrlSync === src;
    return {
      url: src.split("/").pop()?.split("?")[0] || src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      displayedWidth: Math.round(displayed.width),
      displayedHeight: Math.round(displayed.height),
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
    code: "low-entropy-images",
    severity: "warning",
    message: `${lowEntropyCount} image(s) have low entropy and are LCP-ineligible in Chrome 112+`
  });
  if (lcpImageSync?.isLowEntropy) issuesSync.push({
    code: "lcp-low-entropy",
    severity: "error",
    message: "Current LCP image has low entropy and may be skipped by Chrome"
  });
  const lcpTag = lcpElementSync ? lcpElementSync.tagName.toLowerCase() : null;
  if (lcpTag && !lcpImageSync) issuesSync.push(lcpTag === "img" ? {
    code: "lcp-size-unknown",
    severity: "info",
    message: "The LCP <img> has no file size to read, as with a data: URL or a cross-origin image without Timing-Allow-Origin, so its entropy cannot be computed."
  } : lcpUrlSync ? {
    code: "lcp-not-img",
    severity: "info",
    message: `The LCP is the image of a <${lcpTag}>, such as a CSS background or a video poster, and this snippet reads <img> elements only. Run the LCP snippet to measure it.`
  } : {
    code: "lcp-is-text",
    severity: "info",
    message: `The LCP element is <${lcpTag}>, text and not an image, so its entropy does not apply. Run the LCP snippet to measure it.`
  });
  const MAX_ITEMS = 50;
  const rankedImages = [ ...imagesSync ].sort((a, b) => Number(b.isLCP) - Number(a.isLCP) || Number(b.isLowEntropy) - Number(a.isLowEntropy) || a.bpp - b.bpp);
  return {
    script: "LCP-Image-Entropy",
    status: "ok",
    count: imagesSync.length,
    details: {
      totalImages: imagesSync.length,
      lowEntropyCount: lowEntropyCount,
      lcpElement: lcpTag,
      lcpImageEligible: lcpImageSync ? !lcpImageSync.isLowEntropy : null,
      lcpImage: lcpImageSync ? {
        url: lcpImageSync.url,
        bpp: lcpImageSync.bpp,
        isLowEntropy: lcpImageSync.isLowEntropy
      } : null
    },
    items: rankedImages.slice(0, MAX_ITEMS),
    issues: issuesSync
  };
})();
