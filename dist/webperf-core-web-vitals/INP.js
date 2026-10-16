(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    return {
      script: "INP",
      status: "unsupported",
      error: "event entries not supported in this browser"
    };
  }
  let interactions = [];
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
  function uniqueSelector(el) {
    const root = el.getRootNode();
    const matchesOne = selector => {
      try {
        return root.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.id && matchesOne(`#${window.CSS.escape(node.id)}`)) {
        parts.unshift(`#${window.CSS.escape(node.id)}`);
        break;
      }
      const tag = node.localName;
      let part = tag + Array.from(node.classList).slice(0, 2).map(c => `.${window.CSS.escape(c)}`).join("");
      const siblings = node.parentNode ? Array.from(node.parentNode.children) : [ node ];
      if (siblings.filter(s => s.matches(part)).length > 1) part += `:nth-of-type(${siblings.filter(s => s.localName === tag).indexOf(node) + 1})`;
      parts.unshift(part);
      if (matchesOne(parts.join(" > "))) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  const calculateINP = () => {
    if (interactions.length === 0) return {
      value: 0,
      entry: null
    };
    const sorted = [ ...interactions ].sort((a, b) => b.duration - a.duration);
    const totalInteractions = performance.interactionCount || interactions.length;
    const index = Math.min(sorted.length - 1, Math.floor(totalInteractions / 50));
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
  const tracker = createInteractionTracker();
  const addEntries = entries => {
    tracker.add(entries);
    interactions = tracker.list().map(i => ({
      ...i,
      formattedName: getInteractionName(i)
    }));
    const result = calculateINP();
    inpValue = result.value;
    inpEntry = result.entry;
  };
  const observer = new PerformanceObserver(list => addEntries(list.getEntries()));
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
      return {
        script: "INP",
        status: "error",
        error: "No interactions recorded yet. Interact with the page and call getINPDetails() again.",
        count: 0,
        items: []
      };
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
    return {
      script: "INP",
      status: "ok",
      count: sorted.length,
      items: sorted.slice(0, maxToShow).map(i => ({
        formattedName: i.formattedName,
        eventType: i.name,
        target: i.target ? uniqueSelector(i.target) : null,
        duration: Math.round(i.duration),
        startTime: Math.round(i.startTime),
        phases: {
          inputDelay: Math.round(i.phases.inputDelay),
          processingTime: Math.round(i.phases.processingTime),
          presentationDelay: Math.round(i.phases.presentationDelay)
        }
      }))
    };
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      addEntries(observer.takeRecords());
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
