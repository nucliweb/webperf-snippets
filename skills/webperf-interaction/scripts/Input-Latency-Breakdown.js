// Input Latency Breakdown
// https://webperf-snippets.nucliweb.net

(() => {
  const formatMs = (ms) => `${Math.round(ms)}ms`;

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

  // Interactions grouped by event type
  const byEventType = {};

  const observer = new PerformanceObserver((list) => {
    // Group entries by interactionId; keep the longest entry per interaction
    const interactions = {};

    for (const entry of list.getEntries().filter((e) => e.interactionId)) {
      interactions[entry.interactionId] =
        interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }

    for (const group of Object.values(interactions)) {
      const entry = group.reduce((prev, curr) =>
        prev.duration >= curr.duration ? prev : curr
      );

      const eventType = entry.name; // "click", "keydown", "pointerdown", etc.
      const inputDelay = entry.processingStart - entry.startTime;
      const processingTime = entry.processingEnd - entry.processingStart;
      const presentationDelay = Math.max(
        4,
        entry.startTime + entry.duration - entry.processingEnd
      );

      if (!byEventType[eventType]) {
        byEventType[eventType] = {
          count: 0,
          durations: [],
          inputDelays: [],
          processingTimes: [],
          presentationDelays: [],
        };
      }

      const bucket = byEventType[eventType];
      bucket.count++;
      bucket.durations.push(entry.duration);
      bucket.inputDelays.push(inputDelay);
      bucket.processingTimes.push(processingTime);
      bucket.presentationDelays.push(presentationDelay);
    }
  });

  observer.observe({ type: "event", durationThreshold: 0, buffered: true });

  const p75 = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return (
      sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1]
    );
  };

  window.getInputLatencyBreakdown = () => {
    const types = Object.keys(byEventType);

    if (types.length === 0) {
      console.log("%c⌨️ No interactions recorded yet.", "font-weight: bold;");
      console.log(
        "   Interact with the page (click, type, etc.) and call this again."
      );
      return;
    }

    console.group(
      "%c⌨️ Input Latency Breakdown by Event Type",
      "font-weight: bold; font-size: 14px;"
    );

    for (const eventType of types.sort()) {
      const b = byEventType[eventType];

      const p75Total = p75(b.durations);
      const p75InputDelay = p75(b.inputDelays);
      const p75Processing = p75(b.processingTimes);
      const p75Presentation = p75(b.presentationDelays);
      const p75Sum = p75InputDelay + p75Processing + p75Presentation;

      const phases = [
        { name: "Input Delay", value: p75InputDelay },
        { name: "Processing", value: p75Processing },
        { name: "Presentation", value: p75Presentation },
      ];
      const bottleneck = phases.reduce((a, b) => (a.value > b.value ? a : b));

      const rating = valueToRating(p75Total);
      const icon = RATING_ICONS[rating];
      const color = RATING_COLORS[rating];

      console.log(
        `%c${icon} ${eventType}%c (${b.count} interaction${b.count > 1 ? "s" : ""})  P75: ${formatMs(p75Total)}   Input Delay: ${formatMs(p75InputDelay)}  Processing: ${formatMs(p75Processing)}  Presentation: ${formatMs(p75Presentation)}`,
        `font-weight: bold; color: ${color};`,
        "color: inherit;"
      );

      // Visual distribution bar based on P75 phase values
      const barWidth = 36;
      const inputBar = "█".repeat(
        Math.max(1, Math.round((p75InputDelay / p75Sum) * barWidth))
      );
      const procBar = "▓".repeat(
        Math.max(1, Math.round((p75Processing / p75Sum) * barWidth))
      );
      const presBar = "░".repeat(
        Math.max(1, Math.round((p75Presentation / p75Sum) * barWidth))
      );
      console.log(`   ${inputBar}${procBar}${presBar}`);
      console.log(
        `   █ Input Delay (${((p75InputDelay / p75Sum) * 100).toFixed(0)}%)  ` +
          `▓ Processing (${((p75Processing / p75Sum) * 100).toFixed(0)}%)  ` +
          `░ Presentation (${((p75Presentation / p75Sum) * 100).toFixed(0)}%)`
      );

      if (rating !== "good") {
        console.log(
          `   ⚠️ Bottleneck: ${bottleneck.name} — `,
          bottleneck.name === "Input Delay"
            ? "break up long tasks blocking the main thread (scheduler.yield(), setTimeout)"
            : bottleneck.name === "Processing"
            ? "optimize event handlers or consider debouncing"
            : "reduce DOM changes or avoid layout thrashing after the handler"
        );
      }

      console.log("");
    }

    // Highlight the event type with the highest P75
    const worstType = types.reduce((a, b) =>
      p75(byEventType[a].durations) >= p75(byEventType[b].durations) ? a : b
    );
    const worstP75 = p75(byEventType[worstType].durations);

    if (valueToRating(worstP75) !== "good") {
      console.log(
        `%c🎯 Highest latency: ${worstType} (P75: ${formatMs(worstP75)})`,
        "font-weight: bold; color: #ef4444;"
      );
    }

    console.groupEnd();
  };

  console.log(
    "%c⌨️ Input Latency Breakdown Active",
    "font-weight: bold; font-size: 14px;"
  );
  console.log("   Interact with the page (click, type, etc.).");
  console.log(
    "   Call %cgetInputLatencyBreakdown()%c for the aggregated report.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );
})();
