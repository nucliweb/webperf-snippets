{
  let max = 0,
    curr = 0,
    prevTs = Number.NEGATIVE_INFINITY;

  new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      if (entry.hadRecentInput) continue;
      if (entry.startTime - prevTs > 1000) curr = 0;
      prevTs = entry.startTime;
      curr += entry.value;
      max = Math.max(max, curr);
      console.log("Current MAX-session-gap1s value:", max, entry);
    }
  }).observe({ type: "layout-shift", buffered: true });
}
