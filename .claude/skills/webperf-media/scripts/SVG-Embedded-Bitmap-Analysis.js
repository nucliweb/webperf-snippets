// SVG Embedded Bitmap Analysis
// https://webperf-snippets.nucliweb.net

void (async () => {
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

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

    // Inline base64-encoded bitmaps via data URIs
    const dataRe = /data:image\/(png|jpe?g|gif|webp|avif|bmp|tiff?|ico);base64,([A-Za-z0-9+/=]*)/gi;
    let m;
    while ((m = dataRe.exec(svgText)) !== null) {
      found.push({
        kind: "inline",
        format: m[1].replace("jpeg", "jpg"),
        estimatedBytes: Math.floor((m[2].length * 3) / 4),
      });
    }

    // External bitmap URLs referenced via <image href> or xlink:href
    const hrefRe = /(?:xlink:)?href=["']([^"']*\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|ico))["']/gi;
    while ((m = hrefRe.exec(svgText)) !== null) {
      found.push({
        kind: "external",
        format: m[1].split(".").pop().toLowerCase().replace("jpeg", "jpg"),
        url: m[1],
      });
    }

    return found;
  }

  // ── External SVG files (Performance API) ──────────────────────────────
  const svgEntries = performance
    .getEntriesByType("resource")
    .filter((e) => e.name.split("?")[0].toLowerCase().endsWith(".svg"));

  const externalResults = await Promise.all(
    svgEntries.map(async (entry) => {
      let compression = compressionFromEntry(entry);
      let bitmaps = [];

      try {
        const res = await fetch(entry.name, { cache: "force-cache" });
        const ce = res.headers.get("content-encoding");
        if (ce) compression = ce; // gzip | br | zstd | deflate
        bitmaps = findEmbeddedBitmaps(await res.text());
      } catch {
        // CORS or network error — Performance API data used as fallback
      }

      const transferSize = entry.transferSize > 0 ? entry.transferSize : entry.encodedBodySize;

      return {
        name: shortName(entry.name),
        url: entry.name,
        transferSize,
        compression,
        bitmaps,
      };
    }),
  );

  // ── Inline <svg> elements (DOM scan) ────────────────────────────────
  const inlineSvgs = Array.from(document.querySelectorAll("svg"));
  const inlineSvgTotal = inlineSvgs.length;
  const svgsWithUse = inlineSvgs.filter((svg) => svg.querySelector("use")).length;
  const standaloneInlineSvgs = inlineSvgTotal - svgsWithUse;

  const inlineResults = Array.from(document.querySelectorAll("svg"))
    .map((svg, i) => {
      const html = svg.outerHTML;
      const bitmaps = findEmbeddedBitmaps(html);
      if (!bitmaps.length) return null;
      return {
        name: svg.id ? `#${svg.id}` : `inline-svg[${i + 1}]`,
        transferSize: new Blob([html]).size,
        compression: "N/A",
        bitmaps,
      };
    })
    .filter(Boolean);

  // ── Output ───────────────────────────────────────────────────────────
  const withBitmaps = [...externalResults.filter((r) => r.bitmaps.length > 0), ...inlineResults];

  if (svgEntries.length === 0 && inlineSvgTotal === 0) {
    console.log("No SVG resources found on this page.");
    return;
  }

  console.group("%c🖼️ SVG Embedded Bitmap Analysis", "font-weight: bold; font-size: 14px;");

  console.log("");
  console.log("%cSummary", "font-weight: bold;");
  console.log(`   External SVG files    : ${svgEntries.length}`);
  const inlineLabel =
    svgsWithUse > 0
      ? `${inlineSvgTotal}  (${svgsWithUse} using <use>, ${standaloneInlineSvgs} standalone)`
      : `${inlineSvgTotal}`;
  console.log(`   Inline <svg> elements : ${inlineLabel}`);
  console.log(
    `   SVGs with bitmaps     : ${withBitmaps.length}${withBitmaps.length > 0 ? "  ⚠️" : "  ✅"}`,
  );

  if (externalResults.length > 0) {
    console.log("");
    console.group(`%c📋 External SVG Resources (${externalResults.length})`, "font-weight: bold;");
    console.table(
      externalResults.map((r) => ({
        name: r.name,
        size: formatSize(r.transferSize),
        compression: r.compression,
        "embedded bitmap": r.bitmaps.length ? `⚠️ ${r.bitmaps.length} found` : "✅ none",
      })),
    );
    console.groupEnd();
  }

  if (withBitmaps.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ SVGs with Embedded Bitmaps (${withBitmaps.length})`,
      "color: #f59e0b; font-weight: bold;",
    );

    withBitmaps.forEach((r) => {
      console.log("");
      console.log(`%c📄 ${r.name}`, "font-weight: bold;");
      console.log(`   SVG size    : ${formatSize(r.transferSize)}`);
      console.log(`   Compression : ${r.compression}`);
      r.bitmaps.forEach((b) => {
        if (b.kind === "inline") {
          console.log(`   🖼️  inline ${b.format.toUpperCase()} — ~${formatSize(b.estimatedBytes)}`);
        } else {
          console.log(`   🔗  external ${b.format.toUpperCase()} — ${b.url}`);
        }
      });
    });

    console.groupEnd();

    console.log("");
    console.group("%c💡 Recommendations", "color: #3b82f6; font-weight: bold;");
    console.log("");
    console.log("   Embedded bitmaps inflate SVG size (~33% overhead for base64),");
    console.log("   block format negotiation, and prevent independent caching.");
    console.log("");
    console.log("   ✅ Extract the bitmap and serve it as a separate resource");
    console.log("   ✅ Convert the bitmap to a modern format (AVIF or WebP)");
    console.log('   ✅ Reference it from the SVG: <image href="image.avif" width="…" height="…"/>');
    console.log("   ✅ Both files are then cached and optimised independently");
    console.groupEnd();
  } else {
    console.log("");
    console.log(
      "%c✅ No embedded bitmaps found in SVG resources.",
      "color: #22c55e; font-weight: bold;",
    );
  }

  if (standaloneInlineSvgs >= 5) {
    console.log("");
    console.group("%c💡 SVG Sprite Opportunity", "color: #3b82f6; font-weight: bold;");
    console.log("");
    console.log(`   ${standaloneInlineSvgs} standalone inline <svg> elements detected.`);
    console.log("   Each one duplicates markup in the HTML and cannot be cached independently.");
    console.log("   Consider an SVG sprite: define each icon once as a <symbol> and");
    console.log('   reference it anywhere with <use href="#icon-id">.');
    console.log("");
    console.log('%c  <!-- Sprite (once, hidden) -->', "font-family: monospace; color: #6b7280;");
    console.log(
      '%c  <svg hidden>\n    <symbol id="icon-arrow" viewBox="0 0 24 24">…</symbol>\n  </svg>',
      "font-family: monospace;",
    );
    console.log('%c  <!-- Usage (anywhere, N times) -->', "font-family: monospace; color: #6b7280;");
    console.log(
      '%c  <svg aria-hidden="true"><use href="#icon-arrow"/></svg>',
      "font-family: monospace;",
    );
    console.groupEnd();
  }

  console.groupEnd();
})();
