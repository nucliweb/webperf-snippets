(() => {
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
  }
  function detectBestCodec(video) {
    const sources = Array.from(video.querySelectorAll("source"));
    const types = sources.map(s => s.getAttribute("type") || "").filter(Boolean).map(t => t.toLowerCase());
    const allSrcs = [ (video.currentSrc || "").toLowerCase(), (video.getAttribute("src") || "").toLowerCase(), ...sources.map(s => (s.getAttribute("src") || "").toLowerCase()) ];
    if (types.some(t => t.includes("av01") || t.includes("av1"))) return "AV1";
    if (types.some(t => t.includes("vp9"))) return "VP9";
    if (types.some(t => t.includes("webm")) || allSrcs.some(s => s.endsWith(".webm"))) return "WebM";
    if (types.some(t => t.includes("mp4")) || allSrcs.some(s => s.endsWith(".mp4") || s.endsWith(".mov"))) return "MP4";
    if (types.some(t => t.includes("ogg")) || allSrcs.some(s => s.endsWith(".ogv"))) return "OGG";
    return sources.length > 0 || video.getAttribute("src") ? "unknown" : "no source";
  }
  function isModernCodec(codec) {
    return [ "AV1", "VP9", "WebM" ].includes(codec);
  }
  function shortSrc(url) {
    if (!url) return "";
    return url.split("/").pop()?.split("?")[0]?.slice(0, 40) || url.slice(-40);
  }
  const videos = Array.from(document.querySelectorAll("video"));
  if (videos.length === 0) {
    return {
      script: "Video-Element-Audit",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const audited = videos.map(video => {
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
    if (preload === "auto" && !autoplay) issues.push({
      s: "error",
      msg: 'preload="auto" loads the full video eagerly — use preload="none" or preload="metadata"'
    });
    if (!autoplay && !inViewport && preload !== "none") issues.push({
      s: "warning",
      msg: 'Off-viewport video without preload="none" — set preload="none" to avoid unnecessary loading'
    });
    if (autoplay && !muted) issues.push({
      s: "error",
      msg: "autoplay without muted — browsers block unmuted autoplay"
    });
    if (autoplay && !playsinline) issues.push({
      s: "warning",
      msg: "autoplay without playsinline — iOS Safari forces fullscreen mode"
    });
    if (!poster) issues.push({
      s: "warning",
      msg: "Missing poster — no preview frame shown before playback starts"
    });
    if (!hasDimensions) issues.push({
      s: "warning",
      msg: "Missing width/height attributes (CLS risk)"
    });
    if (!isModernCodec(codec) && codec !== "no source") issues.push({
      s: "info",
      msg: "No modern codec source detected — consider adding a WebM source (VP9 or AV1) for better compression"
    });
    if (!controls && !autoplay) issues.push({
      s: "info",
      msg: "No controls attribute and no autoplay — users may not be able to play the video"
    });
    return {
      video: video,
      inViewport: inViewport,
      src: src,
      codec: codec,
      preload: preload ?? "(not set)",
      autoplay: autoplay,
      muted: muted,
      playsinline: playsinline,
      loop: loop,
      controls: controls,
      poster: poster ? "✓" : "(not set)",
      hasDimensions: hasDimensions,
      sourceCount: sources.length,
      dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      issues: issues
    };
  });
  const withIssues = audited.filter(r => r.issues.length > 0);
  const totalErrors = audited.flatMap(r => r.issues.filter(i => i.s === "error")).length;
  const totalWarnings = audited.flatMap(r => r.issues.filter(i => i.s === "warning")).length;
  const totalInfos = audited.flatMap(r => r.issues.filter(i => i.s === "info")).length;
  if (withIssues.length > 0) {
    withIssues.forEach(r => {
      r.issues.some(i => i.s === "error");
      r.issues.forEach(issue => {
        issue.s === "error" || issue.s;
      });
    });
  } else {
  }
  return {
    script: "Video-Element-Audit",
    status: "ok",
    count: videos.length,
    details: {
      totalVideos: videos.length,
      inViewport: audited.filter(r => r.inViewport).length,
      offViewport: audited.filter(r => !r.inViewport).length,
      totalErrors: totalErrors,
      totalWarnings: totalWarnings,
      totalInfos: totalInfos
    },
    items: audited.map(r => ({
      src: r.src,
      codec: r.codec,
      inViewport: r.inViewport,
      preload: r.preload,
      autoplay: r.autoplay,
      muted: r.muted,
      playsinline: r.playsinline,
      loop: r.loop,
      controls: r.controls,
      hasPoster: r.poster !== "(not set)",
      hasDimensions: r.hasDimensions,
      sourceCount: r.sourceCount,
      issues: r.issues.map(i => ({
        severity: i.s,
        message: i.msg
      }))
    })),
    issues: audited.flatMap(r => r.issues.map(i => ({
      severity: i.s,
      message: `${shortSrc(r.src) || "(no src)"}: ${i.msg}`
    })))
  };
})();
