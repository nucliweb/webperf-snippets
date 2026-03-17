async function analyzeCSSMediaQueries(minWidth = 768) {
  const stylesheets = [ ...document.styleSheets ];
  const inlineMediaQueries = [];
  const fileMediaQueries = [];
  let inlineTotalClasses = 0;
  let inlineTotalProperties = 0;
  let filesTotalClasses = 0;
  let filesTotalProperties = 0;
  let inlineTotalBytes = 0;
  let filesTotalBytes = 0;
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
    const maxWidthMatch = mediaText.match(/max-width:\s*(\d+)(px|em|rem)/i);
    if (maxWidthMatch && !minWidthMatch) return false;
    return false;
  }
  function countClassesAndProperties(cssText) {
    const classMatches = cssText.match(/\.[a-zA-Z0-9_-]+/g) || [];
    const propertyMatches = cssText.match(/[a-z-]+\s*:/g) || [];
    return {
      classes: classMatches.length,
      properties: propertyMatches.length
    };
  }
  function getByteSize(text) {
    return new Blob([ text ]).size;
  }
  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = [ "Bytes", "KB", "MB" ];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
  function parseMediaQueriesFromCSS(cssText, source, isInline) {
    const mediaRegex = /@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let match;
    while ((match = mediaRegex.exec(cssText)) !== null) {
      const mediaText = match[1].trim();
      const mediaContent = match[2];
      if (isBiggerThanBreakpoint(mediaText)) {
        const counts = countClassesAndProperties(mediaContent);
        const byteSize = getByteSize(match[0]);
        const mediaQueryData = {
          source: source,
          mediaQuery: mediaText,
          classes: counts.classes,
          properties: counts.properties,
          bytes: byteSize,
          bytesFormatted: formatBytes(byteSize)
        };
        if (isInline) {
          inlineMediaQueries.push(mediaQueryData);
          inlineTotalClasses += counts.classes;
          inlineTotalProperties += counts.properties;
          inlineTotalBytes += byteSize;
        } else {
          fileMediaQueries.push(mediaQueryData);
          filesTotalClasses += counts.classes;
          filesTotalProperties += counts.properties;
          filesTotalBytes += byteSize;
        }
      }
    }
  }
  for (let sheetIndex = 0; sheetIndex < stylesheets.length; sheetIndex++) {
    const sheet = stylesheets[sheetIndex];
    const isInline = !sheet.href;
    const source = sheet.href || `<style> tag #${sheetIndex}`;
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (rules) [ ...rules ].forEach(rule => {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const mediaText = rule.media.mediaText;
          if (isBiggerThanBreakpoint(mediaText)) {
            const cssText = rule.cssText;
            const counts = countClassesAndProperties(cssText);
            const byteSize = getByteSize(cssText);
            const mediaQueryData = {
              source: source,
              mediaQuery: mediaText,
              classes: counts.classes,
              properties: counts.properties,
              bytes: byteSize,
              bytesFormatted: formatBytes(byteSize)
            };
            if (isInline) {
              inlineMediaQueries.push(mediaQueryData);
              inlineTotalClasses += counts.classes;
              inlineTotalProperties += counts.properties;
              inlineTotalBytes += byteSize;
            } else {
              fileMediaQueries.push(mediaQueryData);
              filesTotalClasses += counts.classes;
              filesTotalProperties += counts.properties;
              filesTotalBytes += byteSize;
            }
          }
        }
      });
    } catch (e) {
      if (sheet.href) try {
        const response = await fetch(sheet.href);
        const cssText = await response.text();
        parseMediaQueriesFromCSS(cssText, sheet.href, false);
      } catch (fetchError) {
        corsBlockedCount++;
      }
    }
  }
  const totalBytes = inlineTotalBytes + filesTotalBytes;
  if (inlineMediaQueries.length === 0) void 0;
  if (fileMediaQueries.length === 0) void 0;
  if (corsBlockedCount > 0) {
  }
  return {
    summary: {
      total: {
        mediaQueries: inlineMediaQueries.length + fileMediaQueries.length,
        classes: inlineTotalClasses + filesTotalClasses,
        properties: inlineTotalProperties + filesTotalProperties,
        bytes: totalBytes,
        bytesFormatted: formatBytes(totalBytes)
      },
      inline: {
        mediaQueries: inlineMediaQueries.length,
        classes: inlineTotalClasses,
        properties: inlineTotalProperties,
        bytes: inlineTotalBytes,
        bytesFormatted: formatBytes(inlineTotalBytes)
      },
      files: {
        mediaQueries: fileMediaQueries.length,
        classes: filesTotalClasses,
        properties: filesTotalProperties,
        bytes: filesTotalBytes,
        bytesFormatted: formatBytes(filesTotalBytes)
      },
      corsBlocked: corsBlockedCount
    },
    details: {
      inline: inlineMediaQueries,
      files: fileMediaQueries
    }
  };
}

