void (async () => {
  function shortName(url) {
    try {
      const path = new URL(url).pathname;
      const name = path.split("/").pop() || path;
      return name.length > 45 ? "…" + name.slice(-42) : name;
    } catch {
      return url.slice(-45);
    }
  }
  function compressionFromEntry(entry) {
    if (entry.transferSize === 0 && entry.encodedBodySize === 0) return "cached";
    if (entry.encodedBodySize === 0) return "unknown";
    if (entry.encodedBodySize < entry.decodedBodySize) return "compressed";
    return "none";
  }
  function findEmbeddedBitmaps(svgText) {
    const found = [];
    const dataRe = /data:image\/(png|jpe?g|gif|webp|avif|bmp|tiff?|ico);base64,([A-Za-z0-9+/=]*)/gi;
    let m;
    while ((m = dataRe.exec(svgText)) !== null) found.push({
      kind: "inline",
      format: m[1].replace("jpeg", "jpg"),
      estimatedBytes: Math.floor(m[2].length * 3 / 4)
    });
    const hrefRe = /(?:xlink:)?href=["']([^"']*\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|ico))["']/gi;
    while ((m = hrefRe.exec(svgText)) !== null) found.push({
      kind: "external",
      format: m[1].split(".").pop().toLowerCase().replace("jpeg", "jpg"),
      url: m[1]
    });
    return found;
  }
  const svgEntries = performance.getEntriesByType("resource").filter(e => e.name.split("?")[0].toLowerCase().endsWith(".svg"));
  const externalResults = await Promise.all(svgEntries.map(async entry => {
    let compression = compressionFromEntry(entry);
    let bitmaps = [];
    try {
      const res = await fetch(entry.name, {
        cache: "force-cache"
      });
      const ce = res.headers.get("content-encoding");
      if (ce) compression = ce;
      bitmaps = findEmbeddedBitmaps(await res.text());
    } catch {}
    const transferSize = entry.transferSize > 0 ? entry.transferSize : entry.encodedBodySize;
    return {
      name: shortName(entry.name),
      url: entry.name,
      transferSize: transferSize,
      compression: compression,
      bitmaps: bitmaps
    };
  }));
  const inlineSvgs = Array.from(document.querySelectorAll("svg"));
  const inlineSvgTotal = inlineSvgs.length;
  const svgsWithUse = inlineSvgs.filter(svg => svg.querySelector("use")).length;
  const standaloneInlineSvgs = inlineSvgTotal - svgsWithUse;
  const inlineResults = Array.from(document.querySelectorAll("svg")).map((svg, i) => {
    const html = svg.outerHTML;
    const bitmaps = findEmbeddedBitmaps(html);
    if (!bitmaps.length) return null;
    return {
      name: svg.id ? `#${svg.id}` : `inline-svg[${i + 1}]`,
      transferSize: new Blob([ html ]).size,
      compression: "N/A",
      bitmaps: bitmaps
    };
  }).filter(Boolean);
  const withBitmaps = [ ...externalResults.filter(r => r.bitmaps.length > 0), ...inlineResults ];
  if (svgEntries.length === 0 && inlineSvgTotal === 0) {
    return {
      script: "SVG-Embedded-Bitmap-Analysis",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  if (externalResults.length > 0) {
  }
  if (withBitmaps.length > 0) {
    withBitmaps.forEach(r => {
      r.bitmaps.forEach(b => {
        if (b.kind === "inline") void 0; else void 0;
      });
    });
  } else {
  }
  if (standaloneInlineSvgs >= 5) {
  }
  return {
    script: "SVG-Embedded-Bitmap-Analysis",
    status: "ok",
    count: withBitmaps.length,
    items: withBitmaps.map(r => ({
      url: r.url || r.name,
      name: r.name,
      hasBitmap: true,
      bitmapCount: r.bitmaps.length,
      bitmapTypes: r.bitmaps.map(b => b.format).join(", "),
      sizeBytes: r.transferSize
    })),
    issues: withBitmaps.length > 0 ? [ {
      severity: "warning",
      message: `${withBitmaps.length} SVG file(s) contain embedded bitmaps`
    } ] : []
  };
})();
