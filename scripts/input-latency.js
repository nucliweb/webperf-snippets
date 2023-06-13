let maxTapOrDragDuration = 0;
let maxKeyboardDuration = 0;
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    switch (entry.name) {
      case "keydown":
      case "keyup":
        maxKeyboardDuration = Math.max(maxKeyboardDuration, entry.duration);
        break;
      case "pointerdown":
      case "pointerup":
      case "click":
        maxTapOrDragDuration = Math.max(maxTapOrDragDuration, entry.duration);
        break;
    }
  });
});
observer.observe({ type: "event", minDuration: 16, buffered: true });
// We can report maxTapDragDuration and maxKeyboardDuration when sending
// metrics to analytics.
// https://web.dev/better-responsiveness-metric/
