// Video Element Audit
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

  function detectBestCodec(video) {
    const sources = Array.from(video.querySelectorAll("source"));
    const types = sources
      .map((s) => s.getAttribute("type") || "")
      .filter(Boolean)
      .map((t) => t.toLowerCase());

    const allSrcs = [
      (video.currentSrc || "").toLowerCase(),
      (video.getAttribute("src") || "").toLowerCase(),
      ...sources.map((s) => (s.getAttribute("src") || "").toLowerCase()),
    ];

    if (types.some((t) => t.includes("av01") || t.includes("av1"))) return "AV1";
    if (types.some((t) => t.includes("vp9"))) return "VP9";
    if (types.some((t) => t.includes("webm")) || allSrcs.some((s) => s.endsWith(".webm")))
      return "WebM";
    if (
      types.some((t) => t.includes("mp4")) ||
      allSrcs.some((s) => s.endsWith(".mp4") || s.endsWith(".mov"))
    )
      return "MP4";
    if (types.some((t) => t.includes("ogg")) || allSrcs.some((s) => s.endsWith(".ogv")))
      return "OGG";

    return sources.length > 0 || video.getAttribute("src") ? "unknown" : "no source";
  }

  function isModernCodec(codec) {
    return ["AV1", "VP9", "WebM"].includes(codec);
  }

  function shortSrc(url) {
    if (!url) return "";
    return url.split("/").pop()?.split("?")[0]?.slice(0, 40) || url.slice(-40);
  }

  const videos = Array.from(document.querySelectorAll("video"));

  if (videos.length === 0) {
    console.log("No <video> elements found on this page.");
    return;
  }

  const audited = videos.map((video) => {
    const inViewport = isInViewport(video);
    const rect = video.getBoundingClientRect();
    const src = video.currentSrc || video.getAttribute("src") || "";

    const preload = video.getAttribute("preload");
    const autoplay = video.hasAttribute("autoplay");
    const muted = video.hasAttribute("muted") || video.muted;
    const playsinline = video.hasAttribute("playsinline");
    const loop = video.hasAttribute("loop");
    const controls = video.hasAttribute("controls");
    const poster = video.getAttribute("poster");
    const hasDimensions = video.hasAttribute("width") && video.hasAttribute("height");
    const sources = Array.from(video.querySelectorAll("source"));
    const codec = detectBestCodec(video);

    const issues = [];

    if (preload === "auto" && !autoplay) {
      issues.push({
        s: "error",
        msg: 'preload="auto" loads the full video eagerly — use preload="none" or preload="metadata"',
      });
    }

    if (!autoplay && !inViewport && preload !== "none") {
      issues.push({
        s: "warning",
        msg: 'Off-viewport video without preload="none" — set preload="none" to avoid unnecessary loading',
      });
    }

    if (autoplay && !muted) {
      issues.push({
        s: "error",
        msg: "autoplay without muted — browsers block unmuted autoplay",
      });
    }

    if (autoplay && !playsinline) {
      issues.push({
        s: "warning",
        msg: "autoplay without playsinline — iOS Safari forces fullscreen mode",
      });
    }

    if (!poster) {
      issues.push({
        s: "warning",
        msg: "Missing poster — no preview frame shown before playback starts",
      });
    }

    if (!hasDimensions) {
      issues.push({
        s: "warning",
        msg: "Missing width/height attributes (CLS risk)",
      });
    }

    if (!isModernCodec(codec) && codec !== "no source") {
      issues.push({
        s: "info",
        msg: "No modern codec source detected — consider adding a WebM source (VP9 or AV1) for better compression",
      });
    }

    if (!controls && !autoplay) {
      issues.push({
        s: "info",
        msg: "No controls attribute and no autoplay — users may not be able to play the video",
      });
    }

    return {
      video,
      inViewport,
      src,
      codec,
      preload: preload ?? "(not set)",
      autoplay,
      muted,
      playsinline,
      loop,
      controls,
      poster: poster ? "✓" : "(not set)",
      hasDimensions,
      sourceCount: sources.length,
      dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      issues,
    };
  });

  const withIssues = audited.filter((r) => r.issues.length > 0);
  const totalErrors = audited.flatMap((r) => r.issues.filter((i) => i.s === "error")).length;
  const totalWarnings = audited.flatMap((r) => r.issues.filter((i) => i.s === "warning")).length;
  const totalInfos = audited.flatMap((r) => r.issues.filter((i) => i.s === "info")).length;

  console.group("%c🎬 Video Element Audit", "font-weight: bold; font-size: 14px;");

  // Summary
  console.log("");
  console.log("%cSummary", "font-weight: bold;");
  console.log(`   Total videos : ${videos.length}`);
  console.log(`   In viewport  : ${audited.filter((r) => r.inViewport).length}`);
  console.log(`   Off viewport : ${audited.filter((r) => !r.inViewport).length}`);
  console.log(
    `   Issues       : ${totalErrors} errors · ${totalWarnings} warnings · ${totalInfos} info`,
  );

  // Full table
  console.log("");
  console.group(`%c📋 All Videos (${videos.length})`, "font-weight: bold;");
  console.table(
    audited.map((r) => ({
      src: shortSrc(r.src),
      codec: r.codec,
      viewport: r.inViewport ? "✓" : "",
      preload: r.preload,
      autoplay: r.autoplay ? "✓" : "",
      muted: r.muted ? "✓" : "",
      playsinline: r.playsinline ? "✓" : "",
      controls: r.controls ? "✓" : "",
      poster: r.poster,
      "w/h": r.hasDimensions ? "✓" : "⚠️",
      sources: r.sourceCount,
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
      console.log("   Element:", r.video);
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
  console.log("%c  🎬 Autoplay hero/background video:", "color: #22c55e;");
  console.log(
    '%c  <video autoplay muted playsinline loop poster="preview.avif" width="1280" height="720">\n    <source src="hero.av1.webm" type="video/webm; codecs=av01.0.04M.08">\n    <source src="hero.vp9.webm" type="video/webm; codecs=vp9">\n    <source src="hero.mp4" type="video/mp4">\n  </video>',
    "font-family: monospace;",
  );
  console.log("");
  console.log("%c  ✅ User-controlled video:", "color: #22c55e;");
  console.log(
    '%c  <video controls preload="metadata" poster="thumbnail.avif" width="800" height="450">\n    <source src="video.vp9.webm" type="video/webm; codecs=vp9">\n    <source src="video.mp4" type="video/mp4">\n  </video>',
    "font-family: monospace;",
  );
  console.log("");
  console.log("%c  ✅ Below-fold video:", "color: #22c55e;");
  console.log(
    '%c  <video controls preload="none" poster="thumbnail.avif" width="800" height="450">\n    <source src="video.vp9.webm" type="video/webm; codecs=vp9">\n    <source src="video.mp4" type="video/mp4">\n  </video>',
    "font-family: monospace;",
  );
  console.groupEnd();

  console.groupEnd();
})();
