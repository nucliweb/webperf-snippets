let cls = 0;

new PerformanceObserver((entryList) => {
  for (const entry of entryList.getEntries()) {
    if (!entry.hadRecentInput) {
      cls += entry.value;
      debugger;
      console.log("Current CLS value:", cls, entry);
    }
  }
}).observe({ type: "layout-shift", buffered: true });
