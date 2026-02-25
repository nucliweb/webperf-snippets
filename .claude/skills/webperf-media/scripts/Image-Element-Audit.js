// Image Element Audit
// https://webperf-snippets.nucliweb.net

(async () => {
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

  function findLcpCandidate(imgs) {
    let candidate = null;
    let maxArea = 0;
    imgs.filter(isInViewport).forEach((img) => {
      const { width, height } = img.getBoundingClientRect();
      const area = width * height;
      if (area > maxArea) {
        maxArea = area;
        candidate = img;
      }
    });
    return candidate;
  }

  function detectFormat(url) {
    if (!url) return "unknown";
    const lower = url.toLowerCase();
    const path = lower.split("?")[0];
    const query = lower.includes("?") ? lower.split("?")[1] : "";

    // Cloudinary path transforms: /f_auto/, /f_avif,q_auto/, etc.
    const cloudinaryMatch = path.match(/\/f_(auto|avif|webp|jxl|png|jpg|jpeg|gif|svg)[,/]/);
    if (cloudinaryMatch) {
      const fmt = cloudinaryMatch[1];
      return fmt === "auto" ? "auto (cdn)" : fmt === "jpeg" ? "jpg" : fmt;
    }

    // Query string params: ?fm=webp (imgix), ?format=avif (generic)
    const qMatch = query.match(/(?:^|&)(?:fm|format)=(avif|webp|jxl|png|jpg|jpeg|gif|svg)(?:&|$)/);
    if (qMatch) return qMatch[1] === "jpeg" ? "jpg" : qMatch[1];

    // File extension in path
    const extMatch = path.match(/\.(avif|webp|jxl|png|gif|svg|jpg|jpeg)(?:[?#]|$)/);
    if (extMatch) return extMatch[1] === "jpeg" ? "jpg" : extMatch[1];

    // No extension at all — likely a DAM or CDN serving format via Accept header
    const lastSegment = path.split("/").pop() || "";
    if (!lastSegment.includes(".")) return "auto (cdn?)";

    return "unknown";
  }

  function isModernFormat(format) {
    return ["avif", "webp", "jxl", "auto (cdn)", "auto (cdn?)"].includes(format);
  }

  async function fetchFormat(url) {
    if (!url) return detectFormat(url);
    try {
      const res = await fetch(url, { cache: "force-cache" });
      const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
      if (ct.includes("avif")) return "avif";
      if (ct.includes("webp")) return "webp";
      if (ct.includes("jxl")) return "jxl";
      if (ct.includes("png")) return "png";
      if (ct.includes("gif")) return "gif";
      if (ct.includes("svg")) return "svg";
      if (ct.includes("jpeg")) return "jpg";
    } catch {}
    return detectFormat(url);
  }

  function shortSrc(url) {
    if (!url) return "";
    return url.split("/").pop()?.split("?")[0]?.slice(0, 40) || url.slice(-40);
  }

  function normalizeUrl(url) {
    try {
      return new URL(url, location.origin).href;
    } catch {
      return url;
    }
  }

  function findPreloadForLcp(img, preloads) {
    const src = normalizeUrl(img.currentSrc || img.src || "");
    return (
      preloads.find((link) => {
        const href = link.getAttribute("href");
        const imagesrcset = link.getAttribute("imagesrcset") || "";
        if (href && normalizeUrl(href) === src) return true;
        if (imagesrcset) {
          return imagesrcset
            .split(",")
            .map((s) => normalizeUrl(s.trim().split(/\s+/)[0]))
            .includes(src);
        }
        return false;
      }) ?? null
    );
  }

  const images = Array.from(document.querySelectorAll("img"));

  if (images.length === 0) {
    console.log("No <img> elements found on this page.");
    return;
  }

  const lcpCandidate = findLcpCandidate(images);
  const imagePreloads = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'));

  // Fetch actual formats from Content-Type headers in parallel.
  // Uses the browser cache (force-cache) so already-loaded images
  // don't trigger new network requests. Falls back to URL detection
  // if the server does not expose CORS headers.
  const formats = await Promise.all(images.map((img) => fetchFormat(img.currentSrc || img.src)));

  const audited = images.map((img, i) => {
    const inViewport = isInViewport(img);
    const isLcp = img === lcpCandidate;
    const rect = img.getBoundingClientRect();
    const src = img.currentSrc || img.src || "";
    const format = formats[i];
    const inPicture = img.parentElement?.tagName === "PICTURE";

    const loading = img.getAttribute("loading");
    const decoding = img.getAttribute("decoding");
    const fetchpriority = img.getAttribute("fetchpriority");
    const hasDimensions = img.hasAttribute("width") && img.hasAttribute("height");

    const issues = [];
    let lcpPreload = null;

    if (isLcp) {
      if (fetchpriority !== "high")
        issues.push({ s: "error", msg: 'Add fetchpriority="high" to the LCP image' });
      if (loading === "lazy")
        issues.push({ s: "error", msg: 'Remove loading="lazy" from the LCP image' });
      if (decoding !== "sync")
        issues.push({ s: "warning", msg: 'Consider decoding="sync" for the LCP image' });
      lcpPreload = findPreloadForLcp(img, imagePreloads);
      if (!lcpPreload)
        issues.push({ s: "warning", msg: 'LCP image has no <link rel="preload" as="image">' });
      else if (lcpPreload.getAttribute("fetchpriority") !== "high")
        issues.push({ s: "info", msg: 'LCP image preload is missing fetchpriority="high"' });
    } else if (inViewport) {
      if (loading === "lazy")
        issues.push({ s: "warning", msg: 'Remove loading="lazy" (image is above the fold)' });
    } else {
      if (loading !== "lazy")
        issues.push({ s: "warning", msg: 'Add loading="lazy" (image is off-viewport)' });
      if (fetchpriority === "high")
        issues.push({ s: "error", msg: 'Remove fetchpriority="high" (image is off-viewport)' });
    }

    if (loading === "lazy" && fetchpriority === "high")
      issues.push({ s: "error", msg: 'Conflict: loading="lazy" + fetchpriority="high"' });

    if (!hasDimensions)
      issues.push({ s: "warning", msg: "Missing width/height attributes (CLS risk)" });

    if (!isModernFormat(format) && !inPicture && format !== "svg")
      issues.push({ s: "info", msg: "No modern format detected (WebP / AVIF / JXL)" });

    return {
      img,
      inViewport,
      isLcp,
      src,
      format,
      loading: loading ?? "(not set)",
      decoding: decoding ?? "(not set)",
      fetchpriority: fetchpriority ?? "(not set)",
      hasDimensions,
      hasSrcset: img.hasAttribute("srcset"),
      hasSizes: img.hasAttribute("sizes"),
      inPicture,
      dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      lcpPreload,
      issues,
    };
  });

  const withIssues = audited.filter((r) => r.issues.length > 0);
  const totalErrors = audited.flatMap((r) => r.issues.filter((i) => i.s === "error")).length;
  const totalWarnings = audited.flatMap((r) => r.issues.filter((i) => i.s === "warning")).length;
  const totalInfos = audited.flatMap((r) => r.issues.filter((i) => i.s === "info")).length;

  console.group("%c🖼️ Image Element Audit", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary", "font-weight: bold;");
  console.log(`   Total images  : ${images.length}`);
  console.log(`   In viewport   : ${audited.filter((r) => r.inViewport).length}`);
  console.log(`   Off viewport  : ${audited.filter((r) => !r.inViewport).length}`);
  console.log(
    `   Issues        : ${totalErrors} errors · ${totalWarnings} warnings · ${totalInfos} info`,
  );

  // LCP candidate
  if (lcpCandidate) {
    const lcp = audited.find((r) => r.isLcp);
    const fpOk = lcp.fetchpriority === "high";
    const preloadStatus = lcp.lcpPreload
      ? lcp.lcpPreload.getAttribute("fetchpriority") === "high"
        ? "✅ found (fetchpriority=high)"
        : "⚠️ found (no fetchpriority=high)"
      : "⚠️ not found";
    console.log("");
    console.log("%cLCP Candidate", "font-weight: bold;");
    console.log(`   fetchpriority : ${fpOk ? "✅" : "⚠️"} ${lcp.fetchpriority}`);
    console.log(`   decoding      : ${lcp.decoding}`);
    console.log(`   loading       : ${lcp.loading}`);
    console.log(`   format        : ${lcp.format}`);
    console.log(`   preload       : ${preloadStatus}`);
    console.log(`   dimensions    : ${lcp.dimensions}`);
    console.log("   Element:", lcpCandidate);
    if (lcp.lcpPreload) console.log("   Preload:", lcp.lcpPreload);
  }

  // Full table
  console.log("");
  console.group(`%c📋 All Images (${images.length})`, "font-weight: bold;");
  console.table(
    audited.map((r) => ({
      src: shortSrc(r.src),
      format: r.format,
      viewport: r.inViewport ? "✓" : "",
      LCP: r.isLcp ? "⭐" : "",
      loading: r.loading,
      decoding: r.decoding,
      fetchpriority: r.fetchpriority,
      srcset: r.hasSrcset ? "✓" : "",
      sizes: r.hasSizes ? "✓" : "",
      "in <picture>": r.inPicture ? "✓" : "",
      "w/h": r.hasDimensions ? "✓" : "⚠️",
      issues:
        r.issues.length === 0
          ? "✅"
          : r.issues
              .map((i) => (i.s === "error" ? "🔴" : i.s === "warning" ? "⚠️" : "ℹ️"))
              .join(" "),
    })),
  );
  console.groupEnd();

  // Issues detail
  if (withIssues.length > 0) {
    console.log("");
    console.group(
      `%c⚠️ Issues Detail (${totalErrors} errors · ${totalWarnings} warnings · ${totalInfos} info)`,
      "color: #ef4444; font-weight: bold;",
    );

    withIssues.forEach((r) => {
      const hasError = r.issues.some((i) => i.s === "error");
      const icon = hasError ? "🔴" : "⚠️";
      console.log("");
      console.log(`%c${icon} ${shortSrc(r.src) || "(no src)"}`, "font-weight: bold;");
      r.issues.forEach((issue) => {
        const prefix = issue.s === "error" ? "   🔴" : issue.s === "warning" ? "   ⚠️" : "   ℹ️";
        console.log(`${prefix} ${issue.msg}`);
      });
      console.log("   Element:", r.img);
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
  console.log("%c  ⭐ LCP image + preload:", "color: #22c55e;");
  console.log(
    '%c  <link rel="preload" as="image" href="hero.avif" fetchpriority="high">\n  <img src="hero.avif" fetchpriority="high" decoding="sync" width="1200" height="630" alt="...">',
    "font-family: monospace;",
  );
  console.log("");
  console.log("%c  ✅ Below-fold image:", "color: #22c55e;");
  console.log(
    '%c  <img src="content.avif" loading="lazy" decoding="async" width="800" height="600" alt="...">',
    "font-family: monospace;",
  );
  console.log("");
  console.log("%c  ✅ Picture with modern format fallback chain:", "color: #22c55e;");
  console.log(
    '%c  <picture>\n    <source type="image/jxl" srcset="img.jxl">\n    <source type="image/avif" srcset="img.avif">\n    <source type="image/webp" srcset="img.webp">\n    <img src="img.jpg" loading="lazy" width="800" height="600" alt="...">\n  </picture>',
    "font-family: monospace;",
  );
  console.groupEnd();

  console.groupEnd();
})();
