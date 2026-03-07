// Interaction Tracking
// https://webperf-snippets.nucliweb.net

(() => {
  const formatMs = (ms) => `${Math.round(ms)}ms`;

  // INP thresholds
  const valueToRating = (score) =>
    score <= 200 ? "good" : score <= 500 ? "needs-improvement" : "poor";

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

  // Track all interactions for summary
  const allInteractions = [];

  const observer = new PerformanceObserver((list) => {
    const interactions = {};

    for (const entry of list
      .getEntries()
      .filter((entry) => entry.interactionId)) {
      interactions[entry.interactionId] = interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }

    for (const interaction of Object.values(interactions)) {
      const entry = interaction.reduce((prev, curr) =>
        prev.duration >= curr.duration ? prev : curr
      );

      const value = entry.duration;
      const rating = valueToRating(value);
      const icon = RATING_ICONS[rating];
      const color = RATING_COLORS[rating];

      // Store for summary
      allInteractions.push({
        duration: value,
        rating,
        target: entry.target,
        type: entry.name,
      });

      // Calculate sub-parts
      const inputDelay = entry.processingStart - entry.startTime;
      const processingTime = entry.processingEnd - entry.processingStart;
      const presentationDelay = Math.max(
        4,
        entry.startTime + entry.duration - entry.processingEnd
      );
      const total = inputDelay + processingTime + presentationDelay;

      // Find longest sub-part
      const subParts = [
        { name: "Input Delay", value: inputDelay },
        { name: "Processing Time", value: processingTime },
        { name: "Presentation Delay", value: presentationDelay },
      ];
      const longest = subParts.reduce((a, b) => (a.value > b.value ? a : b));

      console.groupCollapsed(
        `%c${icon} Interaction: ${formatMs(value)} (${rating})`,
        `font-weight: bold; color: ${color};`
      );

      // Target info
      console.log("%cTarget:", "font-weight: bold;", entry.target);
      console.log(`   Event type: ${entry.name}`);

      // Sub-parts breakdown
      console.log("");
      console.log("%cSub-parts breakdown:", "font-weight: bold;");

      const tableData = subParts.map((part) => {
        const percent = ((part.value / total) * 100).toFixed(0);
        const isLongest = part.name === longest.name;
        return {
          "Sub-part": isLongest ? `⚠️ ${part.name}` : part.name,
          Duration: formatMs(part.value),
          "%": `${percent}%`,
        };
      });

      console.table(tableData);

      // Visual bar
      const barWidth = 40;
      const inputBar = "█".repeat(Math.round((inputDelay / total) * barWidth));
      const procBar = "▓".repeat(Math.round((processingTime / total) * barWidth));
      const presBar = "░".repeat(Math.round((presentationDelay / total) * barWidth));
      console.log(`   ${inputBar}${procBar}${presBar}`);
      console.log("   █ Input  ▓ Processing  ░ Presentation");

      // Recommendation if slow
      if (rating !== "good") {
        console.log("");
        console.log("%c💡 Optimization hint:", "font-weight: bold; color: #3b82f6;");
        if (longest.name === "Input Delay") {
          console.log("   Break up long tasks blocking the main thread");
          console.log("   Use requestIdleCallback or setTimeout for non-critical work");
        } else if (longest.name === "Processing Time") {
          console.log("   Optimize event handlers, reduce JavaScript complexity");
          console.log("   Consider debouncing or using web workers");
        } else {
          console.log("   Reduce DOM size or complexity of updates");
          console.log("   Avoid forced synchronous layouts");
        }
      }

      console.groupEnd();
    }
  });

  observer.observe({
    type: "event",
    durationThreshold: 0,
    buffered: true,
  });

  // Summary function
  window.getInteractionSummary = () => {
    if (allInteractions.length === 0) {
      console.log("%c📊 No interactions recorded yet.", "font-weight: bold;");
      console.log("   Interact with the page (click, type, etc.) and call this again.");
      return { script: "Interactions", status: "error", error: "No interactions recorded yet", count: 0 };
    }

    console.group("%c📊 Interaction Summary", "font-weight: bold; font-size: 14px;");

    const durations = allInteractions.map((i) => i.duration);
    const worst = Math.max(...durations);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p75 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.75)];

    const worstRating = valueToRating(worst);
    const p75Rating = valueToRating(p75);

    console.log("");
    console.log("%cStatistics:", "font-weight: bold;");
    console.log(`   Total interactions: ${allInteractions.length}`);
    console.log(
      `   Worst: %c${formatMs(worst)} (${worstRating})`,
      `color: ${RATING_COLORS[worstRating]};`
    );
    console.log(
      `   P75 (INP): %c${formatMs(p75)} (${p75Rating})`,
      `color: ${RATING_COLORS[p75Rating]};`
    );
    console.log(`   Average: ${formatMs(avg)}`);

    // Rating breakdown
    const good = allInteractions.filter((i) => i.rating === "good").length;
    const needsImprovement = allInteractions.filter(
      (i) => i.rating === "needs-improvement"
    ).length;
    const poor = allInteractions.filter((i) => i.rating === "poor").length;

    console.log("");
    console.log("%cBy rating:", "font-weight: bold;");
    console.log(`   🟢 Good (≤200ms): ${good}`);
    console.log(`   🟡 Needs Improvement (≤500ms): ${needsImprovement}`);
    console.log(`   🔴 Poor (>500ms): ${poor}`);

    // Slow interactions
    const slowInteractions = allInteractions.filter((i) => i.rating !== "good");
    if (slowInteractions.length > 0) {
      console.log("");
      console.log("%c⚠️ Slow interactions:", "font-weight: bold; color: #ef4444;");
      slowInteractions.forEach((i, idx) => {
        const icon = RATING_ICONS[i.rating];
        console.log(`   ${idx + 1}. ${icon} ${i.type} - ${formatMs(i.duration)}`, i.target);
      });
    }

    const durations2 = allInteractions.map((i) => i.duration);
    const worst2 = Math.max(...durations2);
    const avg2 = Math.round(durations2.reduce((a, b) => a + b, 0) / durations2.length);
    const p75 = Math.round(durations2.sort((a, b) => a - b)[Math.floor(durations2.length * 0.75)]);
    const byRating = {
      good: allInteractions.filter((i) => i.rating === "good").length,
      "needs-improvement": allInteractions.filter((i) => i.rating === "needs-improvement").length,
      poor: allInteractions.filter((i) => i.rating === "poor").length,
    };
    console.groupEnd();
    return {
      script: "Interactions",
      status: "ok",
      count: allInteractions.length,
      details: {
        totalInteractions: allInteractions.length,
        worstMs: Math.round(worst2),
        avgMs: avg2,
        p75Ms: p75,
        byRating,
      },
      items: allInteractions.map((i) => ({
        type: i.type,
        durationMs: Math.round(i.duration),
        rating: i.rating,
      })),
    };
  };

  console.log("%c👆 Interaction Tracking Active", "font-weight: bold; font-size: 14px;");
  console.log("   Interact with the page to see interaction details.");
  console.log("   Call %cgetInteractionSummary()%c for a summary.", "font-family: monospace; background: #f3f4f6; padding: 2px 4px;", "");

  return {
    script: "Interactions",
    status: "tracking",
    message: "Tracking interactions. Interact with the page then call getInteractionSummary() for results.",
    getDataFn: "getInteractionSummary",
  };
})();
