// Oversized Images
// https://webperf-snippets.nucliweb.net

(async () => {
  const OVERSIZED_RATIO = 1.5; // file has at least 1.5x the pixels it needs on each axis
  const UNDERSIZED_RATIO = 0.9; // file has less than 90% of the pixels it needs
  const SEVERE_OVERSIZED = 2;
  const SEVERE_UNDERSIZED = 0.75;
  const MAX_ITEMS = 50;
  const LOAD_TIMEOUT_MS = 3000;

  const dpr = window.devicePixelRatio || 1;

  const round2 = (n) => Math.round(n * 100) / 100;
  const px = (v) => parseFloat(v) || 0;

  const shortUrl = (url) => (url.startsWith("data:") ? url.slice(0, 60) : url);
  const fileName = (url) => url.split("?")[0].split("/").pop() || url;

  function selectorOf(el) {
    if (el.id) return `img#${el.id}`;
    const cls = Array.from(el.classList).slice(0, 2);
    return cls.length ? `img.${cls.join(".")}` : "img";
  }

  function isVector(url) {
    return /^data:image\/svg/i.test(url) || /\.svg([?#]|$)/i.test(url);
  }

  // The size of the file in pixels. HTMLImageElement.naturalWidth is corrected by the srcset
  // density (a 400px file picked as "2x" reports 200), so a fresh Image, which has no srcset,
  // gives the real pixels. The file comes from the browser cache.
  function loadPixels(url) {
    return new Promise((resolve) => {
      const probe = new Image();
      const timer = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
      probe.onload = () => {
        clearTimeout(timer);
        resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      };
      probe.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      probe.src = url;
    });
  }

  // Bytes of each image URL; null when the browser hides them (cross-origin without
  // Timing-Allow-Origin).
  const transferByUrl = new Map();
  performance.getEntriesByType("resource").forEach((e) => {
    if (e.initiatorType !== "img" && e.initiatorType !== "css" && e.initiatorType !== "other") return;
    const bytes = e.transferSize > 0 ? e.transferSize : e.encodedBodySize > 0 ? e.encodedBodySize : null;
    if (bytes !== null) transferByUrl.set(e.name, bytes);
  });

  // Scale from file pixels to CSS pixels on each axis, following object-fit.
  function scaleOf(img, boxW, boxH, fileW, fileH) {
    const fit = getComputedStyle(img).objectFit;
    const sx = boxW / fileW;
    const sy = boxH / fileH;
    const contain = Math.min(sx, sy);
    const none = img.naturalWidth / fileW; // CSS pixels per file pixel, density-corrected
    if (fit === "cover") return { sx: Math.max(sx, sy), sy: Math.max(sx, sy) };
    if (fit === "contain") return { sx: contain, sy: contain };
    if (fit === "none") return { sx: none, sy: none };
    if (fit === "scale-down") {
      const s = Math.min(contain, none);
      return { sx: s, sy: s };
    }
    return { sx, sy }; // fill
  }

  const images = Array.from(document.querySelectorAll("img"));
  let skippedHidden = 0;
  let skippedNotLoaded = 0;
  let skippedVector = 0;

  const candidates = [];
  images.forEach((img) => {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return void skippedHidden++;
    const url = img.currentSrc || img.src || "";
    if (!img.complete || img.naturalWidth === 0 || !url) return void skippedNotLoaded++;
    if (isVector(url)) return void skippedVector++;
    candidates.push({ img, rect, url });
  });

  const pixelsByUrl = new Map();
  await Promise.all(
    [...new Set(candidates.map((c) => c.url))].map(async (url) => {
      pixelsByUrl.set(url, await loadPixels(url));
    }),
  );

  const flagged = [];
  let checked = 0;
  let wastedPixels = 0;
  const wastedBytesByUrl = new Map();

  candidates.forEach(({ img, rect, url }) => {
    const file = pixelsByUrl.get(url);
    if (!file || !file.width || !file.height) return void skippedNotLoaded++;
    checked++;

    const style = getComputedStyle(img);
    const boxW = rect.width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth);
    const boxH = rect.height - px(style.paddingTop) - px(style.paddingBottom) - px(style.borderTopWidth) - px(style.borderBottomWidth);
    if (boxW <= 0 || boxH <= 0) return;

    const { sx, sy } = scaleOf(img, boxW, boxH, file.width, file.height);
    const neededWidth = Math.round(file.width * sx * dpr);
    const neededHeight = Math.round(file.height * sy * dpr);
    // Pixels of the file per device pixel drawn, on the tighter axis
    const ratio = Math.min(1 / (sx * dpr), 1 / (sy * dpr));

    let verdict = null;
    if (ratio >= OVERSIZED_RATIO) verdict = "oversized";
    else if (ratio < UNDERSIZED_RATIO) verdict = "undersized";
    if (!verdict) return;

    const filePixels = file.width * file.height;
    const wasted = verdict === "oversized" ? Math.max(0, filePixels - neededWidth * neededHeight) : 0;
    const transferBytes = transferByUrl.get(url) ?? null;
    const wastedBytes = transferBytes === null ? null : Math.round(transferBytes * (wasted / filePixels));

    wastedPixels += wasted;
    if (wastedBytes !== null) wastedBytesByUrl.set(url, Math.max(wastedBytesByUrl.get(url) ?? 0, wastedBytes));

    flagged.push({
      selector: selectorOf(img),
      url: shortUrl(url),
      verdict,
      naturalWidth: file.width,
      naturalHeight: file.height,
      renderedWidth: Math.round(boxW),
      renderedHeight: Math.round(boxH),
      neededWidth,
      neededHeight,
      ratio: round2(ratio),
      wastedPixels: wasted,
      transferBytes,
      wastedBytes,
      hasSrcset: img.hasAttribute("srcset"),
      hasSizes: img.hasAttribute("sizes"),
    });
  });

  // Most waste first; undersized images (no waste) follow, the blurriest first
  flagged.sort((a, b) => b.wastedPixels - a.wastedPixels || a.ratio - b.ratio);

  const oversized = flagged.filter((f) => f.verdict === "oversized").length;
  const undersized = flagged.length - oversized;
  // An image used several times downloads once, so each URL counts once
  const wastedBytes = [...wastedBytesByUrl.values()].reduce((a, b) => a + b, 0);

  const issues = flagged.map((f) => {
    const size = `${f.naturalWidth}x${f.naturalHeight}`;
    const shown = `${f.neededWidth}x${f.neededHeight}`;
    if (f.verdict === "oversized") {
      const kb = f.wastedBytes === null ? "" : `, about ${Math.round(f.wastedBytes / 1024)} KB wasted`;
      return {
        severity: f.ratio >= SEVERE_OVERSIZED ? "warning" : "info",
        message: `${fileName(f.url)}: ${size} file for a ${shown} slot at ${dpr}x (${f.ratio}x too large${kb})`,
      };
    }
    return {
      severity: f.ratio < SEVERE_UNDERSIZED ? "warning" : "info",
      message: `${fileName(f.url)}: ${size} file for a ${shown} slot at ${dpr}x (blurry, needs ${round2(1 / f.ratio)}x more pixels)`,
    };
  });

  const items = flagged.slice(0, MAX_ITEMS);

  console.group("%cOversized Images", "font-weight: bold; font-size: 14px;");
  console.log(`   Images checked : ${checked} (devicePixelRatio ${dpr})`);
  console.log(`   Oversized      : ${oversized}`);
  console.log(`   Undersized     : ${undersized}`);
  console.log(`   Wasted pixels  : ${wastedPixels.toLocaleString()}`);
  console.log(`   Wasted bytes   : ${Math.round(wastedBytes / 1024)} KB (estimated)`);
  if (items.length > 0) {
    console.table(
      items.map((f) => ({
        image: fileName(f.url).slice(0, 40),
        verdict: f.verdict,
        file: `${f.naturalWidth}x${f.naturalHeight}`,
        needed: `${f.neededWidth}x${f.neededHeight}`,
        ratio: f.ratio,
        "wasted KB": f.wastedBytes === null ? "n/a" : Math.round(f.wastedBytes / 1024),
      })),
    );
  } else {
    console.log("%cNo oversized or undersized images found.", "color: #22c55e; font-weight: bold;");
  }
  console.groupEnd();

  return {
    script: "Oversized-Images",
    status: "ok",
    count: flagged.length,
    details: {
      devicePixelRatio: dpr,
      totalImages: images.length,
      imagesChecked: checked,
      oversized,
      undersized,
      wastedPixels,
      wastedBytes,
      skippedHidden,
      skippedNotLoaded,
      skippedVector,
    },
    items,
    issues,
  };
})();
