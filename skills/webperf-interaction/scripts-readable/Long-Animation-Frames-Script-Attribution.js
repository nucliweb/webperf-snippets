(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {
    return {
      script: "Long-Animation-Frames-Script-Attribution",
      status: "unsupported",
      error: "long-animation-frame not supported. Chrome 116+ required."
    };
  }
  const frames = performance.getEntriesByType("long-animation-frame").map(entry => ({
    duration: entry.duration,
    blockingDuration: entry.blockingDuration || 0,
    scripts: (entry.scripts || []).map(s => ({
      sourceURL: s.sourceURL || "unknown",
      sourceFunctionName: s.sourceFunctionName || "anonymous",
      invoker: s.invoker || "unknown",
      duration: s.duration || 0
    }))
  }));
  if (frames.length === 0) {
    return {
      script: "Long-Animation-Frames-Script-Attribution",
      status: "ok",
      details: {
        frameCount: 0,
        totalBlockingMs: 0,
        byCategory: {}
      },
      items: []
    };
  }
  const allScripts = frames.flatMap(f => f.scripts);
  const totalBlocking = frames.reduce((sum, f) => sum + f.blockingDuration, 0);
  frames.reduce((sum, f) => sum + f.duration, 0);
  const categorize = url => {
    const u = url.toLowerCase();
    const origin = location.origin.toLowerCase();
    if (u === "" || u === "unknown") return "unknown";
    if ([ "react", "vue", "angular", "svelte", "framework", "chunk", "webpack", "vite" ].some(fw => u.includes(fw))) return "framework";
    if ([ "google-analytics", "gtag", "gtm", "analytics", "facebook", "twitter", "ads", "cdn", "unpkg", "jsdelivr", "segment", "amplitude" ].some(tp => u.includes(tp))) return "third-party";
    if (u.startsWith("chrome-extension://") || u.startsWith("moz-extension://")) return "extension";
    if (u.startsWith("http") && !u.includes(origin.replace(/^https?:\/\//, ""))) return "third-party";
    return "first-party";
  };
  const byCategory = {};
  allScripts.forEach(script => {
    const cat = categorize(script.sourceURL);
    if (!byCategory[cat]) byCategory[cat] = {
      durationMs: 0,
      count: 0
    };
    byCategory[cat].durationMs += script.duration;
    byCategory[cat].count++;
  });
  const byFile = {};
  allScripts.forEach(script => {
    const file = script.sourceURL.split("/").pop() || "unknown";
    if (!byFile[file]) byFile[file] = {
      duration: 0,
      count: 0,
      category: categorize(script.sourceURL),
      functions: []
    };
    byFile[file].duration += script.duration;
    byFile[file].count++;
    byFile[file].functions.push({
      name: script.sourceFunctionName,
      invoker: script.invoker,
      duration: script.duration
    });
  });
  const topFiles = Object.entries(byFile).sort((a, b) => b[1].duration - a[1].duration).slice(0, 10);
  const totalScript = Object.values(byCategory).reduce((sum, cat) => sum + cat.durationMs, 0);
  const categories = [ {
    name: "Your Code",
    key: "first-party",
    icon: "🔵",
    color: "#3b82f6"
  }, {
    name: "Framework",
    key: "framework",
    icon: "🟣",
    color: "#8b5cf6"
  }, {
    name: "Third-Party",
    key: "third-party",
    icon: "🟠",
    color: "#f59e0b"
  }, {
    name: "Extensions",
    key: "extension",
    icon: "🟤",
    color: "#92400e"
  }, {
    name: "Unknown",
    key: "unknown",
    icon: "⚫",
    color: "#6b7280"
  } ];
  categories.forEach(({name: name, key: key, icon: icon, color: color}) => {
    const data = byCategory[key];
    if (data?.durationMs > 0) {
      const pct = totalScript > 0 ? data.durationMs / totalScript * 100 : 0;
      const barLen = Math.round(pct / 2);
      "█".repeat(barLen), "░".repeat(Math.max(0, 50 - barLen));
    }
  });
  topFiles.forEach(([file, data], idx) => {
    totalScript > 0 && data.duration;
    categories.find(c => c.key === data.category);
    const topFns = data.functions.sort((a, b) => b.duration - a.duration).slice(0, 3);
    if (topFns.length > 0) {
      topFns.forEach((fn, i) => {});
    }
  });
  return {
    script: "Long-Animation-Frames-Script-Attribution",
    status: "ok",
    details: {
      frameCount: frames.length,
      totalBlockingMs: Math.round(totalBlocking),
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [ k, {
        durationMs: Math.round(v.durationMs),
        count: v.count
      } ]))
    },
    items: topFiles.map(([file, data]) => ({
      file: file,
      category: data.category,
      durationMs: Math.round(data.duration),
      count: data.count
    }))
  };
})();
