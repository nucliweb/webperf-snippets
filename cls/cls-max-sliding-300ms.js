{
  let max = 0,
    curr = 0,
    entries = [];

  new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      if (entry.hadRecentInput) continue;
      while (entries.length && entry.startTime - entries[0].startTime > 300)
        curr -= entries.shift().value;
      entries.push(entry);
      curr += entry.value;
      max = Math.max(max, curr);
      console.log("Current MAX-sliding-300ms value:", max, entry);
    }
  }).observe({ type: "layout-shift", buffered: true });
}
