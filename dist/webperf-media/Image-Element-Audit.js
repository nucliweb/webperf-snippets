(async () => {
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
  }
  function findLcpCandidate(imgs) {
    let candidate = null;
    let maxArea = 0;
    imgs.filter(isInViewport).forEach(img => {
      const {width: width, height: height} = img.getBoundingClientRect();
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
    const cloudinaryMatch = path.match(/\/f_(auto|avif|webp|jxl|png|jpg|jpeg|gif|svg)[,/]/);
    if (cloudinaryMatch) {
      const fmt = cloudinaryMatch[1];
      return fmt === "auto" ? "auto (cdn)" : fmt === "jpeg" ? "jpg" : fmt;
    }
    const qMatch = query.match(/(?:^|&)(?:fm|format)=(avif|webp|jxl|png|jpg|jpeg|gif|svg)(?:&|$)/);
    if (qMatch) return qMatch[1] === "jpeg" ? "jpg" : qMatch[1];
    const extMatch = path.match(/\.(avif|webp|jxl|png|gif|svg|jpg|jpeg)(?:[?#]|$)/);
    if (extMatch) return extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
    const lastSegment = path.split("/").pop() || "";
    if (!lastSegment.includes(".")) return "auto (cdn?)";
    return "unknown";
  }
  function isModernFormat(format) {
    return [ "avif", "webp", "jxl", "auto (cdn)", "auto (cdn?)" ].includes(format);
  }
  async function fetchFormat(url) {
    if (!url) return detectFormat(url);
    try {
      const res = await fetch(url, {
        cache: "force-cache"
      });
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
    return preloads.find(link => {
      const href = link.getAttribute("href");
      const imagesrcset = link.getAttribute("imagesrcset") || "";
      if (href && normalizeUrl(href) === src) return true;
      if (imagesrcset) return imagesrcset.split(",").map(s => normalizeUrl(s.trim().split(/\s+/)[0])).includes(src);
      return false;
    }) ?? null;
  }
  const images = Array.from(document.querySelectorAll("img"));
  if (images.length === 0) {
    return {
      script: "Image-Element-Audit",
      status: "ok",
      count: 0,
      items: [],
      issues: []
    };
  }
  const lcpCandidate = findLcpCandidate(images);
  const imagePreloads = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'));
  const formats = await Promise.all(images.map(img => fetchFormat(img.currentSrc || img.src)));
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
      if (fetchpriority !== "high") issues.push({
        s: "error",
        msg: 'Add fetchpriority="high" to the LCP image'
      });
      if (loading === "lazy") issues.push({
        s: "error",
        msg: 'Remove loading="lazy" from the LCP image'
      });
      if (decoding !== "sync") issues.push({
        s: "warning",
        msg: 'Consider decoding="sync" for the LCP image'
      });
      lcpPreload = findPreloadForLcp(img, imagePreloads);
      if (!lcpPreload) issues.push({
        s: "warning",
        msg: 'LCP image has no <link rel="preload" as="image">'
      }); else if (lcpPreload.getAttribute("fetchpriority") !== "high") issues.push({
        s: "info",
        msg: 'LCP image preload is missing fetchpriority="high"'
      });
    } else if (inViewport) {
      if (loading === "lazy") issues.push({
        s: "warning",
        msg: 'Remove loading="lazy" (image is above the fold)'
      });
    } else {
      if (loading !== "lazy") issues.push({
        s: "warning",
        msg: 'Add loading="lazy" (image is off-viewport)'
      });
      if (fetchpriority === "high") issues.push({
        s: "error",
        msg: 'Remove fetchpriority="high" (image is off-viewport)'
      });
    }
    if (loading === "lazy" && fetchpriority === "high") issues.push({
      s: "error",
      msg: 'Conflict: loading="lazy" + fetchpriority="high"'
    });
    if (!hasDimensions) issues.push({
      s: "warning",
      msg: "Missing width/height attributes (CLS risk)"
    });
    if (!isModernFormat(format) && !inPicture && format !== "svg") issues.push({
      s: "info",
      msg: "No modern format detected (WebP / AVIF / JXL)"
    });
    return {
      img: img,
      inViewport: inViewport,
      isLcp: isLcp,
      src: src,
      format: format,
      loading: loading ?? "(not set)",
      decoding: decoding ?? "(not set)",
      fetchpriority: fetchpriority ?? "(not set)",
      hasDimensions: hasDimensions,
      hasSrcset: img.hasAttribute("srcset"),
      hasSizes: img.hasAttribute("sizes"),
      inPicture: inPicture,
      dimensions: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      lcpPreload: lcpPreload,
      issues: issues
    };
  });
  const withIssues = audited.filter(r => r.issues.length > 0);
  const totalErrors = audited.flatMap(r => r.issues.filter(i => i.s === "error")).length;
  const totalWarnings = audited.flatMap(r => r.issues.filter(i => i.s === "warning")).length;
  const totalInfos = audited.flatMap(r => r.issues.filter(i => i.s === "info")).length;
  if (lcpCandidate) {
    const lcp = audited.find(r => r.isLcp);
    lcp.fetchpriority;
    lcp.lcpPreload && lcp.lcpPreload.getAttribute("fetchpriority");
    if (lcp.lcpPreload) void 0;
  }
  if (withIssues.length > 0) {
    withIssues.forEach(r => {
      r.issues.some(i => i.s === "error");
      r.issues.forEach(issue => {
        issue.s === "error" || issue.s;
      });
    });
  } else {
  }
  const lcpData = lcpCandidate ? audited.find(r => r.isLcp) : null;
  return {
    script: "Image-Element-Audit",
    status: "ok",
    count: images.length,
    details: {
      totalImages: images.length,
      inViewport: audited.filter(r => r.inViewport).length,
      offViewport: audited.filter(r => !r.inViewport).length,
      totalErrors: totalErrors,
      totalWarnings: totalWarnings,
      totalInfos: totalInfos,
      lcpCandidate: lcpData ? {
        selector: shortSrc(lcpData.src),
        format: lcpData.format,
        fetchpriority: lcpData.fetchpriority,
        loading: lcpData.loading,
        preloaded: !!lcpData.lcpPreload
      } : null
    },
    items: audited.map(r => ({
      url: r.src,
      format: r.format,
      inViewport: r.inViewport,
      isLCP: r.isLcp,
      loading: r.loading,
      decoding: r.decoding,
      fetchpriority: r.fetchpriority,
      hasDimensions: r.hasDimensions,
      hasSrcset: r.hasSrcset,
      hasSizes: r.hasSizes,
      inPicture: r.inPicture,
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
