function getLCPDebugTarget(entries) {
  const lastEntry = entries[entries.length - 1];
  return lastEntry.element;
}

new PerformanceObserver((list) => {
  const finalLCP = getLCPDebugTarget(list.getEntries());
  console.log(finalLCP);
  finalLCP.style = "border: 5px dotted red;";
}).observe({ type: "largest-contentful-paint", buffered: true });
