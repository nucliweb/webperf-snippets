// Webfont Usage Analyzer
// https://webperf-snippets.nucliweb.net
//
// Cross-checks every @font-face known to document.fonts against the text that renders on the
// page: faces loaded but not used, faces declared but never loaded, unicode-range subsets,
// font-display, and the bytes the font files cost.
// Idea and original script: https://github.com/paulcalvano/webfont-usage-analyzer

(() => {
  const SCRIPT = "Webfont-Usage-Analyzer";
  const MAX_ITEMS = 50;
  const MAX_ELEMENTS = 20000;
  const MAX_CODEPOINTS = 20000;
  const BYTES_WARNING = 300 * 1024;
  const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

  if (typeof FontFace === "undefined" || !document.fonts) {
    return {
      script: SCRIPT,
      status: "unsupported",
      message: "The CSS Font Loading API (document.fonts) is not available in this browser",
    };
  }

  const stripQuotes = (s) => String(s).replace(/["']/g, "").trim();
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

  // --- Face metadata -------------------------------------------------------------------

  // "normal" is 400 and "bold" is 700; a variable range such as "100 900" is kept as a range
  function parseWeight(value) {
    const v = String(value).trim().toLowerCase();
    if (v === "normal") return [400, 400];
    if (v === "bold") return [700, 700];
    const nums = v.split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return [400, 400];
    return [Math.min(...nums), Math.max(...nums)];
  }

  // "U+0-FF, U+131, U+4??" as [[lo, hi], ...]
  function parseRanges(value) {
    const ranges = [];
    for (const token of String(value).split(",")) {
      const m = token.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
      if (!m) continue;
      if (m[1].includes("?")) {
        ranges.push([parseInt(m[1].replace(/\?/g, "0"), 16), parseInt(m[1].replace(/\?/g, "f"), 16)]);
      } else {
        const lo = parseInt(m[1], 16);
        ranges.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
      }
    }
    return ranges;
  }

  const isDefaultRange = (value) => !value || /^U\+0-10FFFF$/i.test(value.trim());
  const rangeCovers = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  const styleKind = (s) => (String(s).trim().toLowerCase() === "normal" ? "normal" : "slanted");

  // --- Font file URLs, from the @font-face rules ---------------------------------------

  let unreadableStylesheets = 0;
  const ruleSources = new Map(); // "family|weight|style|range" -> [absolute urls]
  const faceKey = (family, weight, style, range) =>
    [stripQuotes(family).toLowerCase(), String(weight).trim() || "normal", String(style).trim() || "normal", isDefaultRange(range) ? "" : parseRanges(range).map((r) => r.join("-")).join(",")].join("|");

  function collectRules(rules, baseHref, depth) {
    if (depth > 6) return;
    for (const rule of rules) {
      if (rule instanceof window.CSSFontFaceRule) {
        const s = rule.style;
        const urls = [...s.getPropertyValue("src").matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)]
          .map((m) => {
            try {
              return new URL(m[2], baseHref).href;
            } catch {
              return null;
            }
          })
          .filter((u) => u && !u.startsWith("data:"));
        const key = faceKey(s.getPropertyValue("font-family"), s.getPropertyValue("font-weight"), s.getPropertyValue("font-style"), s.getPropertyValue("unicode-range"));
        ruleSources.set(key, [...(ruleSources.get(key) ?? []), ...urls]);
      } else if (rule.styleSheet) {
        readSheet(rule.styleSheet, depth + 1);
      } else if (rule.cssRules) {
        collectRules(rule.cssRules, baseHref, depth + 1);
      }
    }
  }

  function readSheet(sheet, depth) {
    try {
      collectRules(sheet.cssRules, sheet.href || location.href, depth);
    } catch {
      unreadableStylesheets++; // cross-origin stylesheet without CORS
    }
  }

  Array.from(document.styleSheets).forEach((sheet) => readSheet(sheet, 0));

  // --- Bytes, from Resource Timing -----------------------------------------------------

  const knownUrls = new Set([...ruleSources.values()].flat());
  const fontEntries = new Map(); // url -> encodedBodySize
  for (const e of performance.getEntriesByType("resource")) {
    if (FONT_FILE.test(e.name) || knownUrls.has(e.name)) {
      fontEntries.set(e.name, Math.max(fontEntries.get(e.name) ?? 0, e.encodedBodySize || 0));
    }
  }
  const totalFontBytes = [...fontEntries.values()].reduce((sum, b) => sum + b, 0);
  // Cross-origin files without Timing-Allow-Origin report a size of 0
  const bytesReadable = [...fontEntries.values()].every((b) => b > 0);

  // --- Text that renders, grouped by font stack, weight and style ----------------------

  const groups = new Map(); // key -> { families, weight, style, codepoints }
  const HIDDEN_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK"]);

  function addText(el, style, text) {
    const clean = text.replace(/\s+/g, "");
    if (!clean) return;
    const key = `${style.fontFamily}|${style.fontWeight}|${style.fontStyle}`;
    let g = groups.get(key);
    if (!g) {
      const families = [...style.fontFamily.matchAll(/"([^"]+)"|'([^']+)'|([^,]+)/g)].map((m) => stripQuotes(m[1] ?? m[2] ?? m[3]).toLowerCase());
      g = { families, weight: Number(style.fontWeight) || 400, style: style.fontStyle, codepoints: new Set() };
      groups.set(key, g);
    }
    for (const ch of clean) {
      if (g.codepoints.size >= MAX_CODEPOINTS) break;
      g.codepoints.add(ch.codePointAt(0));
    }
  }

  // Computed content of ::before/::after: "\"\\e900\"" -> the icon glyph
  const decodeContent = (content) => {
    if (!content || content === "none" || content === "normal") return "";
    return content
      .replace(/^["']|["']$/g, "")
      .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\(.)/g, "$1");
  };

  const elements = [document.body, ...document.body.querySelectorAll("*")];
  const scanned = Math.min(elements.length, MAX_ELEMENTS);
  for (let i = 0; i < scanned; i++) {
    const el = elements[i];
    if (HIDDEN_TAGS.has(el.tagName) || (el.checkVisibility && !el.checkVisibility())) continue;
    const style = getComputedStyle(el);
    let own = "";
    for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) own += node.nodeValue;
    addText(el, style, own);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      addText(el, ps, decodeContent(ps.content));
    }
  }

  // --- Faces ---------------------------------------------------------------------------

  const faces = Array.from(document.fonts).map((f) => {
    const family = stripQuotes(f.family);
    const range = isDefaultRange(f.unicodeRange) ? "" : f.unicodeRange.trim();
    const urls = ruleSources.get(faceKey(f.family, f.weight, f.style, f.unicodeRange)) ?? [];
    const url = urls.find((u) => fontEntries.has(u)) ?? urls[0] ?? "";
    return {
      family,
      weight: String(f.weight),
      style: String(f.style),
      display: f.display || "auto",
      unicodeRange: range,
      status: f.status,
      used: false,
      bytes: url && fontEntries.has(url) ? fontEntries.get(url) : 0,
      url,
      _weightRange: parseWeight(f.weight),
      _ranges: range ? parseRanges(range) : null,
    };
  });

  // A face is used when the text that renders with its family reaches it: the style matches
  // (or the family has no face in that style), the text has a character inside its
  // unicode-range, and it is the closest weight, since browsers pick the nearest weight.
  const weightDistance = (face, w) =>
    w >= face._weightRange[0] && w <= face._weightRange[1] ? 0 : Math.min(Math.abs(w - face._weightRange[0]), Math.abs(w - face._weightRange[1]));
  const covers = (face, codepoints) => !face._ranges || [...codepoints].some((cp) => rangeCovers(face._ranges, cp));

  for (const g of groups.values()) {
    for (const family of g.families) {
      const ofFamily = faces.filter((f) => f.family.toLowerCase() === family);
      if (ofFamily.length === 0) continue;
      const sameStyle = ofFamily.filter((f) => styleKind(f.style) === styleKind(g.style));
      const candidates = (sameStyle.length ? sameStyle : ofFamily).filter((f) => covers(f, g.codepoints));
      if (candidates.length === 0) continue;
      const best = Math.min(...candidates.map((f) => weightDistance(f, g.weight)));
      candidates.filter((f) => weightDistance(f, g.weight) === best).forEach((f) => (f.used = true));
    }
  }

  // --- Classification ------------------------------------------------------------------

  // Split fonts declare long ranges; keep reported text short
  const shortRange = (r) => (r.length > 60 ? `${r.slice(0, 57)}...` : r);
  const label = (f) => `${f.family} ${f.weight} ${f.style}${f.unicodeRange ? ` (${shortRange(f.unicodeRange)})` : ""}`;
  const loaded = faces.filter((f) => f.status === "loaded");
  const loadedUnused = loaded.filter((f) => !f.used);
  const neverLoaded = faces.filter((f) => f.status === "unloaded");
  const failed = faces.filter((f) => f.status === "error");
  const neverLoadedSubsets = neverLoaded.filter((f) => f.unicodeRange);
  const neverLoadedWhole = neverLoaded.filter((f) => !f.unicodeRange);
  const blockingDisplay = faces.filter((f) => (f.status === "loaded" || f.status === "loading") && (f.display === "auto" || f.display === "block"));
  const loadedUnusedBytes = loadedUnused.reduce((sum, f) => sum + f.bytes, 0);

  const bySubsetFamily = new Map();
  for (const f of faces.filter((x) => x.unicodeRange)) {
    const entry = bySubsetFamily.get(f.family) ?? { family: f.family, subsets: 0, loadedSubsets: 0 };
    entry.subsets++;
    if (f.status === "loaded") entry.loadedSubsets++;
    bySubsetFamily.set(f.family, entry);
  }
  const unicodeRangeFamilies = [...bySubsetFamily.values()].filter((e) => e.subsets > 1).slice(0, 20);

  const displayCounts = {};
  faces.forEach((f) => (displayCounts[f.display] = (displayCounts[f.display] ?? 0) + 1));

  const names = (list) => {
    // A stylesheet can declare the same face twice
    const unique = [...new Set(list.map(label))];
    const shown = unique.slice(0, 8).join(", ");
    return unique.length > 8 ? `${shown} and ${unique.length - 8} more` : shown;
  };

  const issues = [
    ...failed.map((f) => ({ severity: "error", message: `Font failed to load: ${label(f)}` })),
    ...loadedUnused.map((f) => ({
      severity: "warning",
      message: `Loaded but not used by any rendered element: ${label(f)}${f.bytes ? `, ${kb(f.bytes)} downloaded for nothing` : ""}`,
    })),
  ];
  if (blockingDisplay.length > 0) {
    issues.push({
      severity: "warning",
      message: `font-display is auto or block on ${blockingDisplay.length} face(s), so text can stay invisible while they load. Use swap or optional: ${names(blockingDisplay)}`,
    });
  }
  if (totalFontBytes > BYTES_WARNING) {
    issues.push({ severity: "warning", message: `Web fonts weigh ${kb(totalFontBytes)} in total (over ${kb(BYTES_WARNING)}). Subset, use WOFF2 or drop unused weights` });
  }
  if (neverLoadedWhole.length > 0) {
    issues.push({ severity: "info", message: `Declared but never loaded (${neverLoadedWhole.length}); nothing on this page needed them: ${names(neverLoadedWhole)}` });
  }
  if (neverLoadedSubsets.length > 0) {
    issues.push({ severity: "info", message: `unicode-range subsets this page did not need (${neverLoadedSubsets.length}), which is the intended behavior of a split font: ${names(neverLoadedSubsets)}` });
  }
  if (!bytesReadable) {
    issues.push({ severity: "info", message: "Some font files are cross-origin without Timing-Allow-Origin, so their size reads as 0 and the byte totals are a lower bound" });
  }
  if (unreadableStylesheets > 0) {
    issues.push({ severity: "info", message: `${unreadableStylesheets} cross-origin stylesheet(s) could not be read, so their font files cannot be matched to faces` });
  }
  if (scanned < elements.length) {
    issues.push({ severity: "info", message: `Only the first ${MAX_ELEMENTS} elements were scanned for text; some faces may be reported as unused` });
  }

  // --- Console output ------------------------------------------------------------------

  console.group("%cWebfont Usage Analyzer", "font-weight: bold; font-size: 14px;");
  console.log(`Faces: ${faces.length} | loaded: ${loaded.length} | used: ${faces.filter((f) => f.used).length} | loaded but unused: ${loadedUnused.length} | never loaded: ${neverLoaded.length}`);
  console.log(`Font files: ${fontEntries.size} | total: ${kb(totalFontBytes)}${bytesReadable ? "" : " (lower bound, cross-origin sizes hidden)"}`);
  if (faces.length > 0) {
    console.table(
      faces.map((f) => ({
        Family: f.family,
        Weight: f.weight,
        Style: f.style,
        Display: f.display,
        "unicode-range": shortRange(f.unicodeRange) || "all",
        Status: f.status,
        Used: f.used ? "yes" : "no",
        Size: f.bytes ? kb(f.bytes) : "-",
      }))
    );
  } else {
    console.log("No @font-face rules or FontFace objects on this page.");
  }
  issues.forEach((i) => console.log(`[${i.severity}] ${i.message}`));
  console.groupEnd();

  // --- Return value --------------------------------------------------------------------

  // Problems first, so the 50-item cap never hides them
  const rank = (f) => (f.status === "error" ? 0 : f.status === "loaded" && !f.used ? 1 : f.status === "loaded" ? 2 : 3);
  const items = faces
    .map((f, index) => ({ f, index }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.index - b.index)
    .slice(0, MAX_ITEMS)
    .map(({ f }) => ({
      family: f.family,
      weight: f.weight,
      style: f.style,
      display: f.display,
      unicodeRange: shortRange(f.unicodeRange),
      status: f.status,
      used: f.used,
      bytes: f.bytes,
      url: f.url,
    }));

  return {
    script: SCRIPT,
    status: "ok",
    count: faces.length,
    corsLimitedAnalysis: !bytesReadable,
    details: {
      loadedCount: loaded.length,
      usedCount: loaded.filter((f) => f.used).length,
      loadedUnusedCount: loadedUnused.length,
      loadedUnusedBytes,
      neverLoadedCount: neverLoaded.length,
      errorCount: failed.length,
      fontFileCount: fontEntries.size,
      totalFontBytes,
      bytesReadable,
      fontDisplay: displayCounts,
      unicodeRangeFamilies,
      unreadableStylesheets,
      elementsScanned: scanned,
    },
    items,
    issues,
  };
})();
