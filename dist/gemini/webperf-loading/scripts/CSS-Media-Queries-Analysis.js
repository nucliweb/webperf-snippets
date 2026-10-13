async function analyzeCSSMediaQueries(minWidth = 768) {
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
  const SCRIPT = "CSS-Media-Queries-Analysis";
  const MAX_ITEMS = 50;
  const WARNING_BYTES = 50 * 1024;
  const stylesheets = [ ...document.styleSheets ];
  const rules = [];
  let corsBlockedCount = 0;
  function isBiggerThanBreakpoint(mediaText) {
    if (!mediaText) return false;
    const minWidthMatch = mediaText.match(/min-width:\s*(\d+)(px|em|rem)/i);
    if (minWidthMatch) {
      const value = parseInt(minWidthMatch[1]);
      const unit = minWidthMatch[2].toLowerCase();
      if (unit === "px" && value > minWidth) return true;
      if (unit === "em" && value > minWidth / 16) return true;
      if (unit === "rem" && value > minWidth / 16) return true;
    }
    return false;
  }
  function countClassesAndProperties(innerCss) {
    const classMatches = innerCss.match(/\.-?[_a-zA-Z][\w-]*/g) || [];
    const propertyMatches = innerCss.match(/[a-z-]+\s*:/g) || [];
    return {
      classes: classMatches.length,
      properties: propertyMatches.length
    };
  }
  function getByteSize(text) {
    return new Blob([ text ]).size;
  }
  function formatBytes(bytes) {
    if (bytes === null || bytes === void 0 || Number.isNaN(bytes)) return "-";
    if (bytes === 0) return "0 B";
    const units = [ "B", "KB", "MB", "GB" ];
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  function addRule(source, inline, mediaQuery, fullCss, innerCss) {
    if (!isBiggerThanBreakpoint(mediaQuery)) return;
    rules.push({
      source: source,
      inline: inline,
      mediaQuery: mediaQuery,
      ...countClassesAndProperties(innerCss),
      bytes: getByteSize(fullCss)
    });
  }
  function parseMediaQueriesFromCSS(cssText, source) {
    const mediaRegex = /@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let match;
    while ((match = mediaRegex.exec(cssText)) !== null) addRule(source, false, match[1].trim(), match[0], match[2]);
  }
  for (let sheetIndex = 0; sheetIndex < stylesheets.length; sheetIndex++) {
    const sheet = stylesheets[sheetIndex];
    const inline = !sheet.href;
    const source = sheet.href || `<style> tag #${sheetIndex}`;
    try {
      const sheetRules = sheet.cssRules || sheet.rules;
      if (sheetRules) [ ...sheetRules ].forEach(rule => {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const inner = [ ...rule.cssRules ].map(r => r.cssText).join("");
          addRule(source, inline, rule.media.mediaText, rule.cssText, inner);
        }
      });
    } catch {
      if (sheet.href) try {
        const response = await fetch(ownRequestUrl(sheet.href));
        parseMediaQueriesFromCSS(await response.text(), sheet.href);
      } catch {
        corsBlockedCount++;
      }
    }
  }
  const byQuery = new Map;
  for (const r of rules) {
    const q = byQuery.get(r.mediaQuery) ?? {
      mediaQuery: r.mediaQuery,
      rules: 0,
      sources: new Set,
      classes: 0,
      properties: 0,
      bytes: 0
    };
    q.rules++;
    q.sources.add(r.source);
    q.classes += r.classes;
    q.properties += r.properties;
    q.bytes += r.bytes;
    byQuery.set(r.mediaQuery, q);
  }
  const queries = [ ...byQuery.values() ].map(({sources: sources, ...q}) => ({
    mediaQuery: q.mediaQuery,
    rules: q.rules,
    files: sources.size,
    classes: q.classes,
    properties: q.properties,
    bytes: q.bytes
  })).sort((a, b) => b.bytes - a.bytes);
  const bySourceMap = new Map;
  for (const r of rules) {
    const s = bySourceMap.get(r.source) ?? {
      source: r.source,
      inline: r.inline,
      rules: 0,
      bytes: 0
    };
    s.rules++;
    s.bytes += r.bytes;
    bySourceMap.set(r.source, s);
  }
  const bySource = [ ...bySourceMap.values() ];
  const totalBytes = rules.reduce((sum, r) => sum + r.bytes, 0);
  const uniquenessRatio = rules.length ? Math.round(queries.length / rules.length * 1000) / 1000 : 0;
  const issues = [];
  if (rules.length === 0) issues.push({
    severity: "info",
    message: `No @media rules for viewports wider than ${minWidth}px`
  }); else {
    issues.push({
      severity: totalBytes > WARNING_BYTES ? "warning" : "info",
      message: `${rules.length} @media rules for viewports wider than ${minWidth}px add ${formatBytes(totalBytes)} of CSS that narrower screens download and parse without using. Move them to a stylesheet with a media attribute, such as <link rel="stylesheet" href="wide.css" media="(min-width: ${minWidth + 1}px)">, which narrower screens fetch at low priority without blocking rendering`
    });
    if (rules.length >= 20 && uniquenessRatio < 0.1) issues.push({
      severity: "info",
      message: `${queries.length} distinct queries repeat across ${rules.length} @media blocks, the pattern of component-scoped or compiled CSS. Grouping the rules of each query under one block shortens the stylesheets`
    });
  }
  if (corsBlockedCount > 0) issues.push({
    severity: "info",
    message: `${corsBlockedCount} cross-origin stylesheet(s) could not be read, so their @media rules are not counted`
  });
  if (queries.length > 0) {
  }
  issues.forEach(i => {});
  return {
    script: SCRIPT,
    status: "ok",
    count: queries.length,
    details: {
      minWidth: minWidth,
      rules: rules.length,
      totalUnique: queries.length,
      uniquenessRatio: uniquenessRatio,
      classes: rules.reduce((sum, r) => sum + r.classes, 0),
      properties: rules.reduce((sum, r) => sum + r.properties, 0),
      bytes: totalBytes,
      bySource: bySource.slice(0, MAX_ITEMS),
      corsBlockedCount: corsBlockedCount
    },
    items: queries.slice(0, MAX_ITEMS),
    issues: issues
  };
}

analyzeCSSMediaQueries();
