(() => {
  function isOwnRequest(entry) {
    return entry.name.endsWith("#webperf-snippets");
  }
  const SCRIPT = "Webfont-Usage-Analyzer";
  const MAX_ITEMS = 50;
  const MAX_ELEMENTS = 20000;
  const MAX_CODEPOINTS = 20000;
  const BYTES_WARNING = 300 * 1024;
  const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;
  if (typeof FontFace === "undefined" || !document.fonts) return {
    script: SCRIPT,
    status: "unsupported",
    message: "The CSS Font Loading API (document.fonts) is not available in this browser"
  };
  const stripQuotes = s => String(s).replace(/["']/g, "").trim();
  const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
  function parseWeight(value) {
    const v = String(value).trim().toLowerCase();
    if (v === "normal") return [ 400, 400 ];
    if (v === "bold") return [ 700, 700 ];
    const nums = v.split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
    if (nums.length === 0) return [ 400, 400 ];
    return [ Math.min(...nums), Math.max(...nums) ];
  }
  function parseRanges(value) {
    const ranges = [];
    for (const token of String(value).split(",")) {
      const m = token.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
      if (!m) continue;
      if (m[1].includes("?")) ranges.push([ parseInt(m[1].replace(/\?/g, "0"), 16), parseInt(m[1].replace(/\?/g, "f"), 16) ]); else {
        const lo = parseInt(m[1], 16);
        ranges.push([ lo, m[2] ? parseInt(m[2], 16) : lo ]);
      }
    }
    return ranges;
  }
  const isDefaultRange = value => !value || /^U\+0-10FFFF$/i.test(value.trim());
  const rangeCovers = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  const styleKind = s => String(s).trim().toLowerCase() === "normal" ? "normal" : "slanted";
  let unreadableStylesheets = 0;
  const ruleSources = new Map;
  const faceKey = (family, weight, style, range) => [ stripQuotes(family).toLowerCase(), String(weight).trim() || "normal", String(style).trim() || "normal", isDefaultRange(range) ? "" : parseRanges(range).map(r => r.join("-")).join(",") ].join("|");
  function collectRules(rules, baseHref, depth) {
    if (depth > 6) return;
    for (const rule of rules) if (rule instanceof window.CSSFontFaceRule) {
      const s = rule.style;
      const urls = [ ...s.getPropertyValue("src").matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g) ].map(m => {
        try {
          return new URL(m[2], baseHref).href;
        } catch {
          return null;
        }
      }).filter(u => u && !u.startsWith("data:"));
      const key = faceKey(s.getPropertyValue("font-family"), s.getPropertyValue("font-weight"), s.getPropertyValue("font-style"), s.getPropertyValue("unicode-range"));
      ruleSources.set(key, [ ...ruleSources.get(key) ?? [], urls ]);
    } else if (rule.styleSheet) readSheet(rule.styleSheet, depth + 1); else if (rule.cssRules) collectRules(rule.cssRules, baseHref, depth + 1);
  }
  function readSheet(sheet, depth) {
    try {
      collectRules(sheet.cssRules, sheet.href || location.href, depth);
    } catch {
      unreadableStylesheets++;
    }
  }
  Array.from(document.styleSheets).forEach(sheet => readSheet(sheet, 0));
  const knownUrls = new Set([ ...ruleSources.values() ].flat(2));
  const fontEntries = new Map;
  for (const e of performance.getEntriesByType("resource").filter(e => !isOwnRequest(e))) if (FONT_FILE.test(e.name) || knownUrls.has(e.name)) fontEntries.set(e.name, Math.max(fontEntries.get(e.name) ?? 0, e.encodedBodySize || 0));
  const totalFontBytes = [ ...fontEntries.values() ].reduce((sum, b) => sum + b, 0);
  const bytesReadable = [ ...fontEntries.values() ].every(b => b > 0);
  const groups = new Map;
  const HIDDEN_TAGS = new Set([ "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META", "LINK" ]);
  function addText(el, style, text) {
    const clean = text.replace(/\s+/g, "");
    if (!clean) return;
    const key = `${style.fontFamily}|${style.fontWeight}|${style.fontStyle}`;
    let g = groups.get(key);
    if (!g) {
      const families = [ ...style.fontFamily.matchAll(/"([^"]+)"|'([^']+)'|([^,]+)/g) ].map(m => stripQuotes(m[1] ?? m[2] ?? m[3]).toLowerCase());
      g = {
        families: families,
        weight: Number(style.fontWeight) || 400,
        style: style.fontStyle,
        codepoints: new Set
      };
      groups.set(key, g);
    }
    for (const ch of clean) {
      if (g.codepoints.size >= MAX_CODEPOINTS) break;
      g.codepoints.add(ch.codePointAt(0));
    }
  }
  const decodeContent = content => {
    if (!content || content === "none" || content === "normal") return "";
    return content.replace(/^["']|["']$/g, "").replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, "$1");
  };
  const elements = [ document.body, ...document.body.querySelectorAll("*") ];
  const scanned = Math.min(elements.length, MAX_ELEMENTS);
  for (let i = 0; i < scanned; i++) {
    const el = elements[i];
    if (HIDDEN_TAGS.has(el.tagName) || el.checkVisibility && !el.checkVisibility()) continue;
    const style = getComputedStyle(el);
    let own = "";
    for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) own += node.nodeValue;
    addText(el, style, own);
    for (const pseudo of [ "::before", "::after" ]) {
      const ps = getComputedStyle(el, pseudo);
      addText(el, ps, decodeContent(ps.content));
    }
  }
  const seenKeys = new Map;
  const faces = Array.from(document.fonts).map(f => {
    const family = stripQuotes(f.family);
    const range = isDefaultRange(f.unicodeRange) ? "" : f.unicodeRange.trim();
    const key = faceKey(f.family, f.weight, f.style, f.unicodeRange);
    const nth = seenKeys.get(key) ?? 0;
    seenKeys.set(key, nth + 1);
    const urls = ruleSources.get(key)?.[nth] ?? [];
    const url = urls.find(u => fontEntries.has(u)) ?? urls[0] ?? "";
    return {
      family: family,
      weight: String(f.weight),
      style: String(f.style),
      display: f.display || "auto",
      unicodeRange: range,
      status: f.status,
      used: false,
      bytes: f.status === "loaded" && fontEntries.has(url) ? fontEntries.get(url) : 0,
      url: url,
      _key: key,
      _redeclared: false,
      _weightRange: parseWeight(f.weight),
      _ranges: range ? parseRanges(range) : null
    };
  });
  const weightDistance = (face, w) => w >= face._weightRange[0] && w <= face._weightRange[1] ? 0 : Math.min(Math.abs(w - face._weightRange[0]), Math.abs(w - face._weightRange[1]));
  const covers = (face, codepoints) => !face._ranges || [ ...codepoints ].some(cp => rangeCovers(face._ranges, cp));
  for (const g of groups.values()) for (const family of g.families) {
    const ofFamily = faces.filter(f => f.family.toLowerCase() === family);
    if (ofFamily.length === 0) continue;
    const sameStyle = ofFamily.filter(f => styleKind(f.style) === styleKind(g.style));
    const candidates = (sameStyle.length ? sameStyle : ofFamily).filter(f => covers(f, g.codepoints));
    if (candidates.length === 0) continue;
    const best = Math.min(...candidates.map(f => weightDistance(f, g.weight)));
    candidates.filter(f => weightDistance(f, g.weight) === best).forEach(f => f.used = true);
  }
  const byKey = new Map;
  faces.forEach(f => byKey.set(f._key, [ ...byKey.get(f._key) ?? [], f ]));
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const active = group.findLast(f => f.status === "loaded");
    if (!active) continue;
    group.filter(f => f !== active).forEach(f => {
      f.used = false;
      f._redeclared = true;
    });
  }
  const shortRange = r => r.length > 60 ? `${r.slice(0, 57)}...` : r;
  const label = f => `${f.family} ${f.weight} ${f.style}${f.unicodeRange ? ` (${shortRange(f.unicodeRange)})` : ""}`;
  const loaded = faces.filter(f => f.status === "loaded");
  const loadedUnused = loaded.filter(f => !f.used);
  const neverLoaded = faces.filter(f => f.status === "unloaded");
  const failed = faces.filter(f => f.status === "error");
  const shadowed = neverLoaded.filter(f => f._redeclared);
  const neverLoadedSubsets = neverLoaded.filter(f => f.unicodeRange && !f._redeclared);
  const neverLoadedWhole = neverLoaded.filter(f => !f.unicodeRange && !f._redeclared);
  const blockingDisplay = faces.filter(f => (f.status === "loaded" || f.status === "loading") && (f.display === "auto" || f.display === "block"));
  const usedUrls = new Set(loaded.filter(f => f.used && f.url).map(f => f.url));
  const wastedBytes = f => f.url && usedUrls.has(f.url) ? 0 : f.bytes;
  const wastedByFile = new Map(loadedUnused.map(f => [ f.url || label(f), wastedBytes(f) ]));
  const loadedUnusedBytes = [ ...wastedByFile.values() ].reduce((sum, b) => sum + b, 0);
  const bySubsetFamily = new Map;
  for (const f of faces.filter(x => x.unicodeRange)) {
    const entry = bySubsetFamily.get(f.family) ?? {
      family: f.family,
      subsets: 0,
      loadedSubsets: 0
    };
    entry.subsets++;
    if (f.status === "loaded") entry.loadedSubsets++;
    bySubsetFamily.set(f.family, entry);
  }
  const unicodeRangeFamilies = [ ...bySubsetFamily.values() ].filter(e => e.subsets > 1).slice(0, 20);
  const displayCounts = {};
  faces.forEach(f => displayCounts[f.display] = (displayCounts[f.display] ?? 0) + 1);
  const uniqueLabels = list => [ ...new Set(list.map(label)) ];
  const names = list => {
    const unique = uniqueLabels(list);
    const shown = unique.slice(0, 8).join(", ");
    return unique.length > 8 ? `${shown} and ${unique.length - 8} more` : shown;
  };
  const issues = [ ...failed.map(f => ({
    code: "load-failed",
    severity: "error",
    message: `Font failed to load: ${label(f)}`,
    target: f.url || label(f)
  })), ...[ ...new Map(loadedUnused.map(f => [ `${label(f)}|${f.url}`, f ])).values() ].map(f => {
    const bytes = wastedBytes(f) ? `, ${kb(wastedBytes(f))} downloaded for nothing` : "";
    const target = f.url || label(f);
    return f._redeclared ? {
      code: "redeclared",
      severity: "warning",
      message: `Loaded but declared again later with the same descriptors, so the page renders with the other file: ${label(f)}${f.url ? ` from ${f.url}` : ""}${bytes}`,
      target: target
    } : {
      code: "loaded-unused",
      severity: "warning",
      message: `Loaded but not used by any rendered element: ${label(f)}${bytes}`,
      target: target
    };
  }) ];
  if (blockingDisplay.length > 0) issues.push({
    code: "blocking-font-display",
    severity: "warning",
    message: `font-display is auto or block on ${uniqueLabels(blockingDisplay).length} face(s), so text can stay invisible while they load. Use swap or optional: ${names(blockingDisplay)}`
  });
  if (totalFontBytes > BYTES_WARNING) issues.push({
    code: "heavy-fonts",
    severity: "warning",
    message: `Web fonts weigh ${kb(totalFontBytes)} in total (over ${kb(BYTES_WARNING)}). Subset, use WOFF2 or drop unused weights`
  });
  if (neverLoadedWhole.length > 0) issues.push({
    code: "never-loaded",
    severity: "info",
    message: `Declared but never loaded (${uniqueLabels(neverLoadedWhole).length}); nothing on this page needed them: ${names(neverLoadedWhole)}`
  });
  if (shadowed.length > 0) issues.push({
    code: "shadowed",
    severity: "info",
    message: `Declared more than once with the same descriptors; the page uses a later declaration, so these never loaded (${uniqueLabels(shadowed).length}): ${names(shadowed)}`
  });
  if (neverLoadedSubsets.length > 0) issues.push({
    code: "unused-subsets",
    severity: "info",
    message: `unicode-range subsets this page did not need (${uniqueLabels(neverLoadedSubsets).length}), which is the intended behavior of a split font: ${names(neverLoadedSubsets)}`
  });
  if (!bytesReadable) issues.push({
    code: "size-unknown",
    severity: "info",
    message: "Some font files are cross-origin without Timing-Allow-Origin, so their size reads as 0 and the byte totals are a lower bound"
  });
  if (unreadableStylesheets > 0) issues.push({
    code: "unreadable-stylesheets",
    severity: "info",
    message: `${unreadableStylesheets} cross-origin stylesheet(s) could not be read, so their font files cannot be matched to faces`
  });
  if (scanned < elements.length) issues.push({
    code: "elements-capped",
    severity: "info",
    message: `Only the first ${MAX_ELEMENTS} elements were scanned for text; some faces may be reported as unused`
  });
  const STATUS_ORDER = [ "loaded", "loading", "error" ];
  const rowGroups = new Map;
  faces.filter(f => f.status !== "unloaded").forEach(f => {
    const key = `${f._key}|${f.url}`;
    rowGroups.set(key, [ ...rowGroups.get(key) ?? [], f ]);
  });
  const note = f => {
    if (f.used) return "";
    if (f.status === "error") return "failed to load";
    if (f.status === "loaded") return f._redeclared ? "declared again later" : "loaded but not used";
    return "";
  };
  const rows = [ ...rowGroups.values() ].map(group => {
    const f = group.find(x => x.used) ?? [ ...group ].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))[0];
    return {
      ...f,
      declarations: group.length,
      note: note(f)
    };
  });
  const rowsLoaded = rows.filter(f => f.status === "loaded");
  const neverLoadedNames = uniqueLabels([ ...neverLoadedWhole, ...neverLoadedSubsets ]);
  if (rows.length > 0) void 0; else void 0;
  issues.forEach(i => {});
  const rank = f => f.status === "error" ? 0 : f.status === "loaded" && !f.used ? 1 : f.status === "loaded" ? 2 : 3;
  const items = rows.map((f, index) => ({
    f: f,
    index: index
  })).sort((a, b) => rank(a.f) - rank(b.f) || a.index - b.index).slice(0, MAX_ITEMS).map(({f: f}) => ({
    family: f.family,
    weight: f.weight,
    style: f.style,
    display: f.display,
    unicodeRange: shortRange(f.unicodeRange),
    status: f.status,
    used: f.used,
    declarations: f.declarations,
    bytes: f.bytes,
    note: f.note,
    url: f.url
  }));
  return {
    script: SCRIPT,
    status: "ok",
    count: rows.length,
    corsLimitedAnalysis: !bytesReadable,
    details: {
      declarationCount: faces.length,
      loadedCount: rowsLoaded.length,
      usedCount: rowsLoaded.filter(f => f.used).length,
      loadedUnusedCount: rowsLoaded.filter(f => !f.used).length,
      loadedUnusedBytes: loadedUnusedBytes,
      neverLoadedCount: neverLoadedNames.length,
      neverLoaded: neverLoadedNames.slice(0, MAX_ITEMS),
      errorCount: rows.filter(f => f.status === "error").length,
      fontFileCount: fontEntries.size,
      totalFontBytes: totalFontBytes,
      bytesReadable: bytesReadable,
      fontDisplay: displayCounts,
      unicodeRangeFamilies: unicodeRangeFamilies,
      unreadableStylesheets: unreadableStylesheets,
      elementsScanned: scanned
    },
    items: items,
    issues: issues
  };
})();
