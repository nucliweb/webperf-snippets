// Interaction Tracking
// https://webperf-snippets.net

(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    console.warn("⚠️ event entries are not supported in this browser.");
    return { script: "Interactions", status: "unsupported", error: "event entries not supported in this browser" };
  }

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

  // @shared createInteractionTracker
  // Groups Event Timing entries by interactionId across observer callbacks, since the entries of one
  // interaction (pointerdown, pointerup, click; keydown, keyup) can arrive in separate batches. Each
  // interaction is measured over its entries painted in the frame of its longest one: Chrome rounds
  // durations to 8 ms, and an event painted in an earlier frame, such as the keydown of a key held
  // down, has its own timing. It is reported under the event whose handler ran longest, or under the
  // click or keydown when no handler took a millisecond more than theirs.
  function createInteractionTracker() {
    const byId = new Map();
    const processing = (e) => e.processingEnd - e.processingStart;
    const measure = (id, entries) => {
      const longest = entries.reduce((a, b) => (b.duration > a.duration ? b : a));
      const paint = longest.startTime + longest.duration;
      const frame = entries.filter((e) => Math.abs(e.startTime + e.duration - paint) <= 8);
      const startTime = Math.min(...frame.map((e) => e.startTime));
      const processingStart = Math.min(...frame.map((e) => e.processingStart));
      const processingEnd = Math.max(...frame.map((e) => e.processingEnd));
      const busiest = frame.reduce((a, b) => (processing(b) > processing(a) ? b : a));
      const primary = frame.find((e) => e.name === "click" || e.name === "keydown");
      const reported = primary && processing(busiest) - processing(primary) < 1 ? primary : busiest;
      return {
        interactionId: id,
        name: reported.name,
        target: reported.target ?? frame.find((e) => e.target)?.target ?? null,
        startTime,
        duration: longest.duration,
        phases: {
          inputDelay: processingStart - startTime,
          processingTime: processingEnd - processingStart,
          presentationDelay: Math.max(0, startTime + longest.duration - processingEnd),
        },
      };
    };
    return {
      // Adds the entries of one observer callback and returns the interactions they changed
      add(entries) {
        const changed = new Set();
        for (const e of entries) {
          if (!e.interactionId) continue;
          const record = byId.get(e.interactionId) ?? { entries: [] };
          record.entries.push({
            name: e.name,
            target: e.target,
            startTime: e.startTime,
            duration: e.duration,
            processingStart: e.processingStart,
            processingEnd: e.processingEnd,
          });
          byId.set(e.interactionId, record);
          changed.add(e.interactionId);
        }
        return [...changed].map((id) => {
          const record = byId.get(id);
          record.summary = measure(id, record.entries);
          return record.summary;
        });
      },
      list() {
        return [...byId.values()].map((record) => record.summary);
      },
    };
  }
  // @end-shared createInteractionTracker

  // One record per interaction for the summary, even when its entries arrive in separate callbacks
  const tracker = createInteractionTracker();
  const logged = new Set();

  const observer = new PerformanceObserver((list) => {
    for (const interaction of tracker.add(list.getEntries())) {
      const value = interaction.duration;
      const rating = valueToRating(value);
      const icon = RATING_ICONS[rating];
      const color = RATING_COLORS[rating];
      const updated = logged.has(interaction.interactionId);
      logged.add(interaction.interactionId);

      // Sub-parts of the whole interaction
      const { inputDelay, processingTime, presentationDelay } = interaction.phases;
      const total = inputDelay + processingTime + presentationDelay || 1;

      // Find longest sub-part
      const subParts = [
        { name: "Input Delay", value: inputDelay },
        { name: "Processing Time", value: processingTime },
        { name: "Presentation Delay", value: presentationDelay },
      ];
      const longest = subParts.reduce((a, b) => (a.value > b.value ? a : b));

      console.groupCollapsed(
        `%c${icon} Interaction${updated ? " (updated)" : ""}: ${formatMs(value)} (${rating})`,
        `font-weight: bold; color: ${color};`
      );

      // Target info
      console.log("%cTarget:", "font-weight: bold;", interaction.target);
      console.log(`   Event type: ${interaction.name}`);

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
    const allInteractions = tracker.list().map((i) => ({
      duration: i.duration,
      rating: valueToRating(i.duration),
      target: i.target,
      type: i.name,
    }));
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
      `   Worst (approximates INP): %c${formatMs(worst)} (${worstRating})`,
      `color: ${RATING_COLORS[worstRating]};`
    );
    console.log(
      `   P75: %c${formatMs(p75)} (${p75Rating})`,
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
        worstMs: Math.round(worst),
        avgMs: Math.round(avg),
        p75Ms: Math.round(p75),
        byRating,
      },
      // Slowest first, at most 50
      items: [...allInteractions]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 50)
        .map((i) => ({
          type: i.type,
          durationMs: Math.round(i.duration),
          rating: i.rating,
        })),
      issues: [...slowInteractions]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .map((i) => ({
          code: "slow-interaction",
          severity: i.rating === "poor" ? "error" : "warning",
          message: `${i.type} interaction took ${Math.round(i.duration)}ms (${i.rating}), above the ${i.rating === "poor" ? "500ms" : "200ms"} threshold`,
          target: i.type,
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
