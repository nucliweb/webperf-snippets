(() => {
  const valueToRating = score => score <= 200 ? "good" : score <= 500 ? "needs-improvement" : "poor";
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
  const byEventType = {};
  const observer = new PerformanceObserver(list => {
    const interactions = {};
    for (const entry of list.getEntries().filter(e => e.interactionId)) {
      interactions[entry.interactionId] = interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }
    for (const group of Object.values(interactions)) {
      const entry = group.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
      const eventType = entry.name;
      const inputDelay = entry.processingStart - entry.startTime;
      const processingTime = entry.processingEnd - entry.processingStart;
      const presentationDelay = Math.max(4, entry.startTime + entry.duration - entry.processingEnd);
      if (!byEventType[eventType]) byEventType[eventType] = {
        count: 0,
        durations: [],
        inputDelays: [],
        processingTimes: [],
        presentationDelays: []
      };
      const bucket = byEventType[eventType];
      bucket.count++;
      bucket.durations.push(entry.duration);
      bucket.inputDelays.push(inputDelay);
      bucket.processingTimes.push(processingTime);
      bucket.presentationDelays.push(presentationDelay);
    }
  });
  observer.observe({
    type: "event",
    durationThreshold: 0,
    buffered: true
  });
  const p75 = arr => {
    const sorted = [ ...arr ].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];
  };
  window.getInputLatencyBreakdown = () => {
    const types = Object.keys(byEventType);
    if (types.length === 0) {
      return;
    }
    for (const eventType of types.sort()) {
      const b = byEventType[eventType];
      const p75Total = p75(b.durations);
      const p75InputDelay = p75(b.inputDelays);
      const p75Processing = p75(b.processingTimes);
      const p75Presentation = p75(b.presentationDelays);
      const p75Sum = p75InputDelay + p75Processing + p75Presentation;
      const phases = [ {
        name: "Input Delay",
        value: p75InputDelay
      }, {
        name: "Processing",
        value: p75Processing
      }, {
        name: "Presentation",
        value: p75Presentation
      } ];
      phases.reduce((a, b) => a.value > b.value ? a : b);
      const rating = valueToRating(p75Total);
      RATING_ICONS[rating];
      RATING_COLORS[rating];
      const barWidth = 36;
      "█".repeat(Math.max(1, Math.round(p75InputDelay / p75Sum * barWidth)));
      "▓".repeat(Math.max(1, Math.round(p75Processing / p75Sum * barWidth)));
      "░".repeat(Math.max(1, Math.round(p75Presentation / p75Sum * barWidth)));
      if (rating !== "good") void 0;
    }
    const worstType = types.reduce((a, b) => p75(byEventType[a].durations) >= p75(byEventType[b].durations) ? a : b);
    const worstP75 = p75(byEventType[worstType].durations);
    if (valueToRating(worstP75) !== "good") void 0;
    const typeSummary = {};
    for (const [type, b] of Object.entries(byEventType)) typeSummary[type] = {
      count: b.count,
      p75Ms: Math.round(p75(b.durations)),
      inputDelayMs: Math.round(p75(b.inputDelays)),
      processingMs: Math.round(p75(b.processingTimes)),
      presentationMs: Math.round(p75(b.presentationDelays))
    };
    return {
      script: "Input-Latency-Breakdown",
      status: "ok",
      count: types.length,
      details: {
        eventTypes: typeSummary
      }
    };
  };
  return {
    script: "Input-Latency-Breakdown",
    status: "tracking",
    message: "Tracking input latency by event type. Interact with the page then call getInputLatencyBreakdown().",
    getDataFn: "getInputLatencyBreakdown"
  };
})();
