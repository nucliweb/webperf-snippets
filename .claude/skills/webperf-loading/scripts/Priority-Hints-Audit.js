// Priority Hints Audit
// https://webperf-snippets.nucliweb.net

(() => {
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function findLcpCandidate() {
    const imgs = Array.from(document.querySelectorAll("img")).filter(isInViewport);
    let candidate = null;
    let maxArea = 0;
    imgs.forEach((img) => {
      const { width, height } = img.getBoundingClientRect();
      const area = width * height;
      if (area > maxArea) {
        maxArea = area;
        candidate = img;
      }
    });
    return candidate;
  }

  function shortUrl(el) {
    const src = el.src || el.href || el.getAttribute("href") || "";
    return src.split("/").pop()?.split("?")[0] || src.slice(-50) || "(unknown)";
  }

  // Build performance entry map for timing lookups
  const entryMap = new Map();
  performance.getEntriesByType("resource").forEach((e) => {
    try {
      entryMap.set(new URL(e.name, location.origin).href, e);
    } catch {}
  });

  function getEntry(el) {
    const src = el.src || el.href || el.getAttribute("href") || "";
    if (!src) return null;
    try {
      return entryMap.get(new URL(src, location.origin).href) || null;
    } catch {
      return null;
    }
  }

  // All elements with fetchpriority
  const allElements = Array.from(document.querySelectorAll("[fetchpriority]"));
  // Exclude images — covered by "Find Images With Lazy and Fetchpriority"
  const nonImageElements = allElements.filter((el) => el.tagName !== "IMG");
  const images = allElements.filter((el) => el.tagName === "IMG");
  const preloadsWithPriority = Array.from(
    document.querySelectorAll('link[rel="preload"][fetchpriority]')
  );
  const lcpCandidate = findLcpCandidate();

  const issues = [];

  // Issue 1: <link rel="preload"> with fetchpriority="low" (contradictory)
  preloadsWithPriority
    .filter((link) => link.getAttribute("fetchpriority") === "low")
    .forEach((link) => {
      issues.push({
        severity: "error",
        element: link,
        resource: shortUrl(link),
        message: 'preload + fetchpriority="low" is contradictory',
        detail:
          'preload signals this resource is critical for the current page; fetchpriority="low" contradicts that.',
        fix: 'Remove fetchpriority="low", or use fetchpriority="high" if the resource is truly critical',
      });
    });

  // Issue 2: fetchpriority="low" on resources loaded in the first 500ms
  allElements
    .filter((el) => el.getAttribute("fetchpriority") === "low")
    .forEach((el) => {
      const entry = getEntry(el);
      if (entry && entry.startTime < 500) {
        issues.push({
          severity: "warning",
          element: el,
          resource: shortUrl(el),
          message: `fetchpriority="low" but loaded at ${entry.startTime.toFixed(0)}ms`,
          detail:
            "This resource loaded very early. If it's genuinely non-critical, the browser is deprioritizing it correctly. Otherwise, reconsider the priority.",
          fix: 'Verify the resource is non-critical, or remove fetchpriority="low"',
        });
      }
    });

  // Issue 3: fetchpriority="high" on resources loaded after 3000ms
  allElements
    .filter((el) => el.getAttribute("fetchpriority") === "high")
    .forEach((el) => {
      const entry = getEntry(el);
      if (entry && entry.startTime > 3000) {
        issues.push({
          severity: "warning",
          element: el,
          resource: shortUrl(el),
          message: `fetchpriority="high" but loaded at ${entry.startTime.toFixed(0)}ms`,
          detail:
            "High-priority resources should load early. A late start may indicate render-blocking dependencies or incorrect placement in the document.",
          fix: "Move the element earlier in the HTML or investigate render-blocking dependencies",
        });
      }
    });

  // Issue 4: LCP candidate image without fetchpriority="high"
  if (lcpCandidate && lcpCandidate.getAttribute("fetchpriority") !== "high") {
    const fp = lcpCandidate.getAttribute("fetchpriority");
    issues.push({
      severity: "warning",
      element: lcpCandidate,
      resource:
        (lcpCandidate.currentSrc || lcpCandidate.src).split("/").pop()?.split("?")[0] ||
        "LCP image",
      message: `LCP candidate image ${fp ? `has fetchpriority="${fp}"` : "has no fetchpriority set"}`,
      detail:
        'The largest visible image is likely the LCP element and benefits most from fetchpriority="high".',
      fix: 'Add fetchpriority="high" to the LCP image to improve Largest Contentful Paint',
    });
  }

  // Display results
  console.group("%c🎯 Priority Hints Audit", "font-weight: bold; font-size: 14px;");

  const highCount = allElements.filter(
    (el) => el.getAttribute("fetchpriority") === "high"
  ).length;
  const lowCount = allElements.filter(
    (el) => el.getAttribute("fetchpriority") === "low"
  ).length;
  const autoCount = allElements.filter(
    (el) => el.getAttribute("fetchpriority") === "auto"
  ).length;

  console.log("");
  console.log("%cInventory:", "font-weight: bold;");
  console.log(`   Total elements with fetchpriority: ${allElements.length}`);
  console.log(
    `     • Images: ${images.length} (see "Find Images With Lazy and Fetchpriority" for image-specific checks)`
  );
  console.log(`     • Non-image resources: ${nonImageElements.length}`);
  console.log(`     • Preloads with fetchpriority: ${preloadsWithPriority.length}`);
  console.log(
    `   Priority breakdown: high=${highCount}, low=${lowCount}, auto=${autoCount}`
  );

  if (allElements.length === 0 && !lcpCandidate) {
    console.log("");
    console.log(
      "%cℹ️ No fetchpriority attributes found on this page.",
      "color: #3b82f6;"
    );
    console.groupEnd();
    return;
  }

  // LCP candidate status
  if (lcpCandidate) {
    const fp = lcpCandidate.getAttribute("fetchpriority");
    const status =
      fp === "high"
        ? '✅ fetchpriority="high"'
        : fp
        ? `⚠️ fetchpriority="${fp}"`
        : "⚠️ No fetchpriority set";
    console.log("");
    console.log("%cLCP Candidate:", "font-weight: bold;");
    console.log(`   ${status}`);
    console.log("   Element:", lcpCandidate);
  }

  // Non-image resources table
  if (nonImageElements.length > 0) {
    console.log("");
    console.group(
      `%c📋 Non-Image Resources with fetchpriority (${nonImageElements.length})`,
      "font-weight: bold;"
    );

    console.table(
      nonImageElements.map((el) => {
        const entry = getEntry(el);
        const rel = el.getAttribute("rel") || "";
        const as = el.getAttribute("as") || "";
        const tag =
          el.tagName.toLowerCase() +
          (rel ? `[rel="${rel}"]` : "") +
          (as ? `[as="${as}"]` : "");
        return {
          Tag: tag,
          Priority: el.getAttribute("fetchpriority"),
          "Start (ms)": entry ? entry.startTime.toFixed(0) : "N/A",
          "Size (KB)":
            entry?.decodedBodySize
              ? (entry.decodedBodySize / 1024).toFixed(1)
              : "N/A",
          Resource: shortUrl(el),
        };
      })
    );

    console.log("%c🔎 Elements:", "font-weight: bold;");
    nonImageElements.forEach((el, i) => console.log(`${i + 1}.`, el));
    console.groupEnd();
  }

  // Preload links with fetchpriority
  if (preloadsWithPriority.length > 0) {
    console.log("");
    console.group(
      `%c🔗 Preload Links with fetchpriority (${preloadsWithPriority.length})`,
      "font-weight: bold;"
    );

    console.table(
      preloadsWithPriority.map((link) => {
        const fp = link.getAttribute("fetchpriority");
        const entry = getEntry(link);
        return {
          fetchpriority: fp,
          as: link.getAttribute("as") || "(missing)",
          Status:
            fp === "low" ? "⚠️ Conflict" : fp === "high" ? "✅ Good" : "ℹ️ Auto",
          "Start (ms)": entry ? entry.startTime.toFixed(0) : "N/A",
          Resource: shortUrl(link),
        };
      })
    );

    console.groupEnd();
  }

  // Issues
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Issues Found (${errors.length} errors, ${warnings.length} warnings)`,
      "color: #ef4444; font-weight: bold;"
    );

    [...errors, ...warnings].forEach((issue) => {
      const color = issue.severity === "error" ? "#ef4444" : "#f59e0b";
      const icon = issue.severity === "error" ? "🔴" : "⚠️";
      console.log("");
      console.log(
        `%c${icon} ${issue.message}`,
        `font-weight: bold; color: ${color};`
      );
      console.log(`   ${issue.detail}`);
      console.log(`   Fix: ${issue.fix}`);
      console.log("   Element:", issue.element);
    });

    console.groupEnd();
  } else {
    console.log("");
    console.log(
      "%c✅ No priority hints issues detected.",
      "color: #22c55e; font-weight: bold;"
    );
  }

  // Quick reference
  console.log("");
  console.group(
    "%c📝 fetchpriority Quick Reference",
    "color: #3b82f6; font-weight: bold;"
  );
  console.log("");
  console.log("%c  ✅ LCP hero image:", "color: #22c55e;");
  console.log(
    '%c  <img src="hero.webp" fetchpriority="high" alt="...">',
    "font-family: monospace;"
  );
  console.log("");
  console.log("%c  ✅ Preloaded critical font:", "color: #22c55e;");
  console.log(
    '%c  <link rel="preload" href="font.woff2" as="font" fetchpriority="high" crossorigin>',
    "font-family: monospace;"
  );
  console.log("");
  console.log("%c  ✅ Below-fold image:", "color: #22c55e;");
  console.log(
    '%c  <img src="content.jpg" loading="lazy" fetchpriority="low" alt="...">',
    "font-family: monospace;"
  );
  console.log("");
  console.log("%c  ❌ Contradictory — preload + low priority:", "color: #ef4444;");
  console.log(
    '%c  <link rel="preload" href="font.woff2" as="font" fetchpriority="low">',
    "font-family: monospace;"
  );
  console.groupEnd();

  console.log("");
  console.log(
    '%c💡 Related: "Find Images With Lazy and Fetchpriority" detects the lazy+high conflict on images. https://webperf-snippets.nucliweb.net/Loading/Find-Images-With-Lazy-and-Fetchpriority',
    "color: #6b7280;"
  );

  console.groupEnd();
})();
