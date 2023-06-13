new PerformanceObserver((list) => {
  const entries = list.getEntries();
  console.log(entries);
}).observe({ type: "first-input", buffered: true });
