(() => {
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
  const allInteractions = [];
  const observer = new PerformanceObserver(list => {
    const interactions = {};
    for (const entry of list.getEntries().filter(entry => entry.interactionId)) {
      interactions[entry.interactionId] = interactions[entry.interactionId] || [];
      interactions[entry.interactionId].push(entry);
    }
    for (const interaction of Object.values(interactions)) {
      const entry = interaction.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
      const value = entry.duration;
      const rating = valueToRating(value);
      RATING_ICONS[rating];
      RATING_COLORS[rating];
      allInteractions.push({
        duration: value,
        rating: rating,
        target: entry.target,
        type: entry.name
      });
      const inputDelay = entry.processingStart - entry.startTime;
      const processingTime = entry.processingEnd - entry.processingStart;
      const presentationDelay = Math.max(4, entry.startTime + entry.duration - entry.processingEnd);
      const total = inputDelay + processingTime + presentationDelay;
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
    if (allInteractions.length === 0) {
      return {
        script: "Interactions",
        status: "error",
        error: "No interactions recorded yet",
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
        severity: i.rating === "poor" ? "error" : "warning",
        message: `${i.type} interaction took ${Math.round(i.duration)}ms (${i.rating}), above the ${i.rating === "poor" ? "500ms" : "200ms"} threshold`
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
