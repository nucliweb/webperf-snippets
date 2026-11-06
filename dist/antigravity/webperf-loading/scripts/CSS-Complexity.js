(async () => {
  const SCRIPT = "CSS-Complexity";
  const MAX_ITEMS = 50;
  const EMBEDDED_P90_BYTES = 36632;
  const IMPORTANT_P90_PERCENT = 13;
  const FONT_FACE_P90 = 48;
  const SELECTOR_COMPLEXITY_P90 = 29;
  const MAX_COMPLEX_SELECTORS = 5;
  const MIN_SELECTOR_UNIQUENESS = 0.66;
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  function ownRequestUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/^https?:$/.test(parsed.protocol)) return url;
      parsed.hash = "webperf-snippets";
      return parsed.href;
    } catch {
      return url;
    }
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") i++; else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c; else if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--; else if (c === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map(p => p.trim()).filter(Boolean);
  }
  const declarationsOf = style => splitTopLevel(style.cssText, ";");
  const FONT_TYPES = /^(font\/|application\/(x-)?font-|application\/vnd\.ms-fontobject)/;
  function embeddedOf(cssText, inFontFace) {
    const found = [];
    for (const [, raw] of cssText.matchAll(/url\("((?:[^"\\]|\\.)*)"\)/g)) {
      const url = raw.replace(/\\(["\\])/g, "$1");
      if (!/^data:/i.test(url)) continue;
      const type = url.slice(5).split(/[;,]/)[0].toLowerCase() || "text/plain";
      found.push({
        type: type,
        bytes: url.length,
        font: inFontFace || FONT_TYPES.test(type)
      });
    }
    return found;
  }
  const SELECTOR_FUNCTIONS = new Set([ "is", "where", "not", "has", "matches", "-webkit-any", "-moz-any" ]);
  const total = values => values.reduce((a, b) => a + b, 0);
  const selectorsIn = text => splitTopLevel(text, ",").flatMap(selector => {
    const {complexity: complexity, nested: nested} = analyzeSelector(selector);
    return [ complexity, ...nested ];
  });
  const complexityOf = selectorText => analyzeSelector(selectorText).complexity;
  function analyzeSelector(selectorText) {
    const s = selectorText.trim();
    let complexity = 0;
    const nested = [];
    let i = 0;
    let afterCombinator = false;
    const readIdent = () => {
      const start = i;
      while (i < s.length) if (s[i] === "\\") i += 2; else if (/[\w-]/.test(s[i]) || s.charCodeAt(i) > 127) i++; else break;
      return s.slice(start, i);
    };
    const readGroup = (open, close) => {
      const start = i + 1;
      let depth = 0;
      let quote = null;
      for (;i < s.length; i++) {
        const c = s[i];
        if (quote) {
          if (c === "\\") i++; else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c; else if (c === open) depth++; else if (c === close && --depth === 0) return s.slice(start, i++);
      }
      return s.slice(start);
    };
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (i < s.length && !">+~".includes(s[i]) && complexity > 0 && !afterCombinator) {
          complexity++;
          afterCombinator = true;
        }
        continue;
      }
      if (">+~".includes(c)) {
        complexity++;
        i++;
        afterCombinator = true;
        continue;
      }
      afterCombinator = false;
      if (c === "*" || c === "&") {
        complexity++;
        i++;
      } else if (c === "#" || c === ".") {
        i++;
        readIdent();
        complexity++;
      } else if (c === "[") {
        const inner = readGroup("[", "]");
        complexity += /=/.test(inner) ? 2 : 1;
      } else if (c === ":") {
        i += s[i + 1] === ":" ? 2 : 1;
        const name = readIdent().toLowerCase();
        complexity += name.startsWith("-") ? 2 : 1;
        if (s[i] === "(") {
          const arg = readGroup("(", ")").trim();
          const of = name === "nth-child" || name === "nth-last-child" ? arg.match(/\sof\s([\s\S]+)$/i) : null;
          if (SELECTOR_FUNCTIONS.has(name) || of) {
            const found = selectorsIn(of ? of[1] : arg);
            complexity += total(found);
            nested.push(...found);
          } else if (name === "nth-child" || name === "nth-last-child" || name === "nth-of-type" || name === "nth-last-of-type" || name === "lang") complexity += arg ? 1 : 0; else {
            const found = selectorsIn(arg);
            const own = splitTopLevel(arg, ",").map(complexityOf);
            complexity += 1 + total(own);
            nested.push(...found);
          }
        }
      } else if (/[\w-\\]/.test(c) || s.charCodeAt(i) > 127) {
        readIdent();
        complexity++;
      } else i++;
    }
    return {
      complexity: complexity,
      nested: nested
    };
  }
  function modeOf(values) {
    const frequencies = new Map;
    for (const v of values) frequencies.set(v, (frequencies.get(v) ?? 0) + 1);
    let top = 0;
    for (const n of frequencies.values()) if (n > top) top = n;
    const tied = [ ...frequencies.entries() ].filter(([, n]) => n === top).map(([v]) => v);
    return tied.length ? tied.reduce((a, b) => a + b, 0) / tied.length : 0;
  }
  const describeHost = el => el.localName + (el.id ? `#${el.id}` : el.classList[0] ? `.${el.classList[0]}` : "");
  const sheets = [];
  const seenSheets = new Set;
  const EXTENSION_URL = /^(chrome|moz|safari-web)-extension:/i;
  let extensionCount = 0;
  const addSheet = (sheet, source) => {
    if (!sheet || seenSheets.has(sheet)) return;
    seenSheets.add(sheet);
    if (sheet.href && EXTENSION_URL.test(sheet.href)) {
      extensionCount++;
      return;
    }
    sheets.push({
      sheet: sheet,
      source: source
    });
  };
  const addUrl = href => {
    if (seenSheets.has(href)) return;
    if (EXTENSION_URL.test(href)) {
      seenSheets.add(href);
      extensionCount++;
      return;
    }
    seenSheets.add(href);
    sheets.push({
      href: href,
      source: href
    });
  };
  async function fetchSheet(href) {
    try {
      const response = await fetch(ownRequestUrl(href));
      if (!response.ok) return null;
      const text = (await response.text()).replace(/\/\*[\s\S]*?\*\//g, "");
      const statements = text.match(/@import\s[^;]*;/gi) ?? [];
      const imports = statements.map(statement => statement.match(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/i)?.[2]).filter(Boolean).map(url => new URL(url, href).href);
      const sheet = new window.CSSStyleSheet({
        baseURL: href
      });
      sheet.replaceSync(statements.reduce((css, statement) => css.replace(statement, ""), text));
      return {
        rules: sheet.cssRules,
        imports: imports
      };
    } catch {
      return null;
    }
  }
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
  const imports = [];
  const embeddedTypes = new Map;
  const selectorCounts = new Map;
  const complexities = [];
  const complexityBySelector = new Map;
  const keyframesDefined = new Set;
  const animationsUsed = new Set;
  let keyframesCount = 0;
  let fontFaceCount = 0;
  const noteAnimations = style => {
    for (const name of (style?.animationName ?? "").split(",")) {
      const n = name.trim();
      if (n && n !== "none") animationsUsed.add(n);
    }
  };
  function noteDeclarations(style, stats) {
    const declarations = declarationsOf(style);
    stats.declarationCount += declarations.length;
    stats.importantCount += declarations.filter(d => /!\s*important$/i.test(d)).length;
    noteAnimations(style);
    return declarations;
  }
  function walk(rules, stats, sheetUrl) {
    for (const rule of rules) if (rule instanceof window.CSSImportRule) {
      stats.importCount++;
      let href = rule.href;
      try {
        href = new URL(rule.href, sheetUrl).href;
      } catch {}
      imports.push({
        from: stats.source,
        href: href
      });
      addSheet(rule.styleSheet, href);
    } else if (rule instanceof window.CSSStyleRule) {
      const declarations = noteDeclarations(rule.style, stats);
      const nested = rule.cssRules?.length ?? 0;
      const selectors = splitTopLevel(rule.selectorText, ",");
      stats.ruleCount++;
      stats.selectorCount += selectors.length;
      for (const selector of selectors) {
        selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1);
        const complexity = complexityBySelector.get(selector) ?? complexityOf(selector);
        complexityBySelector.set(selector, complexity);
        complexities.push(complexity);
      }
      if (declarations.length === 0 && nested === 0) stats.emptyRuleCount++;
      count(embeddedOf(rule.style.cssText, false), stats);
      if (nested) walk(rule.cssRules, stats, sheetUrl);
    } else if (window.CSSNestedDeclarations && rule instanceof window.CSSNestedDeclarations) {
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
    } else if (rule.cssRules) walk(rule.cssRules, stats, sheetUrl);
  }
  function count(embedded, stats) {
    for (const {type: type, bytes: bytes, font: font} of embedded) {
      stats.embeddedBytes += bytes;
      stats.embeddedCount++;
      if (font) {
        stats.fontCount++;
        stats.fontBytes += bytes;
      }
      const t = embeddedTypes.get(type) ?? {
        type: type,
        count: 0,
        bytes: 0
      };
      t.count++;
      t.bytes += bytes;
      embeddedTypes.set(type, t);
    }
  }
  const perSheet = [];
  for (let i = 0; i < sheets.length; i++) {
    const {sheet: sheet, href: href, source: source} = sheets[i];
    let rules = null;
    let read = "cssom";
    let fetchedImports = [];
    try {
      rules = sheet?.cssRules ?? null;
    } catch {}
    const url = href ?? sheet?.href;
    if (!rules && url) {
      const fetched = await fetchSheet(url);
      if (fetched) {
        rules = fetched.rules;
        fetchedImports = fetched.imports;
        read = "fetched";
      }
    }
    if (!rules) {
      perSheet.push({
        source: source,
        read: "unreadable"
      });
      continue;
    }
    const stats = {
      source: source,
      read: read,
      ruleCount: 0,
      selectorCount: 0,
      declarationCount: 0,
      importantCount: 0,
      emptyRuleCount: 0,
      embeddedBytes: 0,
      embeddedCount: 0,
      fontCount: 0,
      fontBytes: 0,
      importCount: 0
    };
    walk(rules, stats, url || location.href);
    for (const imported of fetchedImports) {
      stats.importCount++;
      imports.push({
        from: source,
        href: imported
      });
      addUrl(imported);
    }
    perSheet.push(stats);
  }
  const roots = [ document, ...[ ...document.querySelectorAll("*") ].map(el => el.shadowRoot).filter(Boolean) ];
  for (const root of roots) for (const el of root.querySelectorAll("[style]")) noteAnimations(el.style);
  const read = perSheet.filter(s => s.read !== "unreadable");
  const unreadable = perSheet.filter(s => s.read === "unreadable");
  const sum = key => read.reduce((total, s) => total + s[key], 0);
  const selectorUniqueness = () => {
    const total = [ ...selectorCounts.values() ].reduce((a, b) => a + b, 0);
    return total ? Math.round(selectorCounts.size / total * 1000) / 1000 : 1;
  };
  const details = {
    stylesheetCount: perSheet.length,
    extensionCount: extensionCount,
    unreadableCount: unreadable.length,
    fetchedCount: perSheet.filter(s => s.read === "fetched").length,
    ruleCount: sum("ruleCount"),
    selectorCount: sum("selectorCount"),
    declarationCount: sum("declarationCount"),
    embeddedBytes: sum("embeddedBytes"),
    embeddedCount: sum("embeddedCount"),
    embeddedTypes: [ ...embeddedTypes.values() ].sort((a, b) => b.bytes - a.bytes || a.type.localeCompare(b.type)),
    importCount: sum("importCount"),
    emptyRuleCount: sum("emptyRuleCount"),
    selectorUniqueness: selectorUniqueness(),
    importantCount: sum("importantCount"),
    importantPercent: 0,
    fontFaceCount: fontFaceCount,
    keyframesCount: keyframesCount,
    unusedKeyframes: [ ...keyframesDefined ].filter(name => !animationsUsed.has(name)).sort(),
    maxSelectorComplexity: complexities.reduce((max, c) => c > max ? c : max, 0),
    commonSelectorComplexity: modeOf(complexities),
    complexSelectors: [ ...complexityBySelector.entries() ].map(([selectorText, complexity]) => ({
      selectorText: selectorText,
      complexity: complexity
    })).sort((a, b) => b.complexity - a.complexity).slice(0, MAX_COMPLEX_SELECTORS)
  };
  details.importantPercent = details.declarationCount ? Math.round(details.importantCount / details.declarationCount * 1000) / 10 : 0;
  const issues = [];
  for (const s of read.filter(s => s.fontCount > 0)) issues.push({
    code: "embedded-font",
    severity: "warning",
    message: `${s.source} embeds ${plural(s.fontCount, "font file")} as ${s.fontCount === 1 ? "a data: URL" : "data: URLs"} (${formatBytes(s.fontBytes)}). An embedded font downloads with the stylesheet, blocks rendering with it and cannot be cached apart from it: serve fonts as WOFF2 files, with font-display`,
    target: s.source
  });
  if (details.embeddedBytes > EMBEDDED_P90_BYTES) issues.push({
    code: "embedded-content",
    severity: "warning",
    message: `The CSS embeds ${formatBytes(details.embeddedBytes)} in ${plural(details.embeddedCount, "data: URL")}, more than 90% of homepages (${formatBytes(EMBEDDED_P90_BYTES)}, The CSS Selection 2026). It downloads and parses with the stylesheet even when it is not shown: serve large images and fonts as files`
  });
  for (const {from: from, href: href} of imports) issues.push({
    code: "import",
    severity: "warning",
    message: `${from} imports ${href} with @import: the browser only requests it after it downloads and parses ${from}. Link it from the HTML, or bundle it`,
    target: href
  });
  if (details.emptyRuleCount > 0) issues.push({
    code: "empty-rules",
    severity: "info",
    message: `${plural(details.emptyRuleCount, "empty rule")}, with no declarations: bytes to download and selectors to match that style nothing`
  });
  if (details.selectorCount > 0 && details.selectorUniqueness < MIN_SELECTOR_UNIQUENESS) {
    const repeated = [ ...selectorCounts.entries() ].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    issues.push({
      code: "duplicate-selectors",
      severity: "info",
      message: `Only ${Math.round(details.selectorUniqueness * 100)}% of the ${details.selectorCount} selectors are unique: the same selectors repeat across rules, which adds CSS to download and match. Some repeat inside @media on purpose; merge the others. Most repeated: ${repeated.slice(0, 3).map(([sel, n]) => `${sel} (${n})`).join(", ")}`
    });
  }
  if (details.importantPercent > IMPORTANT_P90_PERCENT) issues.push({
    code: "important-ratio",
    severity: "info",
    message: `${details.importantPercent}% of the declarations use !important, more than on 90% of homepages (${IMPORTANT_P90_PERCENT}%, The CSS Selection 2026): a sign of overrides on overrides, which make the CSS grow`
  });
  if (fontFaceCount > FONT_FACE_P90) issues.push({
    code: "font-face-count",
    severity: "info",
    message: `${fontFaceCount} @font-face rules, more than on 90% of homepages (${FONT_FACE_P90}, The CSS Selection 2026). Run Webfont-Usage-Analyzer to see which faces load and which are never used`
  });
  for (const {selectorText: selectorText, complexity: complexity} of details.complexSelectors.filter(c => c.complexity > SELECTOR_COMPLEXITY_P90)) issues.push({
    code: "selector-complexity",
    severity: "info",
    message: `${selectorText} has a complexity of ${complexity}, more than the most complex selector of 90% of homepages (${SELECTOR_COMPLEXITY_P90}, The CSS Selection 2026). Complexity counts the parts of a selector, not its cost: the CSS selector costs insight of the DevTools Performance panel measures how long matching takes`,
    target: selectorText
  });
  if (unreadable.length === 0) for (const name of details.unusedKeyframes) issues.push({
    code: "unused-keyframes",
    severity: "info",
    message: `@keyframes ${name} is defined, and no animation of the stylesheets or of a style attribute uses it: CSS that never runs, unless JavaScript sets it later`,
    target: name
  });
  if (unreadable.length > 0) issues.push({
    code: "unreadable-stylesheets",
    severity: "info",
    message: `${plural(unreadable.length, "cross-origin stylesheet")} could not be read, by the page or with fetch (no Access-Control-Allow-Origin), so the counts are a lower bound: ${unreadable.map(s => s.source).join(", ")}`
  });
  const items = perSheet.map(s => s.read === "unreadable" ? {
    source: s.source,
    read: s.read
  } : {
    source: s.source,
    read: s.read,
    ruleCount: s.ruleCount,
    embeddedBytes: s.embeddedBytes,
    importCount: s.importCount,
    importantCount: s.importantCount
  }).sort((a, b) => (b.embeddedBytes ?? -1) - (a.embeddedBytes ?? -1) || (b.ruleCount ?? -1) - (a.ruleCount ?? -1));
  [ details.fetchedCount && `${details.fetchedCount} read with fetch`, unreadable.length && `${unreadable.length} unreadable` ].filter(Boolean);
  if (items.length > 0) void 0;
  if (issues.length > 0) issues.forEach(i => {}); else void 0;
  return {
    script: SCRIPT,
    status: "ok",
    count: perSheet.length,
    corsLimitedAnalysis: unreadable.length > 0,
    details: details,
    items: items.slice(0, MAX_ITEMS),
    issues: issues
  };
})();
