// Long Animation Frames Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const formatMs = (ms) => `${Math.round(ms)}ms`;

  // Rating based on blocking duration
  const valueToRating = (blockingDuration) =>
    blockingDuration === 0 ? "good" : blockingDuration <= 100 ? "needs-improvement" : "poor";

  const RATING_COLORS = {
    good: "#0CCE6A",
    "needs-improvement": "#FFA400",
    poor: "#FF4E42",
  };

  const RATING_ICONS = {
    good: "🟢",
    "needs-improvement": "🟡",
    poor: "🔴",
  };

  // Track all LoAFs and events
  const allLoAFs = [];
  const allEvents = [];

  const getScriptSummary = (script) => {
    const invoker = script.invoker || script.name || "(anonymous)";
    const source = script.sourceURL
      ? script.sourceURL.split("/").pop()?.split("?")[0] || script.sourceURL
      : "";
    return { invoker, source, type: script.invokerType || "unknown" };
  };

  const processLoAF = (entry) => {
    const endTime = entry.startTime + entry.duration;

    // Calculate derived metrics
    const workDuration = entry.renderStart
      ? entry.renderStart - entry.startTime
      : entry.duration;

    const renderDuration = entry.renderStart
      ? endTime - entry.renderStart
      : 0;

    const styleAndLayoutDuration = entry.styleAndLayoutStart
      ? endTime - entry.styleAndLayoutStart
      : 0;

    const totalForcedStyleAndLayout = entry.scripts.reduce(
      (sum, script) => sum + (script.forcedStyleAndLayoutDuration || 0),
      0
    );

    // Process scripts
    const scripts = entry.scripts.map((script) => ({
      ...getScriptSummary(script),
      duration: Math.round(script.duration),
      execDuration: Math.round(script.executionStart
        ? script.startTime + script.duration - script.executionStart
        : script.duration),
      forcedStyleAndLayout: Math.round(script.forcedStyleAndLayoutDuration || 0),
      startTime: Math.round(script.startTime),
    }));

    return {
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      blockingDuration: Math.round(entry.blockingDuration),
      workDuration: Math.round(workDuration),
      renderDuration: Math.round(renderDuration),
      styleAndLayoutDuration: Math.round(styleAndLayoutDuration),
      totalForcedStyleAndLayout: Math.round(totalForcedStyleAndLayout),
      scripts,
      entry,
    };
  };

  const overlap = (e1, e2) =>
    e1.startTime < e2.startTime + e2.duration &&
    e2.startTime < e1.startTime + e1.duration;

  // LoAF Observer
  const loafObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const processed = processLoAF(entry);
      allLoAFs.push(processed);

      // Only log frames with blocking duration
      if (entry.blockingDuration > 0) {
        const rating = valueToRating(entry.blockingDuration);
        const icon = RATING_ICONS[rating];
        const color = RATING_COLORS[rating];

        console.groupCollapsed(
          `%c${icon} Long Animation Frame: ${formatMs(entry.duration)} (blocking: ${formatMs(entry.blockingDuration)})`,
          `font-weight: bold; color: ${color};`
        );

        // Time breakdown
        console.log("%cTime Breakdown:", "font-weight: bold;");
        const breakdown = [
          { Phase: "Work (JS)", Duration: formatMs(processed.workDuration) },
          { Phase: "Render", Duration: formatMs(processed.renderDuration) },
          { Phase: "Style & Layout", Duration: formatMs(processed.styleAndLayoutDuration) },
        ];
        console.table(breakdown);

        // Visual bar
        const total = processed.duration;
        const barWidth = 40;
        const workBar = "█".repeat(Math.round((processed.workDuration / total) * barWidth));
        const renderBar = "░".repeat(Math.round((processed.renderDuration / total) * barWidth));
        console.log(`   ${workBar}${renderBar}`);
        console.log("   █ Work  ░ Render");

        // Forced style/layout warning
        if (processed.totalForcedStyleAndLayout > 0) {
          console.log("");
          console.log(
            `%c⚠️ Forced style/layout: ${formatMs(processed.totalForcedStyleAndLayout)}`,
            "color: #ef4444; font-weight: bold;"
          );
        }

        // Scripts
        if (processed.scripts.length > 0) {
          console.log("");
          console.log("%cScripts:", "font-weight: bold;");

          const scriptTable = processed.scripts.map((s) => ({
            Invoker: s.invoker.length > 40 ? s.invoker.slice(0, 37) + "..." : s.invoker,
            Type: s.type,
            Duration: formatMs(s.duration),
            "Forced S&L": s.forcedStyleAndLayout > 0 ? formatMs(s.forcedStyleAndLayout) : "-",
            Source: s.source.length > 25 ? "..." + s.source.slice(-22) : s.source,
          }));
          console.table(scriptTable);
        }

        // Find overlapping events (interactions during this frame)
        const overlappingEvents = allEvents.filter((e) => overlap(e, entry));
        if (overlappingEvents.length > 0) {
          console.log("");
          console.log("%c👆 Interactions during this frame:", "font-weight: bold;");
          overlappingEvents.forEach((e) => {
            console.log(`   ${e.name}: ${formatMs(e.duration)}`);
          });
        }

        console.groupEnd();
      }
    }
  });

  // Event Observer (for correlation)
  const eventObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.interactionId) {
        allEvents.push(entry);
      }
    }
  });

  loafObserver.observe({ type: "long-animation-frame", buffered: true });
  eventObserver.observe({ type: "event", buffered: true });

  // Summary function
  window.getLoAFSummary = () => {
    console.group("%c📊 Long Animation Frames Summary", "font-weight: bold; font-size: 14px;");

    if (allLoAFs.length === 0) {
      console.log("   No long animation frames recorded.");
      console.groupEnd();
      return;
    }

    const blocking = allLoAFs.filter((l) => l.blockingDuration > 0);
    const totalBlocking = blocking.reduce((sum, l) => sum + l.blockingDuration, 0);
    const worstBlocking = Math.max(...allLoAFs.map((l) => l.blockingDuration));
    const avgDuration = allLoAFs.reduce((sum, l) => sum + l.duration, 0) / allLoAFs.length;

    // Statistics
    console.log("");
    console.log("%cStatistics:", "font-weight: bold;");
    console.log(`   Total LoAFs: ${allLoAFs.length}`);
    console.log(`   With blocking time: ${blocking.length}`);
    console.log(`   Total blocking time: ${formatMs(totalBlocking)}`);
    console.log(`   Worst blocking: ${formatMs(worstBlocking)}`);
    console.log(`   Average duration: ${formatMs(avgDuration)}`);

    // Script analysis
    const scriptStats = new Map();
    allLoAFs.forEach((loaf) => {
      loaf.scripts.forEach((script) => {
        const key = `${script.invoker}|${script.source}`;
        if (!scriptStats.has(key)) {
          scriptStats.set(key, {
            invoker: script.invoker,
            source: script.source,
            count: 0,
            totalDuration: 0,
            totalForcedSL: 0,
          });
        }
        const stats = scriptStats.get(key);
        stats.count++;
        stats.totalDuration += script.duration;
        stats.totalForcedSL += script.forcedStyleAndLayout;
      });
    });

    if (scriptStats.size > 0) {
      console.log("");
      console.log("%c🎯 Top Scripts by Total Duration:", "font-weight: bold; color: #ef4444;");

      const topScripts = Array.from(scriptStats.values())
        .sort((a, b) => b.totalDuration - a.totalDuration)
        .slice(0, 10);

      const scriptTable = topScripts.map((s) => ({
        Invoker: s.invoker.length > 35 ? s.invoker.slice(0, 32) + "..." : s.invoker,
        Count: s.count,
        "Total Duration": formatMs(s.totalDuration),
        "Forced S&L": s.totalForcedSL > 0 ? formatMs(s.totalForcedSL) : "-",
        Source: s.source.length > 20 ? "..." + s.source.slice(-17) : s.source,
      }));
      console.table(scriptTable);
    }

    // Forced style/layout analysis
    const forcedSLTotal = allLoAFs.reduce((sum, l) => sum + l.totalForcedStyleAndLayout, 0);
    if (forcedSLTotal > 0) {
      console.log("");
      console.log(
        `%c⚠️ Total forced style/layout: ${formatMs(forcedSLTotal)}`,
        "color: #ef4444; font-weight: bold;"
      );
      console.log("   This indicates layout thrashing - reading layout after writing to DOM.");
    }

    // Recommendations
    if (worstBlocking > 50) {
      console.log("");
      console.log("%c💡 Recommendations:", "font-weight: bold; color: #3b82f6;");
      console.log("   • Break up long tasks using scheduler.yield() or setTimeout");
      console.log("   • Move heavy computation to Web Workers");
      console.log("   • Avoid forced synchronous layouts (read before write)");
      console.log("   • Defer non-critical work with requestIdleCallback");
    }

    console.groupEnd();

    return {
      total: allLoAFs.length,
      withBlocking: blocking.length,
      totalBlockingTime: totalBlocking,
      worstBlocking,
      topScripts: Array.from(scriptStats.values())
        .sort((a, b) => b.totalDuration - a.totalDuration)
        .slice(0, 5),
    };
  };

  console.log("%c🎬 Long Animation Frames Tracking Active", "font-weight: bold; font-size: 14px;");
  console.log("   Frames with blocking duration will be logged.");
  console.log(
    "   Call %cgetLoAFSummary()%c for full analysis.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );
})();
