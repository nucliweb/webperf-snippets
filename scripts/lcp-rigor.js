const po = new PerformanceObserver((list) => {
  let entries = list.getEntries();

  entries = dedupe(entries, "startTime");

  entries.forEach((item, i) => {
    console.dir(item);
    console.log(
      `${i + 1} current LCP item : ${item.element}: ${item.startTime}`
    );

    item.element ? (item.element.style = "border: 2px dotted blue;") : null;

    if (i === entries.length - 1) {
      item.element.style = "border: 5px dotted red;";
    }
  });
});

po.observe({ type: "largest-contentful-paint", buffered: true });

function dedupe(arr, key) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
}
