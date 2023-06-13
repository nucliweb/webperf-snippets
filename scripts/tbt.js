//WIP

new PerformanceObserver((list) => {
  const entries = list.getEntries();
  console.log(entries);
  let TBT = 0;
  for (const { duration } of entries) {
    if (duration > 50) {
      TBT += duration - 50;
    }
  }

  console.log("Total Blocking Time: " + TBT);
}).observe({ type: "longtask", buffered: true });
