// INP (Interaction to Next Paint) Tracking
// https://webperf-snippets.net

(() => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("event")) {
    console.warn("⚠️ event entries are not supported in this browser.");
    return { script: "INP", status: "unsupported", error: "event entries not supported in this browser" };
  }
  let interactions = [];
  let inpValue = 0;
  let inpEntry = null;

  const valueToRating = (ms) =>
    ms <= 200 ? "good" : ms <= 500 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const formatMs = (ms) => `${Math.round(ms)}ms`;

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

  // @shared uniqueSelector
  // A CSS selector that matches only el in its document (or shadow root): its id when it is unique,
  // otherwise a path of tag, classes and :nth-of-type() that goes up to the nearest ancestor with a
  // unique id, or to the root, and stops as soon as it matches one element.
  function uniqueSelector(el) {
    const root = el.getRootNode();
    const matchesOne = (selector) => {
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
      let part = tag + Array.from(node.classList).slice(0, 2).map((c) => `.${window.CSS.escape(c)}`).join("");
      const siblings = node.parentNode ? Array.from(node.parentNode.children) : [node];
      if (siblings.filter((s) => s.matches(part)).length > 1) {
        part += `:nth-of-type(${siblings.filter((s) => s.localName === tag).indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (matchesOne(parts.join(" > "))) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  // @end-shared uniqueSelector

  // Calculate INP (98th percentile of all interactions)
  const calculateINP = () => {
    if (interactions.length === 0) return { value: 0, entry: null };

    // Sort by duration
    const sorted = [...interactions].sort((a, b) => b.duration - a.duration);

    // Skip one interaction for every 50. Use the browser's total interaction count when
    // available: `interactions` only holds those above the duration threshold.
    const totalInteractions = performance.interactionCount || interactions.length;
    const index = Math.min(sorted.length - 1, Math.floor(totalInteractions / 50));

    return {
      value: sorted[index].duration,
      entry: sorted[index],
    };
  };

  // Format interaction name
  const getInteractionName = (entry) => {
    const target = entry.target;
    if (!target) return entry.name;

    let selector = target.tagName.toLowerCase();
    if (target.id) selector += `#${target.id}`;
    else if (target.className && typeof target.className === "string") {
      const classes = target.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) selector += `.${classes}`;
    }

    return `${entry.name} → ${selector}`;
  };

  // One record per interaction (interactionId), with its phases measured over all its entries
  const tracker = createInteractionTracker();
  const addEntries = (entries) => {
    tracker.add(entries);
    interactions = tracker.list().map((i) => ({ ...i, formattedName: getInteractionName(i) }));
    const result = calculateINP();
    inpValue = result.value;
    inpEntry = result.entry;
  };

  // Observer for interactions
  const observer = new PerformanceObserver((list) => addEntries(list.getEntries()));

  // Observe event timing
  observer.observe({
    type: "event",
    buffered: true,
    durationThreshold: 16, // Only interactions > 16ms (1 frame)
  });

  // Log INP summary
  const logINP = () => {
    const rating = valueToRating(inpValue);
    const { icon, color } = RATING[rating];

    console.group(
      `%cINP: ${icon} ${formatMs(inpValue)} (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    console.log("");
    console.log(`%c📊 Analysis:`, "font-weight: bold;");
    console.log(`   Total interactions tracked: ${interactions.length}`);
    console.log(`   INP (98th percentile): ${formatMs(inpValue)}`);

    if (inpEntry) {
      console.log("");
      console.log(`%c🎯 Worst Interaction (INP):`, `font-weight: bold; color: ${color};`);
      console.log(`   Event: ${inpEntry.formattedName}`);
      console.log(`   Duration: ${formatMs(inpEntry.duration)}`);

      // Element attribution
      if (inpEntry.target) {
        console.log(`   Target Element:`, inpEntry.target);

        // Get element path for better context
        const getElementPath = (el) => {
          if (!el) return "";
          const parts = [];
          let current = el;
          while (current && current !== document.body && parts.length < 5) {
            let selector = current.tagName.toLowerCase();
            if (current.id) selector += `#${current.id}`;
            else if (current.className && typeof current.className === "string") {
              const classes = current.className.trim().split(/\s+/).slice(0, 2).join(".");
              if (classes) selector += `.${classes}`;
            }
            parts.unshift(selector);
            current = current.parentElement;
          }
          return parts.join(" > ");
        };

        const path = getElementPath(inpEntry.target);
        if (path) {
          console.log(`   Element Path: ${path}`);
        }
      }

      // Phase breakdown
      const phases = inpEntry.phases;
      if (phases.inputDelay > 0) {
        console.log("");
        console.log(`%c⏱️ Phase Breakdown:`, "font-weight: bold;");
        console.log(`   Input Delay: ${formatMs(phases.inputDelay)}`);
        console.log(`   Processing Time: ${formatMs(phases.processingTime)}`);
        console.log(`   Presentation Delay: ${formatMs(phases.presentationDelay)}`);

        // Visual bar
        const total = inpEntry.duration;
        const barWidth = 40;
        const inputBar = "▓".repeat(Math.round((phases.inputDelay / total) * barWidth));
        const processBar = "█".repeat(Math.round((phases.processingTime / total) * barWidth));
        const presentBar = "░".repeat(Math.round((phases.presentationDelay / total) * barWidth));
        console.log(`   ${inputBar}${processBar}${presentBar}`);
        console.log("   ▓ Input  █ Processing  ░ Presentation");
      }

      // Recommendations based on phases
      if (inpValue > 200 && phases.inputDelay > 0) {
        console.log("");
        console.log("%c💡 Recommendations:", "color: #3b82f6; font-weight: bold;");

        if (phases.inputDelay > 100) {
          console.log("   • High input delay - Break up long tasks before interaction");
        }
        if (phases.processingTime > 200) {
          console.log("   • Long processing time - Optimize event handlers");
          console.log("   • Consider debouncing, use requestIdleCallback for non-critical work");
        }
        if (phases.presentationDelay > 100) {
          console.log("   • High presentation delay - Reduce render complexity");
          console.log("   • Batch DOM updates, use content-visibility");
        }
      }
    }

    // Slow interactions breakdown
    const slowInteractions = interactions
      .filter((i) => i.duration > 200)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    if (slowInteractions.length > 0) {
      console.log("");
      console.log(`%c🐌 Slow Interactions (> 200ms):`, "color: #ef4444; font-weight: bold;");
      console.table(
        slowInteractions.map((i) => ({
          Event: i.formattedName,
          "Duration (ms)": Math.round(i.duration),
          "Start Time (ms)": Math.round(i.startTime),
        }))
      );

      // Show element attribution for top 3
      console.log("");
      console.log(`%c🎯 Element Attribution (top 3):`, "font-weight: bold;");
      slowInteractions.slice(0, 3).forEach((interaction, idx) => {
        console.log(`   ${idx + 1}. ${interaction.formattedName} (${Math.round(interaction.duration)}ms)`);
        if (interaction.target) {
          console.log(`      Element:`, interaction.target);
        } else {
          console.log(`      Element: (no target available)`);
        }
      });
    }

    // Interaction types breakdown
    const byType = {};
    interactions.forEach((i) => {
      const type = i.name;
      if (!byType[type]) {
        byType[type] = { count: 0, totalDuration: 0, maxDuration: 0 };
      }
      byType[type].count++;
      byType[type].totalDuration += i.duration;
      byType[type].maxDuration = Math.max(byType[type].maxDuration, i.duration);
    });

    if (Object.keys(byType).length > 0) {
      console.log("");
      console.log(`%c📋 By Interaction Type:`, "font-weight: bold;");
      console.table(
        Object.entries(byType).map(([type, stats]) => ({
          Type: type,
          Count: stats.count,
          "Avg (ms)": Math.round(stats.totalDuration / stats.count),
          "Max (ms)": Math.round(stats.maxDuration),
        }))
      );
    }

    // General recommendations if no phases available
    if (inpValue > 200 && (!inpEntry || !inpEntry.phases || inpEntry.phases.inputDelay === 0)) {
      console.log("");
      console.log("%c💡 Recommendations:", "color: #3b82f6; font-weight: bold;");
      console.log("   • Break up long tasks using scheduler.yield() or setTimeout");
      console.log("   • Optimize event handlers - reduce computation time");
      console.log("   • Consider debouncing for frequent events");
      console.log("   • Move heavy work to Web Workers");
      console.log("   • Use requestIdleCallback for non-critical work");

      console.log("");
      console.log("   Run getINPDetails() for full interaction list");
      console.log("   Use Long Animation Frames snippet to identify blocking scripts");
    }

    console.groupEnd();
  };

  // Expose function to check INP anytime
  window.getINP = () => {
    const result = calculateINP();
    inpValue = result.value;
    inpEntry = result.entry;
    logINP();
    const rating = valueToRating(inpValue);
    const details = { totalInteractions: interactions.length };
    if (inpEntry) {
      details.worstEvent = inpEntry.formattedName;
      details.phases = {
        inputDelay: Math.round(inpEntry.phases.inputDelay),
        processingTime: Math.round(inpEntry.phases.processingTime),
        presentationDelay: Math.round(inpEntry.phases.presentationDelay),
      };
    }
    if (interactions.length === 0) {
      return {
        script: "INP",
        status: "error",
        error: "No interactions recorded yet. Interact with the page and call getINP() again.",
        getDataFn: "getINP",
        details,
      };
    }
    return {
      script: "INP",
      status: "ok",
      metric: "INP",
      value: Math.round(inpValue),
      unit: "ms",
      rating,
      thresholds: { good: 200, needsImprovement: 500 },
      details,
    };
  };

  // Expose function to get all interactions
  window.getINPDetails = () => {
    console.group("%c📊 All Interactions Detail", "font-weight: bold; font-size: 14px;");

    if (interactions.length === 0) {
      console.log("   No interactions recorded yet.");
      console.groupEnd();
      return {
        script: "INP",
        status: "error",
        error: "No interactions recorded yet. Interact with the page and call getINPDetails() again.",
        count: 0,
        items: [],
      };
    }

    const sorted = [...interactions].sort((a, b) => b.duration - a.duration);

    console.log("");
    console.log("%cInteraction Summary:", "font-weight: bold;");
    console.table(
      sorted.map((i, idx) => ({
        "#": idx + 1,
        Event: i.formattedName,
        "Duration (ms)": Math.round(i.duration),
        "Start (ms)": Math.round(i.startTime),
        "Input Delay": Math.round(i.phases.inputDelay),
        Processing: Math.round(i.phases.processingTime),
        Presentation: Math.round(i.phases.presentationDelay),
      }))
    );

    // Show element attribution for all interactions
    console.log("");
    console.log("%c🎯 Element Attribution:", "font-weight: bold;");

    const maxToShow = Math.min(sorted.length, 15); // Show up to 15
    sorted.slice(0, maxToShow).forEach((interaction, idx) => {
      const phases = interaction.phases;
      const hasPhases = phases.inputDelay > 0;

      console.group(
        `${idx + 1}. ${interaction.formattedName} - ${Math.round(interaction.duration)}ms`
      );

      if (interaction.target) {
        console.log("Element:", interaction.target);

        // Get element path for better identification
        const getPath = (el) => {
          if (!el) return "";
          const parts = [];
          let current = el;
          while (current && current !== document.body && parts.length < 5) {
            let selector = current.tagName.toLowerCase();
            if (current.id) selector += `#${current.id}`;
            else if (current.className && typeof current.className === "string") {
              const classes = current.className.trim().split(/\s+/).slice(0, 2).join(".");
              if (classes) selector += `.${classes}`;
            }
            parts.unshift(selector);
            current = current.parentElement;
          }
          return parts.join(" > ");
        };

        const path = getPath(interaction.target);
        if (path) {
          console.log("Path:", path);
        }
      } else {
        console.log("Element: (no target available)");
      }

      if (hasPhases) {
        console.log(
          `Phases: Input ${Math.round(phases.inputDelay)}ms | ` +
          `Processing ${Math.round(phases.processingTime)}ms | ` +
          `Presentation ${Math.round(phases.presentationDelay)}ms`
        );
      }

      console.groupEnd();
    });

    if (sorted.length > maxToShow) {
      console.log(`   ... and ${sorted.length - maxToShow} more interactions`);
    }

    console.groupEnd();
    // The 15 slowest, as plain data: the target is a selector, not the element
    return {
      script: "INP",
      status: "ok",
      count: sorted.length,
      items: sorted.slice(0, maxToShow).map((i) => ({
        formattedName: i.formattedName,
        eventType: i.name,
        target: i.target ? uniqueSelector(i.target) : null,
        duration: Math.round(i.duration),
        startTime: Math.round(i.startTime),
        phases: {
          inputDelay: Math.round(i.phases.inputDelay),
          processingTime: Math.round(i.phases.processingTime),
          presentationDelay: Math.round(i.phases.presentationDelay),
        },
      })),
    };
  };

  // Log on page hide (final INP)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      addEntries(observer.takeRecords());

      console.log("%c📊 Final INP (on page hide):", "font-weight: bold;");
      logINP();
    }
  });

  console.log("%c⚡ INP Tracking Active", "font-weight: bold; font-size: 14px;");
  console.log("   Interactions with duration > 16ms will be tracked.");
  console.log(
    "   Call %cgetINP()%c to see current INP value.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );
  console.log(
    "   Call %cgetINPDetails()%c for full interaction list.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );

  return {
    script: "INP",
    status: "tracking",
    message: "INP tracking active. Interact with the page then call getINP() for results.",
    getDataFn: "getINP",
  };
})();
