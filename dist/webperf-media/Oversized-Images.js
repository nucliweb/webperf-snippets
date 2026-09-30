(async () => {
  const OVERSIZED_RATIO = 1.5;
  const UNDERSIZED_RATIO = 0.9;
  const SEVERE_OVERSIZED = 2;
  const SEVERE_UNDERSIZED = 0.75;
  const MAX_ITEMS = 50;
  const LOAD_TIMEOUT_MS = 3000;
  const dpr = window.devicePixelRatio || 1;
  const round2 = n => Math.round(n * 100) / 100;
  const px = v => parseFloat(v) || 0;
  const shortUrl = url => url.startsWith("data:") ? url.slice(0, 60) : url;
  const fileName = url => url.split("?")[0].split("/").pop() || url;
  function selectorOf(el) {
    if (el.id) return `img#${el.id}`;
    const cls = Array.from(el.classList).slice(0, 2);
    return cls.length ? `img.${cls.join(".")}` : "img";
  }
  function isVector(url) {
    return /^data:image\/svg/i.test(url) || /\.svg([?#]|$)/i.test(url);
  }
  function loadPixels(url) {
    return new Promise(resolve => {
      const probe = new Image;
      const timer = setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
      probe.onload = () => {
        clearTimeout(timer);
        resolve({
          width: probe.naturalWidth,
          height: probe.naturalHeight
        });
      };
      probe.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      probe.src = url;
    });
  }
  const transferByUrl = new Map;
  performance.getEntriesByType("resource").forEach(e => {
    if (e.initiatorType !== "img" && e.initiatorType !== "css" && e.initiatorType !== "other") return;
    const bytes = e.transferSize > 0 ? e.transferSize : e.encodedBodySize > 0 ? e.encodedBodySize : null;
    if (bytes !== null) transferByUrl.set(e.name, bytes);
  });
  function scaleOf(img, boxW, boxH, fileW, fileH) {
    const fit = getComputedStyle(img).objectFit;
    const sx = boxW / fileW;
    const sy = boxH / fileH;
    const contain = Math.min(sx, sy);
    const none = img.naturalWidth / fileW;
    if (fit === "cover") return {
      sx: Math.max(sx, sy),
      sy: Math.max(sx, sy)
    };
    if (fit === "contain") return {
      sx: contain,
      sy: contain
    };
    if (fit === "none") return {
      sx: none,
      sy: none
    };
    if (fit === "scale-down") {
      const s = Math.min(contain, none);
      return {
        sx: s,
        sy: s
      };
    }
    return {
      sx: sx,
      sy: sy
    };
  }
  const images = Array.from(document.querySelectorAll("img"));
  let skippedHidden = 0;
  let skippedNotLoaded = 0;
  let skippedVector = 0;
  const candidates = [];
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return void skippedHidden++;
    const url = img.currentSrc || img.src || "";
    if (!img.complete || img.naturalWidth === 0 || !url) return void skippedNotLoaded++;
    if (isVector(url)) return void skippedVector++;
    candidates.push({
      img: img,
      rect: rect,
      url: url
    });
  });
  const pixelsByUrl = new Map;
  await Promise.all([ ...new Set(candidates.map(c => c.url)) ].map(async url => {
    pixelsByUrl.set(url, await loadPixels(url));
  }));
  const flagged = [];
  let checked = 0;
  let wastedPixels = 0;
  const wastedBytesByUrl = new Map;
  candidates.forEach(({img: img, rect: rect, url: url}) => {
    const file = pixelsByUrl.get(url);
    if (!file || !file.width || !file.height) return void skippedNotLoaded++;
    checked++;
    const style = getComputedStyle(img);
    const boxW = rect.width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth);
    const boxH = rect.height - px(style.paddingTop) - px(style.paddingBottom) - px(style.borderTopWidth) - px(style.borderBottomWidth);
    if (boxW <= 0 || boxH <= 0) return;
    const {sx: sx, sy: sy} = scaleOf(img, boxW, boxH, file.width, file.height);
    const neededWidth = Math.round(file.width * sx * dpr);
    const neededHeight = Math.round(file.height * sy * dpr);
    const ratio = Math.min(1 / (sx * dpr), 1 / (sy * dpr));
    let verdict = null;
    if (ratio >= OVERSIZED_RATIO) verdict = "oversized"; else if (ratio < UNDERSIZED_RATIO) verdict = "undersized";
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
      verdict: verdict,
      naturalWidth: file.width,
      naturalHeight: file.height,
      renderedWidth: Math.round(boxW),
      renderedHeight: Math.round(boxH),
      neededWidth: neededWidth,
      neededHeight: neededHeight,
      ratio: round2(ratio),
      wastedPixels: wasted,
      transferBytes: transferBytes,
      wastedBytes: wastedBytes,
      hasSrcset: img.hasAttribute("srcset"),
      hasSizes: img.hasAttribute("sizes")
    });
  });
  flagged.sort((a, b) => b.wastedPixels - a.wastedPixels || a.ratio - b.ratio);
  const oversized = flagged.filter(f => f.verdict === "oversized").length;
  const undersized = flagged.length - oversized;
  const wastedBytes = [ ...wastedBytesByUrl.values() ].reduce((a, b) => a + b, 0);
  const issues = flagged.map(f => {
    const size = `${f.naturalWidth}x${f.naturalHeight}`;
    const shown = `${f.neededWidth}x${f.neededHeight}`;
    if (f.verdict === "oversized") {
      const kb = f.wastedBytes === null ? "" : `, about ${Math.round(f.wastedBytes / 1024)} KB wasted`;
      return {
        severity: f.ratio >= SEVERE_OVERSIZED ? "warning" : "info",
        message: `${fileName(f.url)}: ${size} file for a ${shown} slot at ${dpr}x (${f.ratio}x too large${kb})`
      };
    }
    return {
      severity: f.ratio < SEVERE_UNDERSIZED ? "warning" : "info",
      message: `${fileName(f.url)}: ${size} file for a ${shown} slot at ${dpr}x (blurry, needs ${round2(1 / f.ratio)}x more pixels)`
    };
  });
  const items = flagged.slice(0, MAX_ITEMS);
  if (items.length > 0) void 0; else void 0;
  return {
    script: "Oversized-Images",
    status: "ok",
    count: flagged.length,
    details: {
      devicePixelRatio: dpr,
      totalImages: images.length,
      imagesChecked: checked,
      oversized: oversized,
      undersized: undersized,
      wastedPixels: wastedPixels,
      wastedBytes: wastedBytes,
      skippedHidden: skippedHidden,
      skippedNotLoaded: skippedNotLoaded,
      skippedVector: skippedVector
    },
    items: items,
    issues: issues
  };
})();
