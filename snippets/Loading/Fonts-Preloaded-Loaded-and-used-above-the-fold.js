// Font Loading Analysis - Preloaded, Loaded, and Used Above The Fold
// https://webperf-snippets.nucliweb.net

(() => {
  // Domains that belong to the site but differ from the page's root domain, such as its own CDN.
  // They count as first party. Example: const OWN_DOMAINS = ["bbci.co.uk", "bbc.co.uk"];
  const OWN_DOMAINS = [];

  // Helper to extract font filename from URL
  function getFontName(url) {
    try {
      const path = new URL(url).pathname;
      return path.split("/").pop() || path;
    } catch {
      return url;
    }
  }

  // @shared getRootDomain
  function getRootDomain(hostname) {
    const host = hostname.replace(/\.$/, "");
    // An IP address has no registrable domain, so each address is its own root
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    // Country-code domains with a second-level suffix: example.co.uk, example.com.au, example.ac.jp
    const secondLevelSuffixes = ["ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch"];
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  // @end-shared getRootDomain

  // @shared isFirstParty
  function isFirstParty(hostname) {
    const root = getRootDomain(hostname);
    if (root === getRootDomain(location.hostname)) return true;
    return OWN_DOMAINS.some((d) => getRootDomain(String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]) === root);
  }
  // @end-shared isFirstParty

  // @shared logOwnDomainsHint
  function logOwnDomainsHint(thirdPartyCount) {
    if (OWN_DOMAINS.length === 0 && thirdPartyCount > 0) {
      console.log(
        '%cℹ️ OWN_DOMAINS is empty. If this site serves its own assets from other domains (for example a CDN), add them at the top of the snippet, such as const OWN_DOMAINS = ["cdn.example.net"];, and run it again so they count as first party.',
        "color: #3b82f6;"
      );
    }
  }
  // @end-shared logOwnDomainsHint

  // Check if URL is third-party (a different root domain)
  function isThirdParty(url) {
    try {
      return !isFirstParty(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  // Normalize font family name for comparison
  function normalizeFontFamily(family) {
    return family
      .split(",")[0]
      .trim()
      .replace(/["']/g, "")
      .toLowerCase();
  }

  // 1. Get preloaded fonts
  const preloadedFonts = Array.from(
    document.querySelectorAll('link[rel="preload"][as="font"]')
  ).map((link) => ({
    href: link.href,
    name: getFontName(link.href),
    crossorigin: link.crossOrigin,
    type: link.type || "unknown",
    thirdParty: isThirdParty(link.href),
  }));

  // 2. Get loaded fonts from document.fonts API
  const loadedFonts = Array.from(document.fonts.values())
    .filter((font) => font.status === "loaded")
    .map((font) => ({
      family: font.family.replace(/["']/g, ""),
      weight: font.weight,
      style: font.style,
      display: font.display || "unknown",
      key: `${font.family.replace(/["']/g, "")}-${font.weight}-${font.style}`,
    }));

  // Deduplicate loaded fonts
  const uniqueLoadedFonts = Array.from(
    new Map(loadedFonts.map((f) => [f.key, f])).values()
  );

  // 3. Get fonts used above the fold
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const aboveFoldElements = Array.from(
    document.querySelectorAll("body *:not(script):not(style):not(link):not(source)")
  ).filter((el) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < viewportHeight &&
      rect.bottom > 0 &&
      rect.left < viewportWidth &&
      rect.right > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  });

  const usedFontsMap = new Map();
  aboveFoldElements.forEach((el) => {
    const style = getComputedStyle(el);
    const family = style.fontFamily;
    const weight = style.fontWeight;
    const fontStyle = style.fontStyle;
    const key = `${family}-${weight}-${fontStyle}`;

    if (!usedFontsMap.has(key)) {
      usedFontsMap.set(key, {
        family: family.split(",")[0].trim().replace(/["']/g, ""),
        fullFamily: family,
        weight,
        style: fontStyle,
        elements: 1,
      });
    } else {
      usedFontsMap.get(key).elements++;
    }
  });

  const usedFonts = Array.from(usedFontsMap.values());

  // 4. Analysis - find mismatches
  const preloadedNames = preloadedFonts.map((f) =>
    normalizeFontFamily(f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, ""))
  );

  const usedFamilies = usedFonts.map((f) => normalizeFontFamily(f.family));

  // Fonts preloaded but not used above the fold
  const preloadedNotUsed = preloadedFonts.filter((f) => {
    const name = normalizeFontFamily(
      f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, "")
    );
    return !usedFamilies.some(
      (used) => used.includes(name) || name.includes(used)
    );
  });

  // Fonts used but not preloaded (potential optimization)
  const usedNotPreloaded = usedFonts.filter((f) => {
    const family = normalizeFontFamily(f.family);
    // Exclude system fonts
    const systemFonts = [
      "arial",
      "helvetica",
      "times",
      "georgia",
      "verdana",
      "system-ui",
      "-apple-system",
      "segoe ui",
      "roboto",
      "sans-serif",
      "serif",
      "monospace",
    ];
    if (systemFonts.some((sf) => family.includes(sf))) return false;
    return !preloadedNames.some(
      (preloaded) => preloaded.includes(family) || family.includes(preloaded)
    );
  });

  // Display results
  console.group("%c🔤 Font Loading Analysis", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary:", "font-weight: bold;");
  console.log(`   Preloaded fonts: ${preloadedFonts.length}`);
  console.log(`   Loaded fonts: ${uniqueLoadedFonts.length}`);
  console.log(`   Used above the fold: ${usedFonts.length}`);

  // Preloaded fonts
  console.log("");
  console.group(
    `%c⬇️ Preloaded Fonts (${preloadedFonts.length})`,
    "color: #8b5cf6; font-weight: bold;"
  );

  if (preloadedFonts.length === 0) {
    console.log("No fonts preloaded via <link rel='preload'>.");
  } else {
    const preloadTable = preloadedFonts.map((f) => ({
      Font: f.name,
      Type: f.type,
      "Third-Party": f.thirdParty ? "Yes" : "No",
      Crossorigin: f.crossorigin || "missing ⚠️",
    }));
    console.table(preloadTable);

    // Check for missing crossorigin
    const missingCrossorigin = preloadedFonts.filter((f) => !f.crossorigin);
    if (missingCrossorigin.length > 0) {
      console.log(
        "%c⚠️ Fonts preloaded without crossorigin attribute will be fetched twice!",
        "color: #f59e0b;"
      );
    }
  }
  console.groupEnd();

  // Loaded fonts
  console.log("");
  console.group(
    `%c📦 Loaded Fonts (${uniqueLoadedFonts.length})`,
    "color: #3b82f6; font-weight: bold;"
  );

  if (uniqueLoadedFonts.length === 0) {
    console.log("No web fonts loaded (using system fonts only).");
  } else {
    const loadedTable = uniqueLoadedFonts.map((f) => ({
      Family: f.family,
      Weight: f.weight,
      Style: f.style,
      Display: f.display,
    }));
    console.table(loadedTable);

    // Check font-display
    const autoDisplay = uniqueLoadedFonts.filter(
      (f) => f.display === "auto" || f.display === "unknown"
    );
    if (autoDisplay.length > 0) {
      console.log(
        `%c💡 ${autoDisplay.length} font(s) using default font-display. Consider using 'swap' or 'optional'.`,
        "color: #f59e0b;"
      );
    }
  }
  console.groupEnd();

  // Used above the fold
  console.log("");
  console.group(
    `%c👁️ Fonts Used Above The Fold (${usedFonts.length})`,
    "color: #22c55e; font-weight: bold;"
  );

  if (usedFonts.length === 0) {
    console.log("No text elements found above the fold.");
  } else {
    const usedTable = usedFonts
      .sort((a, b) => b.elements - a.elements)
      .map((f) => ({
        Family: f.family,
        Weight: f.weight,
        Style: f.style,
        "Elements Using": f.elements,
      }));
    console.table(usedTable);
  }
  console.groupEnd();

  // Issues and recommendations
  const hasIssues = preloadedNotUsed.length > 0 || usedNotPreloaded.length > 0;

  if (hasIssues) {
    console.log("");
    console.group("%c⚠️ Potential Issues", "color: #ef4444; font-weight: bold;");

    if (preloadedNotUsed.length > 0) {
      console.log("");
      console.log(
        `%c🗑️ Preloaded but NOT used above the fold (${preloadedNotUsed.length}):`,
        "font-weight: bold;"
      );
      console.log("   These preloads may be wasting bandwidth:");
      preloadedNotUsed.forEach((f) => {
        console.log(`   • ${f.name}`);
      });
      console.log("");
      console.log("   Consider:");
      console.log("   • Removing the preload if font is only used below the fold");
      console.log("   • The font may be for a different viewport/breakpoint");
    }

    if (usedNotPreloaded.length > 0) {
      console.log("");
      console.log(
        `%c🚀 Used above the fold but NOT preloaded (${usedNotPreloaded.length}):`,
        "font-weight: bold;"
      );
      console.log("   These fonts could benefit from preloading:");
      usedNotPreloaded.forEach((f) => {
        console.log(`   • ${f.family} (${f.weight})`);
      });
      console.log("");
      console.log("%cExample preload:", "font-weight: bold;");
      console.log(
        '%c<link rel="preload" href="/fonts/font.woff2" as="font" type="font/woff2" crossorigin>',
        "font-family: monospace; color: #22c55e;"
      );
    }

    console.groupEnd();
  } else if (preloadedFonts.length > 0 && usedFonts.length > 0) {
    console.log("");
    console.log(
      "%c✅ Font loading looks optimized! Preloaded fonts match usage above the fold.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Best practices
  console.log("");
  console.group("%c📝 Font Loading Best Practices", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("1. Preload critical fonts used above the fold");
  console.log("2. Use font-display: swap or optional");
  console.log("3. Always include crossorigin attribute on font preloads");
  console.log("4. Self-host fonts when possible for better control");
  console.log("5. Subset fonts to include only needed characters");
  console.log("6. Use WOFF2 format for best compression");
  logOwnDomainsHint(preloadedFonts.filter((f) => f.thirdParty).length);
  console.groupEnd();

  console.groupEnd();

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
      // The preload links themselves (at most 20)
      preloadedFonts: preloadedFonts.slice(0, 20).map(f => ({
        family: f.name.replace(/\.(woff2?|ttf|otf|eot)$/i, ""),
        href: f.href,
        fontType: f.type,
        crossorigin: f.crossorigin || "",
        thirdParty: f.thirdParty,
      })),
    },
    // The Visualizer reads items (loaded fonts) and usedFonts
    items: uniqueLoadedFonts.slice(0, 50).map(f => ({ family: f.family, weight: f.weight, style: f.style, display: f.display })),
    usedFonts: usedFonts.slice(0, 50).map(f => ({ family: f.family, weight: f.weight, style: f.style, elements: f.elements })),
    issues: [
      ...preloadedNotUsed.map(f => ({ severity: "warning", message: `Preloaded but not used above fold: ${f.name}` })),
      ...usedNotPreloaded.map(f => ({ severity: "warning", message: `Used above fold but not preloaded: ${f.family} (${f.weight})` })),
      ...preloadedFonts.filter(f => !f.crossorigin).map(f => ({ severity: "error", message: `Font preloaded without crossorigin (double fetch): ${f.name}` })),
    ],
  };
})();
