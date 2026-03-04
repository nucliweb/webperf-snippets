// Measure TTFB with threshold indicator
// https://webperf-snippets.nucliweb.net

new PerformanceObserver((entryList) => {
  const [pageNav] = entryList.getEntriesByType("navigation");
  const ttfb = pageNav.responseStart;

  let rating, color;
  if (ttfb <= 800) {
    rating = "Good";
    color = "#22c55e";
  } else if (ttfb <= 1800) {
    rating = "Needs Improvement";
    color = "#f59e0b";
  } else {
    rating = "Poor";
    color = "#ef4444";
  }

  console.log(
    `%cTTFB: ${ttfb.toFixed(0)}ms (${rating})`,
    `color: ${color}; font-weight: bold; font-size: 14px;`
  );
}).observe({
  type: "navigation",
  buffered: true,
});
