// CSS Complexity
// What in the CSS of the page costs bytes or style work and can go: embedded content, @import, empty
// rules, repeated selectors and unused @keyframes, read from the CSSOM of every stylesheet
// https://webperf-snippets.net

(() => {
  const SCRIPT = "CSS-Complexity";
  const MAX_ITEMS = 50;
  // The 90th percentile of the embedded content of a homepage in The CSS Selection 2026 (Project
  // Wallace): 90% of homepages embed less than this in all their CSS
  const EMBEDDED_P90_BYTES = 36632;
  // The 90th percentiles of !important (share of the declarations) and of @font-face rules
  const IMPORTANT_P90_PERCENT = 13;
  const FONT_FACE_P90 = 48;
  // Below this share of unique selectors, css-code-quality (Project Wallace) flags the duplication
  const MIN_SELECTOR_UNIQUENESS = 0.66;

  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // Splits on a separator outside parentheses, brackets and strings: the declarations of a rule
  // (";"), or the selectors of a list (",")
  function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  // The declarations as written, from cssText: the CSSOM lists a shorthand as all its longhands in
  // style.length, and cssText joins them back
  const declarationsOf = (style) => splitTopLevel(style.cssText, ";");

  const FONT_TYPES = /^(font\/|application\/(x-)?font-|application\/vnd\.ms-fontobject)/;

  // The data: URLs of a declaration block, as the CSSOM serializes them: url("data:…")
  function embeddedOf(cssText, inFontFace) {
    const found = [];
    for (const [, raw] of cssText.matchAll(/url\("((?:[^"\\]|\\.)*)"\)/g)) {
      const url = raw.replace(/\\(["\\])/g, "$1");
      if (!/^data:/i.test(url)) continue;
      const type = url.slice(5).split(/[;,]/)[0].toLowerCase() || "text/plain";
      found.push({ type, bytes: url.length, font: inFontFace || FONT_TYPES.test(type) });
    }
    return found;
  }

  const describeHost = (el) => el.localName + (el.id ? `#${el.id}` : el.classList[0] ? `.${el.classList[0]}` : "");

  // --- The stylesheets: of the document, adopted, of open shadow roots, and imported -----------

  const sheets = [];
  const seenSheets = new Set();
  const addSheet = (sheet, source) => {
    if (!sheet || seenSheets.has(sheet)) return;
    seenSheets.add(sheet);
    sheets.push({ sheet, source });
  };
  let styleIndex = 0;
  let adoptedIndex = 0;
  for (const sheet of document.styleSheets) addSheet(sheet, sheet.href || `<style> #${++styleIndex}`);
  for (const sheet of document.adoptedStyleSheets ?? []) addSheet(sheet, `adopted stylesheet #${++adoptedIndex}`);
  for (const el of document.querySelectorAll("*")) {
    const root = el.shadowRoot;
    if (!root) continue;
    const host = describeHost(el);
    for (const sheet of root.styleSheets) addSheet(sheet, sheet.href || `<style> in the shadow root of ${host}`);
    for (const sheet of root.adoptedStyleSheets ?? []) addSheet(sheet, `adopted stylesheet in the shadow root of ${host}`);
  }

  // --- Counting ----------------------------------------------------------------------------------

  const imports = [];
  const embeddedTypes = new Map();
  // Every selector of every rule, without its context (@media, @supports), as css-analyzer counts them
  const selectorCounts = new Map();
  const keyframesDefined = new Set();
  const animationsUsed = new Set();
  let keyframesCount = 0;
  let fontFaceCount = 0;

  const noteAnimations = (style) => {
    for (const name of (style.animationName ?? "").split(",")) {
      const n = name.trim();
      if (n && n !== "none") animationsUsed.add(n);
    }
  };

  // Counts the declarations of a block, its !important and the animations it names
  function noteDeclarations(style, stats) {
    const declarations = declarationsOf(style);
    stats.declarationCount += declarations.length;
    stats.importantCount += declarations.filter((d) => /!\s*important$/i.test(d)).length;
    noteAnimations(style);
    return declarations;
  }

  function walk(rules, stats, sheetUrl) {
    for (const rule of rules) {
      if (rule instanceof window.CSSImportRule) {
        stats.importCount++;
        let href = rule.href;
        try {
          href = new URL(rule.href, sheetUrl).href;
        } catch {
          // keep the href as written
        }
        imports.push({ from: stats.source, href });
        addSheet(rule.styleSheet, href);
      } else if (rule instanceof window.CSSStyleRule) {
        const declarations = noteDeclarations(rule.style, stats);
        const nested = rule.cssRules?.length ?? 0;
        const selectors = splitTopLevel(rule.selectorText, ",");
        stats.ruleCount++;
        stats.selectorCount += selectors.length;
        for (const selector of selectors) selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1);
        if (declarations.length === 0 && nested === 0) stats.emptyRuleCount++;
        count(embeddedOf(rule.style.cssText, false), stats);
        if (nested) walk(rule.cssRules, stats, sheetUrl);
      } else if (window.CSSNestedDeclarations && rule instanceof window.CSSNestedDeclarations) {
        // The declarations of a style rule that follow a nested rule, or sit in a nested @media
        noteDeclarations(rule.style, stats);
        count(embeddedOf(rule.style.cssText, false), stats);
      } else if (rule instanceof window.CSSFontFaceRule) {
        fontFaceCount++;
        stats.declarationCount += declarationsOf(rule.style).length;
        count(embeddedOf(rule.style.cssText, true), stats);
      } else if (rule instanceof window.CSSKeyframesRule) {
        keyframesCount++;
        keyframesDefined.add(rule.name);
        for (const keyframe of rule.cssRules) {
          stats.declarationCount += declarationsOf(keyframe.style).length;
          count(embeddedOf(keyframe.style.cssText, false), stats);
        }
      } else if (rule.cssRules) {
        // @media, @supports, @layer, @container and the other rules that group rules
        walk(rule.cssRules, stats, sheetUrl);
      }
    }
  }

  function count(embedded, stats) {
    for (const { type, bytes, font } of embedded) {
      stats.embeddedBytes += bytes;
      stats.embeddedCount++;
      if (font) {
        stats.fontCount++;
        stats.fontBytes += bytes;
      }
      const t = embeddedTypes.get(type) ?? { type, count: 0, bytes: 0 };
      t.count++;
      t.bytes += bytes;
      embeddedTypes.set(type, t);
    }
  }

  const perSheet = [];
  // The list grows while it is read: each @import adds the sheet it imports
  for (let i = 0; i < sheets.length; i++) {
    const { sheet, source } = sheets[i];
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // A stylesheet of another origin, loaded without CORS
    }
    if (!rules) {
      perSheet.push({ source, read: "unreadable" });
      continue;
    }
    const stats = { source, read: "cssom", ruleCount: 0, selectorCount: 0, declarationCount: 0, importantCount: 0, emptyRuleCount: 0, embeddedBytes: 0, embeddedCount: 0, fontCount: 0, fontBytes: 0, importCount: 0 };
    walk(rules, stats, sheet.href || location.href);
    perSheet.push(stats);
  }

  // The animations of style attributes, in the document and in open shadow roots
  const roots = [document, ...[...document.querySelectorAll("*")].map((el) => el.shadowRoot).filter(Boolean)];
  for (const root of roots) for (const el of root.querySelectorAll("[style]")) noteAnimations(el.style);

  const read = perSheet.filter((s) => s.read !== "unreadable");
  const unreadable = perSheet.filter((s) => s.read === "unreadable");
  const sum = (key) => read.reduce((total, s) => total + s[key], 0);
  // Unique selectors over all selectors; 1 without selectors, since none repeats
  const selectorUniqueness = () => {
    const total = [...selectorCounts.values()].reduce((a, b) => a + b, 0);
    return total ? Math.round((selectorCounts.size / total) * 1000) / 1000 : 1;
  };
  const details = {
    stylesheetCount: perSheet.length,
    unreadableCount: unreadable.length,
    ruleCount: sum("ruleCount"),
    selectorCount: sum("selectorCount"),
    declarationCount: sum("declarationCount"),
    embeddedBytes: sum("embeddedBytes"),
    embeddedCount: sum("embeddedCount"),
    embeddedTypes: [...embeddedTypes.values()].sort((a, b) => b.bytes - a.bytes || a.type.localeCompare(b.type)),
    importCount: sum("importCount"),
    emptyRuleCount: sum("emptyRuleCount"),
    selectorUniqueness: selectorUniqueness(),
    importantCount: sum("importantCount"),
    importantPercent: 0,
    fontFaceCount,
    keyframesCount,
    unusedKeyframes: [...keyframesDefined].filter((name) => !animationsUsed.has(name)).sort(),
  };
  details.importantPercent = details.declarationCount ? Math.round((details.importantCount / details.declarationCount) * 1000) / 10 : 0;

  // --- Issues ------------------------------------------------------------------------------------

  const issues = [];
  for (const s of read.filter((s) => s.fontCount > 0)) {
    issues.push({
      code: "embedded-font",
      severity: "warning",
      message: `${s.source} embeds ${plural(s.fontCount, "font file")} as ${s.fontCount === 1 ? "a data: URL" : "data: URLs"} (${formatBytes(s.fontBytes)}). An embedded font downloads with the stylesheet, blocks rendering with it and cannot be cached apart from it: serve fonts as WOFF2 files, with font-display`,
      target: s.source,
    });
  }
  if (details.embeddedBytes > EMBEDDED_P90_BYTES) {
    issues.push({
      code: "embedded-content",
      severity: "warning",
      message: `The CSS embeds ${formatBytes(details.embeddedBytes)} in ${plural(details.embeddedCount, "data: URL")}, more than 90% of homepages (${formatBytes(EMBEDDED_P90_BYTES)}, The CSS Selection 2026). It downloads and parses with the stylesheet even when it is not shown: serve large images and fonts as files`,
    });
  }
  for (const { from, href } of imports) {
    issues.push({
      code: "import",
      severity: "warning",
      message: `${from} imports ${href} with @import: the browser only requests it after it downloads and parses ${from}. Link it from the HTML, or bundle it`,
      target: href,
    });
  }
  if (details.emptyRuleCount > 0) {
    issues.push({
      code: "empty-rules",
      severity: "info",
      message: `${plural(details.emptyRuleCount, "empty rule")}, with no declarations: bytes to download and selectors to match that style nothing`,
    });
  }
  if (details.selectorCount > 0 && details.selectorUniqueness < MIN_SELECTOR_UNIQUENESS) {
    const repeated = [...selectorCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    issues.push({
      code: "duplicate-selectors",
      severity: "info",
      message: `Only ${Math.round(details.selectorUniqueness * 100)}% of the ${details.selectorCount} selectors are unique: the same selectors repeat across rules, which adds CSS to download and match. Some repeat inside @media on purpose; merge the others. Most repeated: ${repeated.slice(0, 3).map(([sel, n]) => `${sel} (${n})`).join(", ")}`,
    });
  }
  if (details.importantPercent > IMPORTANT_P90_PERCENT) {
    issues.push({
      code: "important-ratio",
      severity: "info",
      message: `${details.importantPercent}% of the declarations use !important, more than on 90% of homepages (${IMPORTANT_P90_PERCENT}%, The CSS Selection 2026): a sign of overrides on overrides, which make the CSS grow`,
    });
  }
  if (fontFaceCount > FONT_FACE_P90) {
    issues.push({
      code: "font-face-count",
      severity: "info",
      message: `${fontFaceCount} @font-face rules, more than on 90% of homepages (${FONT_FACE_P90}, The CSS Selection 2026). Run Webfont-Usage-Analyzer to see which faces load and which are never used`,
    });
  }
  // A stylesheet that could not be read could use them
  if (unreadable.length === 0) {
    for (const name of details.unusedKeyframes) {
      issues.push({
        code: "unused-keyframes",
        severity: "info",
        message: `@keyframes ${name} is defined, and no animation of the stylesheets or of a style attribute uses it: CSS that never runs, unless JavaScript sets it later`,
        target: name,
      });
    }
  }
  if (unreadable.length > 0) {
    issues.push({
      code: "unreadable-stylesheets",
      severity: "info",
      message: `${plural(unreadable.length, "cross-origin stylesheet")} could not be read without CORS, so the counts are a lower bound: ${unreadable.map((s) => s.source).join(", ")}`,
    });
  }

  // --- Items, the heaviest sheets first ----------------------------------------------------------

  const items = perSheet
    .map((s) => (s.read === "unreadable" ? { source: s.source, read: s.read } : { source: s.source, read: s.read, ruleCount: s.ruleCount, embeddedBytes: s.embeddedBytes, importCount: s.importCount, importantCount: s.importantCount }))
    .sort((a, b) => (b.embeddedBytes ?? -1) - (a.embeddedBytes ?? -1) || (b.ruleCount ?? -1) - (a.ruleCount ?? -1));

  // --- Console -----------------------------------------------------------------------------------

  console.group("%c🎨 CSS Complexity", "font-weight: bold; font-size: 14px;");
  console.log(`Stylesheets: ${details.stylesheetCount}${unreadable.length ? ` (${unreadable.length} unreadable)` : ""}`);
  console.log(`Rules: ${details.ruleCount} · Selectors: ${details.selectorCount} · Declarations: ${details.declarationCount}`);
  console.log(`Embedded content: ${formatBytes(details.embeddedBytes)} in ${plural(details.embeddedCount, "data: URL")}`);
  console.log(`@import: ${details.importCount} · Empty rules: ${details.emptyRuleCount}`);
  console.log(`Unique selectors: ${Math.round(details.selectorUniqueness * 100)}% · !important: ${details.importantCount} (${details.importantPercent}%)`);
  console.log(`@font-face: ${fontFaceCount} · @keyframes: ${keyframesCount}${details.unusedKeyframes.length ? ` (unused: ${details.unusedKeyframes.join(", ")})` : ""}`);
  if (items.length > 0) {
    console.table(
      items.map((i) => ({ Source: i.source, Read: i.read, Rules: i.ruleCount ?? "-", Embedded: formatBytes(i.embeddedBytes), "@import": i.importCount ?? "-", "!important": i.importantCount ?? "-" }))
    );
  }
  if (issues.length > 0) issues.forEach((i) => console.log(`[${i.severity}] ${i.message}`));
  else console.log("%c✅ No issues found", "color: #22c55e; font-weight: bold;");
  console.groupEnd();

  return {
    script: SCRIPT,
    status: "ok",
    count: perSheet.length,
    corsLimitedAnalysis: unreadable.length > 0,
    details,
    items: items.slice(0, MAX_ITEMS),
    issues,
  };
})();
