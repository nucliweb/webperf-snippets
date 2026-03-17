(() => {
  const formatMs = ms => `${Math.round(ms)}ms`;
  const getSeverity = duration => {
    if (duration > 250) return {
      level: "critical",
      icon: "🔴",
      color: "#ef4444"
    };
    if (duration > 150) return {
      level: "high",
      icon: "🟠",
      color: "#f97316"
    };
    if (duration > 100) return {
      level: "medium",
      icon: "🟡",
      color: "#eab308"
    };
    return {
      level: "low",
      icon: "🟢",
      color: "#22c55e"
    };
  };
  const allTasks = [];
  let totalBlockingTime = 0;
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration;
        const blockingTime = Math.max(0, duration - 50);
        totalBlockingTime += blockingTime;
        const sev = getSeverity(duration);
        const task = {
          startTime: entry.startTime,
          duration: duration,
          blockingTime: blockingTime,
          severity: sev.level,
          attribution: entry.attribution?.[0]?.containerType || "unknown",
          containerId: entry.attribution?.[0]?.containerId || "",
          containerName: entry.attribution?.[0]?.containerName || ""
        };
        allTasks.push(task);
        if (entry.attribution && entry.attribution.length > 0) {
          entry.attribution.forEach(attr => {
            if (attr.containerName) void 0;
            if (attr.containerId) void 0;
            if (attr.containerSrc) void 0;
          });
        }
      }
    });
    observer.observe({
      type: "longtask",
      buffered: true
    });
    window.getLongTaskSummary = () => {
      if (allTasks.length === 0) {
        return;
      }
      const durations = allTasks.map(t => t.duration);
      const worst = Math.max(...durations);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      getSeverity(worst);
      const bySeverity = {
        critical: allTasks.filter(t => t.severity === "critical").length,
        high: allTasks.filter(t => t.severity === "high").length,
        medium: allTasks.filter(t => t.severity === "medium").length,
        low: allTasks.filter(t => t.severity === "low").length
      };
      if (allTasks.length > 0) {
        allTasks.sort((a, b) => b.duration - a.duration).slice(0, 10).map(t => {
          const sev = getSeverity(t.duration);
          return {
            "": sev.icon,
            Start: formatMs(t.startTime),
            Duration: formatMs(t.duration),
            Blocking: formatMs(t.blockingTime),
            Container: t.attribution
          };
        });
      }
      if (totalBlockingTime > 300) {
      }
      return {
        script: "LongTask",
        status: "ok",
        count: allTasks.length,
        details: {
          totalBlockingTimeMs: Math.round(totalBlockingTime),
          worstTaskMs: Math.round(worst),
          avgDurationMs: Math.round(avg),
          bySeverity: bySeverity
        }
      };
    };
    const longtaskBuffered = performance.getEntriesByType("longtask");
    const totalBlockingSync = longtaskBuffered.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
    const worstTaskSync = longtaskBuffered.length > 0 ? Math.max(...longtaskBuffered.map(t => t.duration)) : 0;
    const bySeveritySync = {
      critical: longtaskBuffered.filter(t => t.duration > 250).length,
      high: longtaskBuffered.filter(t => t.duration > 150 && t.duration <= 250).length,
      medium: longtaskBuffered.filter(t => t.duration > 100 && t.duration <= 150).length,
      low: longtaskBuffered.filter(t => t.duration >= 50 && t.duration <= 100).length
    };
    return {
      script: "LongTask",
      status: "tracking",
      count: longtaskBuffered.length,
      details: {
        totalBlockingTimeMs: Math.round(totalBlockingSync),
        worstTaskMs: Math.round(worstTaskSync),
        bySeverity: bySeveritySync
      },
      message: "Tracking long tasks. Call getLongTaskSummary() for statistics.",
      getDataFn: "getLongTaskSummary"
    };
  } catch (e) {
    return {
      script: "LongTask",
      status: "unsupported",
      error: e.message
    };
  }
})();
