// Long Animation Frames - Script Attribution Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  // Check browser support
  if (!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {
    console.log("%c⚠️ Long Animation Frames not supported", "color: #f59e0b; font-weight: bold;");
    console.log("Chrome 116+ required.");
    return { script: "Long-Animation-Frames-Script-Attribution", status: "unsupported", error: "long-animation-frame not supported. Chrome 116+ required." };
  }

  // Read buffered LoAF entries immediately
  const frames = performance.getEntriesByType("long-animation-frame").map((entry) => ({
    duration: entry.duration,
    blockingDuration: entry.blockingDuration || 0,
    scripts: (entry.scripts || []).map((s) => ({
      sourceURL: s.sourceURL || "unknown",
      sourceFunctionName: s.sourceFunctionName || "anonymous",
      invoker: s.invoker || "unknown",
      duration: s.duration || 0,
    })),
  }));

  if (frames.length === 0) {
    console.log("%c✅ No long frames detected", "color: #22c55e; font-weight: bold;");
    return { script: "Long-Animation-Frames-Script-Attribution", status: "ok",
      details: { frameCount: 0, totalBlockingMs: 0, byCategory: {} }, items: [] };
  }

  const allScripts = frames.flatMap((f) => f.scripts);
  const totalBlocking = frames.reduce((sum, f) => sum + f.blockingDuration, 0);
  const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0);

  const categorize = (url) => {
    const u = url.toLowerCase();
    const origin = location.origin.toLowerCase();
    if (u === "" || u === "unknown") return "unknown";
    if (["react", "vue", "angular", "svelte", "framework", "chunk", "webpack", "vite"].some((fw) => u.includes(fw))) return "framework";
    if (["google-analytics", "gtag", "gtm", "analytics", "facebook", "twitter", "ads", "cdn", "unpkg", "jsdelivr", "segment", "amplitude"].some((tp) => u.includes(tp))) return "third-party";
    if (u.startsWith("chrome-extension://") || u.startsWith("moz-extension://")) return "extension";
    if (u.startsWith("http") && !u.includes(origin.replace(/^https?:\/\//, ""))) return "third-party";
    return "first-party";
  };

  const byCategory = {};
  allScripts.forEach((script) => {
    const cat = categorize(script.sourceURL);
    if (!byCategory[cat]) byCategory[cat] = { durationMs: 0, count: 0 };
    byCategory[cat].durationMs += script.duration;
    byCategory[cat].count++;
  });

  const byFile = {};
  allScripts.forEach((script) => {
    const file = script.sourceURL.split("/").pop() || "unknown";
    if (!byFile[file]) byFile[file] = { duration: 0, count: 0, category: categorize(script.sourceURL), functions: [] };
    byFile[file].duration += script.duration;
    byFile[file].count++;
    byFile[file].functions.push({ name: script.sourceFunctionName, invoker: script.invoker, duration: script.duration });
  });

  const topFiles = Object.entries(byFile).sort((a, b) => b[1].duration - a[1].duration).slice(0, 10);
  const totalScript = Object.values(byCategory).reduce((sum, cat) => sum + cat.durationMs, 0);

  const categories = [
    { name: "Your Code", key: "first-party", icon: "🔵", color: "#3b82f6" },
    { name: "Framework", key: "framework", icon: "🟣", color: "#8b5cf6" },
    { name: "Third-Party", key: "third-party", icon: "🟠", color: "#f59e0b" },
    { name: "Extensions", key: "extension", icon: "🟤", color: "#92400e" },
    { name: "Unknown", key: "unknown", icon: "⚫", color: "#6b7280" },
  ];

  console.log("%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "color: #6b7280;");
  console.log("%c📊 Blocking Time by Category", "font-weight: bold; font-size: 13px;");
  console.log("");

  categories.forEach(({ name, key, icon, color }) => {
    const data = byCategory[key];
    if (data?.durationMs > 0) {
      const pct = totalScript > 0 ? (data.durationMs / totalScript) * 100 : 0;
      const barLen = Math.round(pct / 2);
      const bar = "█".repeat(barLen) + "░".repeat(Math.max(0, 50 - barLen));
      console.log(
        `%c${icon} ${name.padEnd(12)} %c${bar} %c${pct.toFixed(1)}% %c(${data.durationMs.toFixed(0)}ms, ${data.count} scripts)`,
        `color: ${color}; font-weight: bold;`, `color: ${color};`, `color: ${color}; font-weight: bold;`, "color: #6b7280;",
      );
    }
  });

  console.log("");
  console.log(`%cTotal Script: ${totalScript.toFixed(0)}ms | Blocking: ${totalBlocking.toFixed(0)}ms | Duration: ${totalDuration.toFixed(0)}ms`, "color: #6b7280;");
  console.log(`%cFrames captured: ${frames.length}`, "color: #6b7280;");

  console.log("");
  console.log("%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "color: #6b7280;");
  console.log("%c🔥 Top 10 Blocking Scripts", "font-weight: bold; font-size: 13px;");
  console.log("");

  topFiles.forEach(([file, data], idx) => {
    const pct = totalScript > 0 ? (data.duration / totalScript) * 100 : 0;
    const icon = categories.find((c) => c.key === data.category)?.icon || "⚫";
    console.group(
      `%c${idx + 1}. ${icon} ${file} %c(${data.duration.toFixed(0)}ms, ${pct.toFixed(1)}%)`,
      "font-weight: bold;", "color: #6b7280;",
    );
    console.log(`Category: ${data.category}`);
    console.log(`Executions: ${data.count}`);
    console.log(`Avg duration: ${(data.duration / data.count).toFixed(0)}ms`);
    const topFns = data.functions.sort((a, b) => b.duration - a.duration).slice(0, 3);
    if (topFns.length > 0) {
      console.log("Top functions:");
      topFns.forEach((fn, i) => console.log(`  ${i + 1}. ${fn.name} (${fn.duration.toFixed(0)}ms) - ${fn.invoker}`));
    }
    console.groupEnd();
  });

  console.log("");
  console.log("%c✅ Analysis complete!", "color: #22c55e; font-weight: bold;");

  return {
    script: "Long-Animation-Frames-Script-Attribution",
    status: "ok",
    details: {
      frameCount: frames.length,
      totalBlockingMs: Math.round(totalBlocking),
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, { durationMs: Math.round(v.durationMs), count: v.count }])
      ),
    },
    items: topFiles.map(([file, data]) => ({
      file,
      category: data.category,
      durationMs: Math.round(data.duration),
      count: data.count,
    })),
  };
})();
