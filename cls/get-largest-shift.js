function getCLSDebugTarget(entries) {
  const largestShift = entries.reduce((a, b) => {
    return a && a.value > b.value ? a : b;
  });
  if (largestShift && largestShift.sources) {
    const largestSource = largestShift.sources.reduce((a, b) => {
      return a.node &&
        a.previousRect.width * a.previousRect.height >
          b.previousRect.width * b.previousRect.height
        ? a
        : b;
    });
    if (largestSource) {
      // largestSource.node for DOM node specificity
      return largestSource;
    }
  }
}

new PerformanceObserver((list) => {
  const largestShift = getCLSDebugTarget(list.getEntries());
  console.log(largestShift);
}).observe({ type: "layout-shift", buffered: true });
