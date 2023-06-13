{
  let cls = 0,
    count = 0,
    prevTs = Number.NEGATIVE_INFINITY;

  new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      if (entry.hadRecentInput) continue;
      if (entry.startTime - prevTs > 5000) count++;
      prevTs = entry.startTime;
      cls += entry.value;
      console.log("Current avg-session-gap5s value:", cls / count, entry);
    }
  }).observe({ type: "layout-shift", buffered: true });
}
