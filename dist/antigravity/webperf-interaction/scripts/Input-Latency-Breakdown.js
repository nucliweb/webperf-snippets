(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    return {
      script: "Input-Latency-Breakdown",
      status: "unsupported",
      error: "event entries not supported in this browser"
    };
  }
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
  function createInteractionTracker() {
    const byId = new Map;
    const processing = e => e.processingEnd - e.processingStart;
    const measure = (id, entries) => {
      const longest = entries.reduce((a, b) => b.duration > a.duration ? b : a);
      const paint = longest.startTime + longest.duration;
      const frame = entries.filter(e => Math.abs(e.startTime + e.duration - paint) <= 8);
      const startTime = Math.min(...frame.map(e => e.startTime));
      const processingStart = Math.min(...frame.map(e => e.processingStart));
      const processingEnd = Math.max(...frame.map(e => e.processingEnd));
      const busiest = frame.reduce((a, b) => processing(b) > processing(a) ? b : a);
      const primary = frame.find(e => e.name === "click" || e.name === "keydown");
      const reported = primary && processing(busiest) - processing(primary) < 1 ? primary : busiest;
      return {
        interactionId: id,
        name: reported.name,
        target: reported.target ?? frame.find(e => e.target)?.target ?? null,
        startTime: startTime,
        duration: longest.duration,
        phases: {
          inputDelay: processingStart - startTime,
          processingTime: processingEnd - processingStart,
          presentationDelay: Math.max(0, startTime + longest.duration - processingEnd)
        }
      };
    };
    return {
      add(entries) {
        const changed = new Set;
        for (const e of entries) {
          if (!e.interactionId) continue;
          const record = byId.get(e.interactionId) ?? {
            entries: []
          };
          record.entries.push({
            name: e.name,
            target: e.target,
            startTime: e.startTime,
            duration: e.duration,
            processingStart: e.processingStart,
            processingEnd: e.processingEnd
          });
          byId.set(e.interactionId, record);
          changed.add(e.interactionId);
        }
        return [ ...changed ].map(id => {
          const record = byId.get(id);
          record.summary = measure(id, record.entries);
          return record.summary;
        });
      },
      list() {
        return [ ...byId.values() ].map(record => record.summary);
      }
    };
  }
  const tracker = createInteractionTracker();
  const observer = new PerformanceObserver(list => tracker.add(list.getEntries()));
  observer.observe({
    type: "event",
    durationThreshold: 0,
    buffered: true
  });
  const groupByEventType = () => {
    const byEventType = {};
    for (const {name: name, duration: duration, phases: phases} of tracker.list()) {
      if (!byEventType[name]) byEventType[name] = {
        count: 0,
        durations: [],
        inputDelays: [],
        processingTimes: [],
        presentationDelays: []
      };
      const bucket = byEventType[name];
      bucket.count++;
      bucket.durations.push(duration);
      bucket.inputDelays.push(phases.inputDelay);
      bucket.processingTimes.push(phases.processingTime);
      bucket.presentationDelays.push(phases.presentationDelay);
    }
    return byEventType;
  };
  const p75 = arr => {
    const sorted = [ ...arr ].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];
  };
  window.getInputLatencyBreakdown = () => {
    const byEventType = groupByEventType();
    const types = Object.keys(byEventType);
    if (types.length === 0) {
      return {
        script: "Input-Latency-Breakdown",
        status: "error",
        error: "No interactions recorded yet. Interact with the page (click, type, etc.) and call getInputLatencyBreakdown() again.",
        getDataFn: "getInputLatencyBreakdown"
      };
    }
    for (const eventType of types.sort()) {
      const b = byEventType[eventType];
      const p75Total = p75(b.durations);
      const p75InputDelay = p75(b.inputDelays);
      const p75Processing = p75(b.processingTimes);
      const p75Presentation = p75(b.presentationDelays);
      const p75Sum = p75InputDelay + p75Processing + p75Presentation || 1;
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
    const BOTTLENECK_FIXES = {
      "Input Delay": "break up the long tasks that block the main thread (scheduler.yield(), setTimeout)",
      Processing: "optimize the event handlers or debounce them",
      Presentation: "reduce the DOM changes after the handler and avoid layout thrashing"
    };
    const items = types.map(type => {
      const b = byEventType[type];
      return {
        type: type,
        count: b.count,
        p75Ms: Math.round(p75(b.durations)),
        inputDelayMs: Math.round(p75(b.inputDelays)),
        processingMs: Math.round(p75(b.processingTimes)),
        presentationMs: Math.round(p75(b.presentationDelays)),
        rating: valueToRating(p75(b.durations))
      };
    });
    const issues = types.filter(type => valueToRating(p75(byEventType[type].durations)) !== "good").map(type => {
      const b = byEventType[type];
      const phases = [ {
        name: "Input Delay",
        value: p75(b.inputDelays)
      }, {
        name: "Processing",
        value: p75(b.processingTimes)
      }, {
        name: "Presentation",
        value: p75(b.presentationDelays)
      } ];
      const bottleneck = phases.reduce((a, c) => a.value > c.value ? a : c);
      const rating = valueToRating(p75(b.durations));
      return {
        severity: rating === "poor" ? "error" : "warning",
        message: `${type} P75 is ${Math.round(p75(b.durations))}ms (${rating}). Bottleneck: ${bottleneck.name}. Fix: ${BOTTLENECK_FIXES[bottleneck.name]}.`
      };
    });
    return {
      script: "Input-Latency-Breakdown",
      status: "ok",
      count: types.length,
      details: {
        eventTypes: typeSummary
      },
      items: items,
      issues: issues
    };
  };
  return {
    script: "Input-Latency-Breakdown",
    status: "tracking",
    message: "Tracking input latency by event type. Interact with the page then call getInputLatencyBreakdown().",
    getDataFn: "getInputLatencyBreakdown"
  };
})();
