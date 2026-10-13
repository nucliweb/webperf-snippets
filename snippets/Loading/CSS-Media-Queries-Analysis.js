// Analyze CSS @media rules for viewports bigger than a specified breakpoint
// Default minWidth = 768 (px), but you can customize it

async function analyzeCSSMediaQueries(minWidth = 768) {
  // @shared ownRequestUrl
  // The URL a snippet requests when it reads a file of the page itself (fetch, a HEAD request,
  // new Image()). The fragment never reaches the server or the HTTP cache key, so the file still
  // comes from the cache, but it stays in the name of the Resource Timing entry of the request,
  // which is how isOwnRequest leaves these requests out of what the page loaded.
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
  // @end-shared ownRequestUrl

  const SCRIPT = "CSS-Media-Queries-Analysis";
  const MAX_ITEMS = 50;
  const WARNING_BYTES = 50 * 1024;
  const stylesheets = [...document.styleSheets];
  const rules = []; // one per @media rule: { source, inline, mediaQuery, classes, properties, bytes }
  let corsBlockedCount = 0;

  // Helper to check if media query targets bigger than specified breakpoint
  function isBiggerThanBreakpoint(mediaText) {
    if (!mediaText) return false;

    // Check for min-width greater than specified breakpoint
    const minWidthMatch = mediaText.match(/min-width:\s*(\d+)(px|em|rem)/i);
    if (minWidthMatch) {
      const value = parseInt(minWidthMatch[1]);
      const unit = minWidthMatch[2].toLowerCase();

      if (unit === "px" && value > minWidth) return true;
      if (unit === "em" && value > minWidth / 16) return true; // Convert to em
      if (unit === "rem" && value > minWidth / 16) return true; // Convert to rem
    }

    // max-width only queries are for smaller viewports
    return false;
  }

  // Classes and declarations inside the rule, not in its media query. A class starts with a
  // letter, an underscore or a hyphen, so values such as 1.5rem do not count
  function countClassesAndProperties(innerCss) {
    const classMatches = innerCss.match(/\.-?[_a-zA-Z][\w-]*/g) || [];
    const propertyMatches = innerCss.match(/[a-z-]+\s*:/g) || [];
    return { classes: classMatches.length, properties: propertyMatches.length };
  }

  // Helper to calculate byte size
  function getByteSize(text) {
    return new Blob([text]).size;
  }

  // Helper to format bytes
  // @shared formatBytes
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  // @end-shared formatBytes

  function addRule(source, inline, mediaQuery, fullCss, innerCss) {
    if (!isBiggerThanBreakpoint(mediaQuery)) return;
    rules.push({ source, inline, mediaQuery, ...countClassesAndProperties(innerCss), bytes: getByteSize(fullCss) });
  }

  // Parse CSS text to find @media rules, for stylesheets read with fetch
  function parseMediaQueriesFromCSS(cssText, source) {
    const mediaRegex = /@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let match;
    while ((match = mediaRegex.exec(cssText)) !== null) {
      addRule(source, false, match[1].trim(), match[0], match[2]);
    }
  }

  // Process stylesheets
  for (let sheetIndex = 0; sheetIndex < stylesheets.length; sheetIndex++) {
    const sheet = stylesheets[sheetIndex];
    const inline = !sheet.href;
    const source = sheet.href || `<style> tag #${sheetIndex}`;

    try {
      const sheetRules = sheet.cssRules || sheet.rules;
      if (sheetRules) {
        [...sheetRules].forEach((rule) => {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const inner = [...rule.cssRules].map((r) => r.cssText).join("");
            addRule(source, inline, rule.media.mediaText, rule.cssText, inner);
          }
        });
      }
    } catch {
      // Cross-origin stylesheet without CORS: try to fetch it
      if (sheet.href) {
        try {
          const response = await fetch(ownRequestUrl(sheet.href));
          parseMediaQueriesFromCSS(await response.text(), sheet.href);
        } catch {
          corsBlockedCount++;
        }
      }
    }
  }

  // --- One item per distinct query ------------------------------------------------------

  const byQuery = new Map();
  for (const r of rules) {
    const q = byQuery.get(r.mediaQuery) ?? { mediaQuery: r.mediaQuery, rules: 0, sources: new Set(), classes: 0, properties: 0, bytes: 0 };
    q.rules++;
    q.sources.add(r.source);
    q.classes += r.classes;
    q.properties += r.properties;
    q.bytes += r.bytes;
    byQuery.set(r.mediaQuery, q);
  }
  const queries = [...byQuery.values()]
    .map(({ sources, ...q }) => ({
      mediaQuery: q.mediaQuery,
      rules: q.rules,
      files: sources.size,
      classes: q.classes,
      properties: q.properties,
      bytes: q.bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const bySourceMap = new Map();
  for (const r of rules) {
    const s = bySourceMap.get(r.source) ?? { source: r.source, inline: r.inline, rules: 0, bytes: 0 };
    s.rules++;
    s.bytes += r.bytes;
    bySourceMap.set(r.source, s);
  }
  const bySource = [...bySourceMap.values()];

  const totalBytes = rules.reduce((sum, r) => sum + r.bytes, 0);
  const uniquenessRatio = rules.length ? Math.round((queries.length / rules.length) * 1000) / 1000 : 0;

  // --- Issues ----------------------------------------------------------------------------

  const issues = [];
  if (rules.length === 0) {
    issues.push({ severity: "info", message: `No @media rules for viewports wider than ${minWidth}px` });
  } else {
    issues.push({
      severity: totalBytes > WARNING_BYTES ? "warning" : "info",
      message: `${rules.length} @media rules for viewports wider than ${minWidth}px add ${formatBytes(totalBytes)} of CSS that narrower screens download and parse without using. Move them to a stylesheet with a media attribute, such as <link rel="stylesheet" href="wide.css" media="(min-width: ${minWidth + 1}px)">, which narrower screens fetch at low priority without blocking rendering`,
    });
    if (rules.length >= 20 && uniquenessRatio < 0.1) {
      issues.push({
        severity: "info",
        message: `${queries.length} distinct queries repeat across ${rules.length} @media blocks, the pattern of component-scoped or compiled CSS. Grouping the rules of each query under one block shortens the stylesheets`,
      });
    }
  }
  if (corsBlockedCount > 0) {
    issues.push({ severity: "info", message: `${corsBlockedCount} cross-origin stylesheet(s) could not be read, so their @media rules are not counted` });
  }

  // --- Console output --------------------------------------------------------------------

  console.group(`CSS Media Queries Analysis (min-width > ${minWidth}px)`);
  console.log(`@media rules: ${rules.length} | distinct queries: ${queries.length} | size: ${formatBytes(totalBytes)}`);
  if (queries.length > 0) {
    console.table(
      queries.map((q) => ({ Query: q.mediaQuery, Rules: q.rules, Files: q.files, Classes: q.classes, Properties: q.properties, Size: formatBytes(q.bytes) }))
    );
    console.table(bySource.map((s) => ({ Source: s.source, Rules: s.rules, Size: formatBytes(s.bytes) })));
  }
  issues.forEach((i) => console.log(`[${i.severity}] ${i.message}`));
  console.groupEnd();

  return {
    script: SCRIPT,
    status: "ok",
    count: queries.length,
    details: {
      minWidth,
      rules: rules.length,
      totalUnique: queries.length,
      uniquenessRatio,
      classes: rules.reduce((sum, r) => sum + r.classes, 0),
      properties: rules.reduce((sum, r) => sum + r.properties, 0),
      bytes: totalBytes,
      bySource: bySource.slice(0, MAX_ITEMS),
      corsBlockedCount,
    },
    items: queries.slice(0, MAX_ITEMS),
    issues,
  };
}

// Run with default breakpoint (768px)
analyzeCSSMediaQueries();

// Or customize the breakpoint:
// analyzeCSSMediaQueries(1024);  // for desktop
// analyzeCSSMediaQueries(480);   // for small tablets
