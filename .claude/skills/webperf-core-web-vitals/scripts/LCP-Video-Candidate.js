// LCP Video Candidate
// https://webperf-snippets.nucliweb.net

(() => {
  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");

  if (lcpEntries.length === 0) {
    console.warn(
      "⚠️ No LCP entries found. Run this snippet before interacting with the page, or reload and run it immediately.",
    );
    return;
  }

  const lcp = lcpEntries[lcpEntries.length - 1];
  const element = lcp.element;

  function valueToRating(ms) {
    return ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";
  }

  const RATING = {
    good: { icon: "🟢", label: "Good (≤ 2.5 s)" },
    "needs-improvement": { icon: "🟡", label: "Needs Improvement (≤ 4 s)" },
    poor: { icon: "🔴", label: "Poor (> 4 s)" },
  };

  function detectFormat(url) {
    if (!url) return "unknown";
    const path = url.toLowerCase().split("?")[0];
    const ext = path.match(/\.(avif|webp|jxl|png|gif|jpg|jpeg|svg)(?:[?#]|$)/);
    if (ext) return ext[1] === "jpeg" ? "jpg" : ext[1];
    return "unknown";
  }

  function normalizeUrl(url) {
    try {
      return new URL(url, location.origin).href;
    } catch {
      return url;
    }
  }

  console.group("%c🎬 LCP Video Candidate", "font-weight: bold; font-size: 14px;");
  console.log("");

  // --- LCP is NOT a video ---
  if (!element || element.tagName !== "VIDEO") {
    const tag = element ? `<${element.tagName.toLowerCase()}>` : "(element no longer in DOM)";
    const rating = valueToRating(lcp.startTime);
    console.log("%cLCP element is not a <video>", "font-weight: bold;");
    console.log("");
    console.log(`   LCP time : ${Math.round(lcp.startTime)} ms  ${RATING[rating].icon} ${RATING[rating].label}`);
    console.log(`   Tag      : ${tag}`);
    if (lcp.url) console.log(`   URL      : ${lcp.url}`);
    if (element) console.log("   Element  :", element);
    console.groupEnd();
    return;
  }

  // --- LCP IS a video ---
  const posterAttr = element.getAttribute("poster") || "";
  const posterUrl = posterAttr ? normalizeUrl(posterAttr) : "";
  const lcpUrl = lcp.url || "";

  const rating = valueToRating(lcp.startTime);
  const posterFormat = detectFormat(lcpUrl || posterUrl);
  const isModernFormat = ["avif", "webp", "jxl"].includes(posterFormat);
  const isCrossOrigin = lcp.renderTime === 0 && lcp.loadTime > 0;

  const preloadLinks = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'));
  const posterPreload = preloadLinks.find((link) => {
    const href = link.getAttribute("href");
    if (!href) return false;
    try {
      return normalizeUrl(href) === posterUrl || normalizeUrl(href) === lcpUrl;
    } catch {
      return false;
    }
  }) ?? null;

  const preload = element.getAttribute("preload");
  const autoplay = element.hasAttribute("autoplay");
  const muted = element.hasAttribute("muted") || element.muted;
  const playsinline = element.hasAttribute("playsinline");

  const issues = [];

  if (!posterAttr) {
    issues.push({ s: "error", msg: 'No poster attribute — the browser has no image to use as LCP candidate' });
  }

  if (posterAttr && !posterPreload) {
    issues.push({ s: "warning", msg: 'No <link rel="preload" as="image"> for the poster — browser discovers it late' });
  } else if (posterPreload && posterPreload.getAttribute("fetchpriority") !== "high") {
    issues.push({ s: "info", msg: 'Preload found but missing fetchpriority="high" — may be deprioritised' });
  }

  if (posterAttr && !isModernFormat && posterFormat !== "unknown") {
    issues.push({ s: "info", msg: `Poster uses ${posterFormat} — AVIF or WebP would reduce file size and LCP load time` });
  }

  if (isCrossOrigin) {
    issues.push({ s: "info", msg: "renderTime is 0 — poster is cross-origin and the server does not send Timing-Allow-Origin" });
  }

  if (!autoplay && preload === "none") {
    issues.push({ s: "warning", msg: 'preload="none" on a non-autoplay video may delay poster image loading in some browsers' });
  }

  // Summary
  console.log("%c✅ LCP element is a <video>", "color: #22c55e; font-weight: bold;");
  console.log("");

  // LCP metrics
  console.log("%cLCP Metrics", "font-weight: bold;");
  console.log(`   LCP time    : ${Math.round(lcp.startTime)} ms  ${RATING[rating].icon} ${RATING[rating].label}`);
  console.log(`   Render time : ${lcp.renderTime > 0 ? Math.round(lcp.renderTime) + " ms" : "0 (cross-origin — add Timing-Allow-Origin)"}`);
  console.log(`   Load time   : ${Math.round(lcp.loadTime)} ms`);
  console.log(`   Size        : ${Math.round(lcp.size)} px²`);
  console.log(`   Poster URL  : ${lcpUrl || posterUrl || "⚠️ (none)"}`);
  console.log(`   Format      : ${posterFormat}`);

  // Video element
  console.log("");
  console.log("%cVideo Element", "font-weight: bold;");
  console.log(`   poster      : ${posterAttr || "⚠️ (not set)"}`);
  console.log(`   preload     : ${preload ?? "(not set)"}`);
  console.log(`   autoplay    : ${autoplay ? "✓" : "—"}`);
  console.log(`   muted       : ${muted ? "✓" : "—"}`);
  console.log(`   playsinline : ${playsinline ? "✓" : "—"}`);
  console.log("   Element     :", element);

  // Preload link
  console.log("");
  console.log("%cPreload Link", "font-weight: bold;");
  if (posterPreload) {
    const fp = posterPreload.getAttribute("fetchpriority");
    console.log(`   Status       : ✅ found`);
    console.log(`   fetchpriority: ${fp ?? "⚠️ (not set)"}`);
    console.log("   Element      :", posterPreload);
  } else {
    console.log(`   Status       : ⚠️ not found`);
    if (posterAttr) {
      console.log(
        `   Recommended  : <link rel="preload" as="image" href="${posterAttr}" fetchpriority="high">`,
      );
    }
  }

  // Issues
  if (issues.length > 0) {
    const totalErrors = issues.filter((i) => i.s === "error").length;
    const totalWarnings = issues.filter((i) => i.s === "warning").length;
    const totalInfos = issues.filter((i) => i.s === "info").length;
    console.log("");
    console.group(
      `%c⚠️ Issues (${totalErrors} errors · ${totalWarnings} warnings · ${totalInfos} info)`,
      "color: #ef4444; font-weight: bold;",
    );
    issues.forEach((issue) => {
      const prefix = issue.s === "error" ? "🔴" : issue.s === "warning" ? "⚠️" : "ℹ️";
      console.log(`${prefix} ${issue.msg}`);
    });
    console.groupEnd();
  } else {
    console.log("");
    console.log("%c✅ No issues found.", "color: #22c55e; font-weight: bold;");
  }

  // Quick reference
  console.log("");
  console.group("%c📝 Quick Reference", "color: #3b82f6; font-weight: bold;");
  console.log("");
  console.log("%c  ✅ Optimal video LCP setup:", "color: #22c55e;");
  const ref = posterAttr || "poster.avif";
  console.log(
    `%c  <link rel="preload" as="image" href="${ref}" fetchpriority="high">\n  <video autoplay muted playsinline loop poster="${ref}" width="1280" height="720">\n    <source src="hero.av1.webm" type="video/webm; codecs=av01.0.04M.08">\n    <source src="hero.mp4" type="video/mp4">\n  </video>`,
    "font-family: monospace;",
  );
  console.groupEnd();

  console.groupEnd();
})();