async function analyzeCSSPerformanceImpact(minWidth = 768) {
  const mediaQueryResults = await analyzeCSSMediaQueries(minWidth);
  const unnecessaryBytes = mediaQueryResults.summary.total.bytes;
  if (unnecessaryBytes === 0 && mediaQueryResults.summary.corsBlocked > 0) {
    return null;
  }
  if (unnecessaryBytes === 0) {
    return null;
  }
  const deviceProfiles = {
    "High-end (Pixel 7, iPhone 14)": {
      cssParsingSpeed: 1.5,
      cssSelectorMatchingMultiplier: 1,
      networkSpeed: 10,
      description: "Top 25% devices"
    },
    "Mid-range (Moto G Power, iPhone SE)": {
      cssParsingSpeed: 0.8,
      cssSelectorMatchingMultiplier: 1.8,
      networkSpeed: 5,
      description: "Median mobile device"
    },
    "Low-end (Moto E, older devices)": {
      cssParsingSpeed: 0.3,
      cssSelectorMatchingMultiplier: 3.5,
      networkSpeed: 2,
      description: "Bottom 25% devices"
    }
  };
  const totalClasses = mediaQueryResults.summary.total.classes;
  const totalProperties = mediaQueryResults.summary.total.properties;
  Object.entries(deviceProfiles).forEach(([deviceName, profile]) => {
    const downloadTimeMs = unnecessaryBytes * 8 / (profile.networkSpeed * 1000);
    const parsingTimeMs = unnecessaryBytes / (1024 * 1024) / profile.cssParsingSpeed * 1000;
    const cssomConstructionMs = totalProperties * 0.01 * profile.cssSelectorMatchingMultiplier;
    profile.cssSelectorMatchingMultiplier;
    profile.cssSelectorMatchingMultiplier;
    const totalBlockingTime = downloadTimeMs + parsingTimeMs + cssomConstructionMs;
    Math.max(0, totalBlockingTime - 50);
  });
  const midRangeProfile = deviceProfiles["Mid-range (Moto G Power, iPhone SE)"];
  const midRangeDownload = unnecessaryBytes * 8 / (midRangeProfile.networkSpeed * 1000);
  const midRangeParsing = unnecessaryBytes / (1024 * 1024) / midRangeProfile.cssParsingSpeed * 1000;
  const midRangeCSSOM = totalProperties * 0.01 * midRangeProfile.cssSelectorMatchingMultiplier;
  const midRangeTotalBlocking = midRangeDownload + midRangeParsing + midRangeCSSOM;
  mediaQueryResults.summary.total.mediaQueries;
  if (mediaQueryResults.summary.corsBlocked > 0) {
  }
  return {
    unnecessaryBytes: unnecessaryBytes,
    unnecessaryCss: mediaQueryResults.summary.total.bytesFormatted,
    totalClasses: totalClasses,
    totalProperties: totalProperties,
    corsBlockedCount: mediaQueryResults.summary.corsBlocked,
    deviceImpact: Object.entries(deviceProfiles).reduce((acc, [name, profile]) => {
      const download = unnecessaryBytes * 8 / (profile.networkSpeed * 1000);
      const parsing = unnecessaryBytes / (1024 * 1024) / profile.cssParsingSpeed * 1000;
      const cssom = totalProperties * 0.01 * profile.cssSelectorMatchingMultiplier;
      const totalBlocking = download + parsing + cssom;
      const runtime = (totalClasses * 0.005 + totalProperties * 0.002) * profile.cssSelectorMatchingMultiplier;
      acc[name] = {
        renderBlockingTimeMs: totalBlocking,
        runtimeOverheadMs: runtime,
        fcpImpactMs: totalBlocking * 0.6,
        lcpImpactMs: totalBlocking * 0.4,
        inpOverheadMs: runtime
      };
      return acc;
    }, {}),
    estimatedConversionLift: (midRangeTotalBlocking * 0.6 / 100).toFixed(2) + "%"
  };
}

(async () => {
  const result = await analyzeCSSMediaQueries();
  if (!result) return {
    script: "CSS-Media-Queries-Analysis",
    status: "error",
    error: "No analyzable CSS found (CORS blocked or no desktop media queries)"
  };
  return {
    script: "CSS-Media-Queries-Analysis",
    status: "ok",
    count: result.summary.total.mediaQueries,
    details: {
      total: result.summary.total,
      inline: result.summary.inline,
      files: result.summary.files,
      corsBlockedCount: result.summary.corsBlocked
    },
    items: [ ...result.details.inline, ...result.details.files ]
  };
})();
