(() => {
  const formatMs = ms => `${Math.round(ms)}ms`;
  const valueToRating = blockingDuration => blockingDuration === 0 ? "good" : blockingDuration <= 100 ? "needs-improvement" : "poor";
  const RATING_COLORS = {
    good: "#0CCE6A",
    "needs-improvement": "#FFA400",
    poor: "#FF4E42"
  };
  const RATING_ICONS = {
    good: "🟢",
    "needs-improvement": "🟡",
    poor: "🔴"
  };
  const allLoAFs = [];
  const allEvents = [];
  const getScriptSummary = script => {
    const invoker = script.invoker || script.name || "(anonymous)";
    const source = script.sourceURL ? script.sourceURL.split("/").pop()?.split("?")[0] || script.sourceURL : "";
    return {
      invoker: invoker,
      source: source,
      type: script.invokerType || "unknown"
    };
  };
  const processLoAF = entry => {
    const endTime = entry.startTime + entry.duration;
    const workDuration = entry.renderStart ? entry.renderStart - entry.startTime : entry.duration;
    const renderDuration = entry.renderStart ? endTime - entry.renderStart : 0;
    const styleAndLayoutDuration = entry.styleAndLayoutStart ? endTime - entry.styleAndLayoutStart : 0;
    const totalForcedStyleAndLayout = entry.scripts.reduce((sum, script) => sum + (script.forcedStyleAndLayoutDuration || 0), 0);
    const scripts = entry.scripts.map(script => ({
      ...getScriptSummary(script),
      duration: Math.round(script.duration),
      execDuration: Math.round(script.executionStart ? script.startTime + script.duration - script.executionStart : script.duration),
      forcedStyleAndLayout: Math.round(script.forcedStyleAndLayoutDuration || 0),
      startTime: Math.round(script.startTime)
    }));
    return {
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      blockingDuration: Math.round(entry.blockingDuration),
      workDuration: Math.round(workDuration),
      renderDuration: Math.round(renderDuration),
      styleAndLayoutDuration: Math.round(styleAndLayoutDuration),
      totalForcedStyleAndLayout: Math.round(totalForcedStyleAndLayout),
      scripts: scripts,
      entry: entry
    };
  };
  const overlap = (e1, e2) => e1.startTime < e2.startTime + e2.duration && e2.startTime < e1.startTime + e1.duration;
  const loafObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const processed = processLoAF(entry);
      allLoAFs.push(processed);
      if (entry.blockingDuration > 0) {
        const rating = valueToRating(entry.blockingDuration);
        RATING_ICONS[rating];
        RATING_COLORS[rating];
        formatMs(processed.workDuration), formatMs(processed.renderDuration), formatMs(processed.styleAndLayoutDuration);
        const total = processed.duration;
        const barWidth = 40;
        "█".repeat(Math.round(processed.workDuration / total * barWidth));
        "░".repeat(Math.round(processed.renderDuration / total * barWidth));
        if (processed.totalForcedStyleAndLayout > 0) {
        }
        if (processed.scripts.length > 0) {
          processed.scripts.map(s => ({
            Invoker: s.invoker.length > 40 ? s.invoker.slice(0, 37) + "..." : s.invoker,
            Type: s.type,
            Duration: formatMs(s.duration),
            "Forced S&L": s.forcedStyleAndLayout > 0 ? formatMs(s.forcedStyleAndLayout) : "-",
            Source: s.source.length > 25 ? "..." + s.source.slice(-22) : s.source
          }));
        }
        const overlappingEvents = allEvents.filter(e => overlap(e, entry));
        if (overlappingEvents.length > 0) {
          overlappingEvents.forEach(e => {
          });
        }
      }
    }
  });
  const eventObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (entry.interactionId) allEvents.push(entry);
  });
  loafObserver.observe({
    type: "long-animation-frame",
    buffered: true
  });
  eventObserver.observe({
    type: "event",
    buffered: true
  });
  window.getLoAFSummary = () => {
    if (allLoAFs.length === 0) {
      return;
    }
    const blocking = allLoAFs.filter(l => l.blockingDuration > 0);
    const totalBlocking = blocking.reduce((sum, l) => sum + l.blockingDuration, 0);
    const worstBlocking = Math.max(...allLoAFs.map(l => l.blockingDuration));
    allLoAFs.reduce((sum, l) => sum + l.duration, 0), allLoAFs.length;
    const scriptStats = new Map;
    allLoAFs.forEach(loaf => {
      loaf.scripts.forEach(script => {
        const key = `${script.invoker}|${script.source}`;
        if (!scriptStats.has(key)) scriptStats.set(key, {
          invoker: script.invoker,
          source: script.source,
          count: 0,
          totalDuration: 0,
          totalForcedSL: 0
        });
        const stats = scriptStats.get(key);
        stats.count++;
        stats.totalDuration += script.duration;
        stats.totalForcedSL += script.forcedStyleAndLayout;
      });
    });
    if (scriptStats.size > 0) {
      const topScripts = Array.from(scriptStats.values()).sort((a, b) => b.totalDuration - a.totalDuration).slice(0, 10);
      topScripts.map(s => ({
        Invoker: s.invoker.length > 35 ? s.invoker.slice(0, 32) + "..." : s.invoker,
        Count: s.count,
        "Total Duration": formatMs(s.totalDuration),
        "Forced S&L": s.totalForcedSL > 0 ? formatMs(s.totalForcedSL) : "-",
        Source: s.source.length > 20 ? "..." + s.source.slice(-17) : s.source
      }));
    }
    const forcedSLTotal = allLoAFs.reduce((sum, l) => sum + l.totalForcedStyleAndLayout, 0);
    if (forcedSLTotal > 0) {
    }
    if (worstBlocking > 50) {
    }
    return {
      script: "Long-Animation-Frames",
      status: "ok",
      count: allLoAFs.length,
      details: {
        totalLoAFs: allLoAFs.length,
        withBlockingTime: blocking.length,
        totalBlockingTimeMs: Math.round(totalBlocking),
        worstBlockingMs: Math.round(worstBlocking),
        topScripts: Array.from(scriptStats.values()).sort((a, b) => b.totalDuration - a.totalDuration).slice(0, 5).map(s => ({
          invoker: s.invoker,
          source: s.source,
          totalDurationMs: Math.round(s.totalDuration),
          count: s.count
        }))
      }
    };
  };
  const loafBuffered = performance.getEntriesByType("long-animation-frame");
  const blockingLoafs = loafBuffered.filter(e => e.blockingDuration > 0);
  const totalBlockingSync = blockingLoafs.reduce((sum, e) => sum + e.blockingDuration, 0);
  const worstBlockingSync = loafBuffered.length > 0 ? Math.max(...loafBuffered.map(e => e.blockingDuration)) : 0;
  return {
    script: "Long-Animation-Frames",
    status: "tracking",
    count: loafBuffered.length,
    details: {
      totalLoAFs: loafBuffered.length,
      withBlockingTime: blockingLoafs.length,
      totalBlockingTimeMs: Math.round(totalBlockingSync),
      worstBlockingMs: Math.round(worstBlockingSync)
    },
    message: "Tracking long animation frames. Call getLoAFSummary() for full script attribution.",
    getDataFn: "getLoAFSummary"
  };
})();
