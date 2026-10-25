(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    return {
      script: "Interactions",
      status: "unsupported",
      error: "event entries not supported in this browser"
    };
  }
  const formatMs = ms => `${Math.round(ms)}ms`;
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
  const logged = new Set;
  const observer = new PerformanceObserver(list => {
    for (const interaction of tracker.add(list.getEntries())) {
      const value = interaction.duration;
      const rating = valueToRating(value);
      RATING_ICONS[rating];
      RATING_COLORS[rating];
      logged.has(interaction.interactionId);
      logged.add(interaction.interactionId);
      const {inputDelay: inputDelay, processingTime: processingTime, presentationDelay: presentationDelay} = interaction.phases;
      const total = inputDelay + processingTime + presentationDelay || 1;
      const subParts = [ {
        name: "Input Delay",
        value: inputDelay
      }, {
        name: "Processing Time",
        value: processingTime
      }, {
        name: "Presentation Delay",
        value: presentationDelay
      } ];
      const longest = subParts.reduce((a, b) => a.value > b.value ? a : b);
      subParts.map(part => {
        const percent = (part.value / total * 100).toFixed(0);
        const isLongest = part.name === longest.name;
        return {
          "Sub-part": isLongest ? `⚠️ ${part.name}` : part.name,
          Duration: formatMs(part.value),
          "%": `${percent}%`
        };
      });
      const barWidth = 40;
      "█".repeat(Math.round(inputDelay / total * barWidth));
      "▓".repeat(Math.round(processingTime / total * barWidth));
      "░".repeat(Math.round(presentationDelay / total * barWidth));
      if (rating !== "good") {
        if (longest.name === "Input Delay") {
        } else if (longest.name === "Processing Time") {
        } else {
        }
      }
    }
  });
  observer.observe({
    type: "event",
    durationThreshold: 0,
    buffered: true
  });
  window.getInteractionSummary = () => {
    const allInteractions = tracker.list().map(i => ({
      duration: i.duration,
      rating: valueToRating(i.duration),
      target: i.target,
      type: i.name
    }));
    if (allInteractions.length === 0) {
      return {
        script: "Interactions",
        status: "tracking",
        message: "No interactions yet: click, tap or type on the page, then call getInteractionSummary() again.",
        getDataFn: "getInteractionSummary",
        count: 0
      };
    }
    const durations = allInteractions.map(i => i.duration);
    const worst = Math.max(...durations);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p75 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.75)];
    valueToRating(worst);
    valueToRating(p75);
    allInteractions.filter(i => i.rating === "good").length;
    allInteractions.filter(i => i.rating === "needs-improvement").length;
    allInteractions.filter(i => i.rating === "poor").length;
    const slowInteractions = allInteractions.filter(i => i.rating !== "good");
    if (slowInteractions.length > 0) {
      slowInteractions.forEach((i, idx) => {
        RATING_ICONS[i.rating];
      });
    }
    const byRating = {
      good: allInteractions.filter(i => i.rating === "good").length,
      "needs-improvement": allInteractions.filter(i => i.rating === "needs-improvement").length,
      poor: allInteractions.filter(i => i.rating === "poor").length
    };
    return {
      script: "Interactions",
      status: "ok",
      count: allInteractions.length,
      details: {
        totalInteractions: allInteractions.length,
        worstMs: Math.round(worst),
        avgMs: Math.round(avg),
        p75Ms: Math.round(p75),
        byRating: byRating
      },
      items: [ ...allInteractions ].sort((a, b) => b.duration - a.duration).slice(0, 50).map(i => ({
        type: i.type,
        durationMs: Math.round(i.duration),
        rating: i.rating
      })),
      issues: [ ...slowInteractions ].sort((a, b) => b.duration - a.duration).slice(0, 10).map(i => ({
        code: "slow-interaction",
        severity: i.rating === "poor" ? "error" : "warning",
        message: `${i.type} interaction took ${Math.round(i.duration)}ms (${i.rating}), above the ${i.rating === "poor" ? "500ms" : "200ms"} threshold`,
        target: i.type
      }))
    };
  };
  return {
    script: "Interactions",
    status: "tracking",
    message: "Tracking interactions. Interact with the page then call getInteractionSummary() for results.",
    getDataFn: "getInteractionSummary"
  };
})();
