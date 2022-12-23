new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const longestTask = entries.reduce((a, b) => {
    if (a.duration > b.duration) return a;
    return b;
  }, {});
  console.log(longestTask);
}).observe({ type: "longtask", buffered: true });
