// Input Latency Breakdown
// https://webperf-snippets.net

(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    console.warn("⚠️ event entries are not supported in this browser.");
    return { script: "Input-Latency-Breakdown", status: "unsupported", error: "event entries not supported in this browser" };
  }

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

  // One record per interaction, even when its entries arrive in separate callbacks
  const tracker = createInteractionTracker();
  const observer = new PerformanceObserver((list) => tracker.add(list.getEntries()));
  observer.observe({ type: "event", durationThreshold: 0, buffered: true });

  // Interactions grouped by event type: "click", "keydown", "pointerdown", etc.
  const groupByEventType = () => {
    const byEventType = {};
    for (const { name, duration, phases } of tracker.list()) {
      if (!byEventType[name]) {
        byEventType[name] = {
          count: 0,
          durations: [],
          inputDelays: [],
          processingTimes: [],
          presentationDelays: [],
        };
      }
      const bucket = byEventType[name];
      bucket.count++;
      bucket.durations.push(duration);
      bucket.inputDelays.push(phases.inputDelay);
      bucket.processingTimes.push(phases.processingTime);
      bucket.presentationDelays.push(phases.presentationDelay);
    }
    return byEventType;
  };

  const p75 = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return (
      sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1]
    );
  };

  window.getInputLatencyBreakdown = () => {
    const byEventType = groupByEventType();
    const types = Object.keys(byEventType);

    if (types.length === 0) {
      console.log("%c⌨️ No interactions recorded yet.", "font-weight: bold;");
      console.log(
        "   Interact with the page (click, type, etc.) and call this again."
      );
      return {
        script: "Input-Latency-Breakdown",
        status: "error",
        error: "No interactions recorded yet. Interact with the page (click, type, etc.) and call getInputLatencyBreakdown() again.",
        getDataFn: "getInputLatencyBreakdown",
      };
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
      const p75Sum = p75InputDelay + p75Processing + p75Presentation || 1;

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

    const typeSummary = {};
    for (const [type, b] of Object.entries(byEventType)) {
      typeSummary[type] = {
        count: b.count,
        p75Ms: Math.round(p75(b.durations)),
        inputDelayMs: Math.round(p75(b.inputDelays)),
        processingMs: Math.round(p75(b.processingTimes)),
        presentationMs: Math.round(p75(b.presentationDelays)),
      };
    }
    console.groupEnd();

    const BOTTLENECK_FIXES = {
      "Input Delay": "break up the long tasks that block the main thread (scheduler.yield(), setTimeout)",
      Processing: "optimize the event handlers or debounce them",
      Presentation: "reduce the DOM changes after the handler and avoid layout thrashing",
    };

    const items = types.map((type) => {
      const b = byEventType[type];
      return {
        type,
        count: b.count,
        p75Ms: Math.round(p75(b.durations)),
        inputDelayMs: Math.round(p75(b.inputDelays)),
        processingMs: Math.round(p75(b.processingTimes)),
        presentationMs: Math.round(p75(b.presentationDelays)),
        rating: valueToRating(p75(b.durations)),
      };
    });

    const issues = types
      .filter((type) => valueToRating(p75(byEventType[type].durations)) !== "good")
      .map((type) => {
        const b = byEventType[type];
        const phases = [
          { name: "Input Delay", value: p75(b.inputDelays) },
          { name: "Processing", value: p75(b.processingTimes) },
          { name: "Presentation", value: p75(b.presentationDelays) },
        ];
        const bottleneck = phases.reduce((a, c) => (a.value > c.value ? a : c));
        const rating = valueToRating(p75(b.durations));
        return {
          code: "slow-event-type",
          severity: rating === "poor" ? "error" : "warning",
          message: `${type} P75 is ${Math.round(p75(b.durations))}ms (${rating}). Bottleneck: ${bottleneck.name}. Fix: ${BOTTLENECK_FIXES[bottleneck.name]}.`,
          target: type,
        };
      });

    return {
      script: "Input-Latency-Breakdown",
      status: "ok",
      count: types.length,
      details: { eventTypes: typeSummary },
      items,
      issues,
    };
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

  return {
    script: "Input-Latency-Breakdown",
    status: "tracking",
    message: "Tracking input latency by event type. Interact with the page then call getInputLatencyBreakdown().",
    getDataFn: "getInputLatencyBreakdown",
  };
})();
