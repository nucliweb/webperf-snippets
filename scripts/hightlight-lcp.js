// HIGHLIGHT LCP
const po = new PerformanceObserver((list) => {
  let entries = list.getEntries();

  entries = dedupe(entries, "startTime");

  entries.forEach((item, i) => {
    console.dir(item);
    console.log(
      `${i + 1} current LCP item : ${item.element}: ${item.startTime}`
    );

    item.element ? (item.element.style = "border: 5px dotted blue;") : null;

    const lastEntry = entries[entries.length - 1];
    console.log(lastEntry);

    console.log(`LCP is: ${lastEntry.startTime}`);
  });
});

po.observe({ type: "largest-contentful-paint", buffered: true });

function dedupe(arr, key) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
}
