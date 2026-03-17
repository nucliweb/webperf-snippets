(() => {
  const interactions = [];
  let inpValue = 0;
  let inpEntry = null;
  const valueToRating = ms => ms <= 200 ? "good" : ms <= 500 ? "needs-improvement" : "poor";
  const RATING = {
    good: {
      icon: "🟢",
      color: "#0CCE6A"
    },
    "needs-improvement": {
      icon: "🟡",
      color: "#FFA400"
    },
    poor: {
      icon: "🔴",
      color: "#FF4E42"
    }
  };
  const calculateINP = () => {
    if (interactions.length === 0) return {
      value: 0,
      entry: null
    };
    const sorted = [ ...interactions ].sort((a, b) => b.duration - a.duration);
    const index = interactions.length < 50 ? 0 : Math.floor(interactions.length * 0.02);
    return {
      value: sorted[index].duration,
      entry: sorted[index]
    };
  };
  const getInteractionName = entry => {
    const target = entry.target;
    if (!target) return entry.name;
    let selector = target.tagName.toLowerCase();
    if (target.id) selector += `#${target.id}`; else if (target.className && typeof target.className === "string") {
      const classes = target.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) selector += `.${classes}`;
    }
    return `${entry.name} → ${selector}`;
  };
  const getPhaseBreakdown = entry => {
    const phases = {
      inputDelay: 0,
      processingTime: 0,
      presentationDelay: 0
    };
    if (entry.processingStart && entry.processingEnd) {
      phases.inputDelay = entry.processingStart - entry.startTime;
      phases.processingTime = entry.processingEnd - entry.processingStart;
      phases.presentationDelay = entry.duration - phases.inputDelay - phases.processingTime;
    }
    return phases;
  };
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (!entry.interactionId) continue;
      const existing = interactions.find(i => i.interactionId === entry.interactionId);
      if (!existing || entry.duration > existing.duration) {
        if (existing) {
          const idx = interactions.indexOf(existing);
          interactions.splice(idx, 1);
        }
        interactions.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
          interactionId: entry.interactionId,
          target: entry.target,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          formattedName: getInteractionName(entry),
          phases: getPhaseBreakdown(entry),
          entry: entry
        });
      }
      const result = calculateINP();
      inpValue = result.value;
      inpEntry = result.entry;
    }
  });
  observer.observe({
    type: "event",
    buffered: true,
    durationThreshold: 16
  });
  const logINP = () => {
    const rating = valueToRating(inpValue);
    const {icon: icon, color: color} = RATING[rating];
    if (inpEntry) {
      if (inpEntry.target) {
        const getElementPath = el => {
          if (!el) return "";
          const parts = [];
          let current = el;
          while (current && current !== document.body && parts.length < 5) {
            let selector = current.tagName.toLowerCase();
            if (current.id) selector += `#${current.id}`; else if (current.className && typeof current.className === "string") {
              const classes = current.className.trim().split(/\s+/).slice(0, 2).join(".");
              if (classes) selector += `.${classes}`;
            }
            parts.unshift(selector);
            current = current.parentElement;
          }
          return parts.join(" > ");
        };
        const path = getElementPath(inpEntry.target);
        if (path) void 0;
      }
      const phases = inpEntry.phases;
      if (phases.inputDelay > 0) {
        const total = inpEntry.duration;
        const barWidth = 40;
        "▓".repeat(Math.round(phases.inputDelay / total * barWidth));
        "█".repeat(Math.round(phases.processingTime / total * barWidth));
        "░".repeat(Math.round(phases.presentationDelay / total * barWidth));
      }
      if (inpValue > 200 && phases.inputDelay > 0) {
        if (phases.inputDelay > 100) void 0;
        if (phases.processingTime > 200) {
        }
        if (phases.presentationDelay > 100) {
        }
      }
    }
    const slowInteractions = interactions.filter(i => i.duration > 200).sort((a, b) => b.duration - a.duration).slice(0, 10);
    if (slowInteractions.length > 0) {
      slowInteractions.slice(0, 3).forEach((interaction, idx) => {
        if (interaction.target) void 0; else void 0;
      });
    }
    const byType = {};
    interactions.forEach(i => {
      const type = i.name;
      if (!byType[type]) byType[type] = {
        count: 0,
        totalDuration: 0,
        maxDuration: 0
      };
      byType[type].count++;
      byType[type].totalDuration += i.duration;
      byType[type].maxDuration = Math.max(byType[type].maxDuration, i.duration);
    });
    if (Object.keys(byType).length > 0) {
    }
    if (inpValue > 200 && (!inpEntry || !inpEntry.phases || inpEntry.phases.inputDelay === 0)) {
    }
  };
  window.getINP = () => {
    const result = calculateINP();
    inpValue = result.value;
    inpEntry = result.entry;
    logINP();
    const rating = valueToRating(inpValue);
    const details = {
      totalInteractions: interactions.length
    };
    if (inpEntry) {
      details.worstEvent = inpEntry.formattedName;
      details.phases = {
        inputDelay: Math.round(inpEntry.phases.inputDelay),
        processingTime: Math.round(inpEntry.phases.processingTime),
        presentationDelay: Math.round(inpEntry.phases.presentationDelay)
      };
    }
    if (interactions.length === 0) return {
      script: "INP",
      status: "error",
      error: "No interactions recorded yet. Interact with the page and call getINP() again.",
      getDataFn: "getINP",
      details: details
    };
    return {
      script: "INP",
      status: "ok",
      metric: "INP",
      value: Math.round(inpValue),
      unit: "ms",
      rating: rating,
      thresholds: {
        good: 200,
        needsImprovement: 500
      },
      details: details
    };
  };
  window.getINPDetails = () => {
    if (interactions.length === 0) {
      return [];
    }
    const sorted = [ ...interactions ].sort((a, b) => b.duration - a.duration);
    const maxToShow = Math.min(sorted.length, 15);
    sorted.slice(0, maxToShow).forEach((interaction, idx) => {
      const phases = interaction.phases;
      const hasPhases = phases.inputDelay > 0;
      if (interaction.target) {
        const getPath = el => {
          if (!el) return "";
          const parts = [];
          let current = el;
          while (current && current !== document.body && parts.length < 5) {
            let selector = current.tagName.toLowerCase();
            if (current.id) selector += `#${current.id}`; else if (current.className && typeof current.className === "string") {
              const classes = current.className.trim().split(/\s+/).slice(0, 2).join(".");
              if (classes) selector += `.${classes}`;
            }
            parts.unshift(selector);
            current = current.parentElement;
          }
          return parts.join(" > ");
        };
        const path = getPath(interaction.target);
        if (path) void 0;
      } else void 0;
      if (hasPhases) void 0;
    });
    if (sorted.length > maxToShow) void 0;
    return sorted;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      const result = calculateINP();
      inpValue = result.value;
      inpEntry = result.entry;
      logINP();
    }
  });
  return {
    script: "INP",
    status: "tracking",
    message: "INP tracking active. Interact with the page then call getINP() for results.",
    getDataFn: "getINP"
  };
})();
