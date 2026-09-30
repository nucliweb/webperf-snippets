(() => {
  function getFontName(url) {
    try {
      const path = new URL(url).pathname;
      return path.split("/").pop() || path;
    } catch {
      return url;
    }
  }
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const secondLevelSuffixes = [ "ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch" ];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  function isFirstParty(hostname) {
    return getRootDomain(hostname) === getRootDomain(location.hostname);
  }
  function isThirdParty(url) {
    try {
      return !isFirstParty(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  function normalizeFontFamily(family) {
    return family.split(",")[0].trim().replace(/["']/g, "").toLowerCase();
  }
  const preloadedFonts = Array.from(document.querySelectorAll('link[rel="preload"][as="font"]')).map(link => ({
    href: link.href,
    name: getFontName(link.href),
    crossorigin: link.crossOrigin,
    type: link.type || "unknown",
    thirdParty: isThirdParty(link.href)
  }));
  const loadedFonts = Array.from(document.fonts.values()).filter(font => font.status === "loaded").map(font => ({
    family: font.family.replace(/["']/g, ""),
    weight: font.weight,
    style: font.style,
    display: font.display || "unknown",
    key: `${font.family.replace(/["']/g, "")}-${font.weight}-${font.style}`
  }));
  const uniqueLoadedFonts = Array.from(new Map(loadedFonts.map(f => [ f.key, f ])).values());
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const aboveFoldElements = Array.from(document.querySelectorAll("body *:not(script):not(style):not(link):not(source)")).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
  });
  const usedFontsMap = new Map;
  aboveFoldElements.forEach(el => {
    const style = getComputedStyle(el);
    const family = style.fontFamily;
    const weight = style.fontWeight;
    const fontStyle = style.fontStyle;
    const key = `${family}-${weight}-${fontStyle}`;
    if (!usedFontsMap.has(key)) usedFontsMap.set(key, {
      family: family.split(",")[0].trim().replace(/["']/g, ""),
      fullFamily: family,
      weight: weight,
      style: fontStyle,
      elements: 1
    }); else usedFontsMap.get(key).elements++;
  });
  const usedFonts = Array.from(usedFontsMap.values());
  const preloadedNames = preloadedFonts.map(f => normalizeFontFamily(f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, "")));
  const usedFamilies = usedFonts.map(f => normalizeFontFamily(f.family));
  const preloadedNotUsed = preloadedFonts.filter(f => {
    const name = normalizeFontFamily(f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, ""));
    return !usedFamilies.some(used => used.includes(name) || name.includes(used));
  });
  const usedNotPreloaded = usedFonts.filter(f => {
    const family = normalizeFontFamily(f.family);
    const systemFonts = [ "arial", "helvetica", "times", "georgia", "verdana", "system-ui", "-apple-system", "segoe ui", "roboto", "sans-serif", "serif", "monospace" ];
    if (systemFonts.some(sf => family.includes(sf))) return false;
    return !preloadedNames.some(preloaded => preloaded.includes(family) || family.includes(preloaded));
  });
  if (preloadedFonts.length === 0) void 0; else {
    preloadedFonts.map(f => ({
      Font: f.name,
      Type: f.type,
      "Third-Party": f.thirdParty ? "Yes" : "No",
      Crossorigin: f.crossorigin || "missing ⚠️"
    }));
    const missingCrossorigin = preloadedFonts.filter(f => !f.crossorigin);
    if (missingCrossorigin.length > 0) void 0;
  }
  if (uniqueLoadedFonts.length === 0) void 0; else {
    uniqueLoadedFonts.map(f => ({
      Family: f.family,
      Weight: f.weight,
      Style: f.style,
      Display: f.display
    }));
    const autoDisplay = uniqueLoadedFonts.filter(f => f.display === "auto" || f.display === "unknown");
    if (autoDisplay.length > 0) void 0;
  }
  if (usedFonts.length === 0) void 0; else {
    usedFonts.sort((a, b) => b.elements - a.elements).map(f => ({
      Family: f.family,
      Weight: f.weight,
      Style: f.style,
      "Elements Using": f.elements
    }));
  }
  const hasIssues = preloadedNotUsed.length > 0 || usedNotPreloaded.length > 0;
  if (hasIssues) {
    if (preloadedNotUsed.length > 0) {
      preloadedNotUsed.forEach(f => {
      });
    }
    if (usedNotPreloaded.length > 0) {
      usedNotPreloaded.forEach(f => {
      });
    }
  } else if (preloadedFonts.length > 0 && usedFonts.length > 0) {
  }
  return {
    script: "Fonts-Preloaded-Loaded-and-used-above-the-fold",
    status: "ok",
    count: uniqueLoadedFonts.length,
    details: {
      preloadedCount: preloadedFonts.length,
      loadedCount: uniqueLoadedFonts.length,
      usedAboveFoldCount: usedFonts.length,
      preloadedNotUsedCount: preloadedNotUsed.length,
      usedNotPreloadedCount: usedNotPreloaded.length,
      preloadedFonts: preloadedFonts.slice(0, 20).map(f => ({
        family: f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, ""),
        href: f.href,
        fontType: f.type,
        crossorigin: f.crossorigin || "",
        thirdParty: f.thirdParty
      }))
    },
    items: uniqueLoadedFonts.slice(0, 50).map(f => ({
      family: f.family,
      weight: f.weight,
      style: f.style,
      display: f.display
    })),
    usedFonts: usedFonts.slice(0, 50).map(f => ({
      family: f.family,
      weight: f.weight,
      style: f.style,
      elements: f.elements
    })),
    issues: [ ...preloadedNotUsed.map(f => ({
      severity: "warning",
      message: `Preloaded but not used above fold: ${f.name}`
    })), ...usedNotPreloaded.map(f => ({
      severity: "warning",
      message: `Used above fold but not preloaded: ${f.family} (${f.weight})`
    })), ...preloadedFonts.filter(f => !f.crossorigin).map(f => ({
      severity: "error",
      message: `Font preloaded without crossorigin (double fetch): ${f.name}`
    })) ]
  };
})();
