(() => {
  "use strict";
  if (!("PerformanceObserver" in window) || !PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    return {
      script: "Long-Animation-Frames-Helpers",
      status: "unsupported",
      error: "Long Animation Frames API not supported. Requires Chrome 123+"
    };
  }
  const capturedFrames = [];
  const getSeverity = duration => {
    if (duration > 200) return {
      level: "critical",
      icon: "🔴"
    };
    if (duration > 150) return {
      level: "high",
      icon: "🟠"
    };
    if (duration > 100) return {
      level: "medium",
      icon: "🟡"
    };
    return {
      level: "low",
      icon: "🟢"
    };
  };
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const frameData = {
        startTime: entry.startTime,
        duration: entry.duration,
        renderStart: entry.renderStart,
        styleAndLayoutStart: entry.styleAndLayoutStart,
        firstUIEventTimestamp: entry.firstUIEventTimestamp,
        blockingDuration: entry.blockingDuration,
        scripts: entry.scripts.map(s => ({
          sourceURL: s.sourceURL || "",
          sourceFunctionName: s.sourceFunctionName || "(anonymous)",
          invoker: s.invoker || "",
          invokerType: s.invokerType || "",
          duration: s.duration,
          executionStart: s.executionStart,
          forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration || 0
        }))
      };
      capturedFrames.push(frameData);
    }
  });
  try {
    observer.observe({
      type: "long-animation-frame",
      buffered: true
    });
  } catch (e) {
    return {
      script: "Long-Animation-Frames-Helpers",
      status: "error",
      error: e.message
    };
  }
  window.loafHelpers = {
    summary() {
      if (capturedFrames.length === 0) {
        return;
      }
      capturedFrames.reduce((sum, f) => sum + f.duration, 0);
      capturedFrames.reduce((sum, f) => sum + f.blockingDuration, 0);
      capturedFrames.length;
      Math.max(...capturedFrames.map(f => f.duration));
      capturedFrames.filter(f => f.duration > 200).length, capturedFrames.filter(f => f.duration > 150 && f.duration <= 200).length, 
      capturedFrames.filter(f => f.duration > 100 && f.duration <= 150).length, capturedFrames.filter(f => f.duration <= 100).length;
    },
    topScripts(n = 10) {
      if (capturedFrames.length === 0) {
        return;
      }
      const allScripts = capturedFrames.flatMap(f => f.scripts);
      if (allScripts.length === 0) {
        return;
      }
      const scriptStats = new Map;
      allScripts.forEach(s => {
        const key = `${s.sourceURL}|${s.sourceFunctionName}`;
        if (!scriptStats.has(key)) scriptStats.set(key, {
          sourceURL: s.sourceURL,
          functionName: s.sourceFunctionName,
          totalDuration: 0,
          count: 0,
          maxDuration: 0,
          totalForcedLayout: 0
        });
        const stats = scriptStats.get(key);
        stats.totalDuration += s.duration;
        stats.count++;
        stats.maxDuration = Math.max(stats.maxDuration, s.duration);
        stats.totalForcedLayout += s.forcedStyleAndLayoutDuration;
      });
      const sorted = Array.from(scriptStats.values()).sort((a, b) => b.totalDuration - a.totalDuration).slice(0, n);
      sorted.map(s => {
        let path = s.sourceURL;
        try {
          path = new URL(s.sourceURL || location.href).pathname;
          if (path.length > 40) path = "..." + path.slice(-37);
        } catch {}
        return {
          Script: path || "(inline)",
          Function: s.functionName.length > 25 ? s.functionName.slice(0, 22) + "..." : s.functionName,
          Count: s.count,
          Total: `${s.totalDuration.toFixed(0)}ms`,
          Max: `${s.maxDuration.toFixed(0)}ms`,
          "Forced S&L": s.totalForcedLayout > 0 ? `${s.totalForcedLayout.toFixed(0)}ms` : "-"
        };
      });
      return sorted;
    },
    filter(options = {}) {
      if (capturedFrames.length === 0) {
        return [];
      }
      let filtered = capturedFrames;
      if (options.minDuration) filtered = filtered.filter(f => f.duration >= options.minDuration);
      if (options.maxDuration) filtered = filtered.filter(f => f.duration <= options.maxDuration);
      if (filtered.length > 0) {
        filtered.map(f => {
          const sev = getSeverity(f.duration);
          return {
            "": sev.icon,
            Start: `${f.startTime.toFixed(0)}ms`,
            Duration: `${f.duration.toFixed(0)}ms`,
            Blocking: `${f.blockingDuration.toFixed(0)}ms`,
            Scripts: f.scripts.length
          };
        });
      }
      return filtered;
    },
    findByURL(search) {
      if (capturedFrames.length === 0) {
        return [];
      }
      const matches = capturedFrames.filter(f => f.scripts.some(s => s.sourceURL.toLowerCase().includes(search.toLowerCase())));
      if (matches.length > 0) {
        matches.map(f => {
          const matchingScript = f.scripts.find(s => s.sourceURL.toLowerCase().includes(search.toLowerCase()));
          let scriptPath = matchingScript.sourceURL;
          try {
            scriptPath = new URL(scriptPath).pathname;
            if (scriptPath.length > 35) scriptPath = "..." + scriptPath.slice(-32);
          } catch {}
          return {
            "Frame Start": `${f.startTime.toFixed(0)}ms`,
            "Frame Duration": `${f.duration.toFixed(0)}ms`,
            Script: scriptPath,
            "Script Duration": `${matchingScript.duration.toFixed(0)}ms`
          };
        });
      }
      return matches;
    },
    percentiles(pcts = [ 50, 75, 95, 99 ]) {
      if (capturedFrames.length === 0) {
        return {};
      }
      const durations = capturedFrames.map(f => f.duration).sort((a, b) => a - b);
      const result = {};
      pcts.forEach(p => {
        const index = Math.ceil(p / 100 * durations.length) - 1;
        const safeIndex = Math.max(0, Math.min(index, durations.length - 1));
        result[`p${p}`] = durations[safeIndex];
      });
      Object.entries(result).forEach(([key, value]) => {
        getSeverity(value);
      });
      return result;
    },
    exportJSON() {
      if (capturedFrames.length === 0) {
        return;
      }
      const data = JSON.stringify(capturedFrames, null, 2);
      const blob = new Blob([ data ], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loaf-data-${(new Date).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    exportCSV() {
      if (capturedFrames.length === 0) {
        return;
      }
      const rows = [ [ "Frame Start", "Duration", "Blocking", "Script URL", "Function", "Script Duration", "Forced S&L" ] ];
      capturedFrames.forEach(f => {
        if (f.scripts.length === 0) rows.push([ f.startTime.toFixed(2), f.duration.toFixed(2), f.blockingDuration.toFixed(2), "", "", "", "" ]); else f.scripts.forEach(s => {
          rows.push([ f.startTime.toFixed(2), f.duration.toFixed(2), f.blockingDuration.toFixed(2), s.sourceURL, s.sourceFunctionName, s.duration.toFixed(2), s.forcedStyleAndLayoutDuration.toFixed(2) ]);
        });
      });
      const csv = rows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([ csv ], {
        type: "text/csv"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loaf-data-${(new Date).toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    getRawData() {
      return capturedFrames;
    },
    clear() {
      capturedFrames.length = 0;
    },
    help() {
    }
  };
  return {
    script: "Long-Animation-Frames-Helpers",
    status: "tracking",
    message: "LoAF Helpers loaded. Use loafHelpers.summary(), loafHelpers.topScripts(), etc. Call loafHelpers.getRawData() to get raw frame data.",
    getDataFn: "loafHelpers.getRawData"
  };
})();
