# ⚡️💾 Web Performance Snippets

A curated list of snippets to get Web Performance metrics

## Core Web Vitals

### Largest Contenful Paint (LCP)

```js
/**
 * PerformanceObserver
 */
const po = new PerformanceObserver(list => {
  let entries = list.getEntries();

  entries = dedupe(entries, "startTime");
  
  /**
   * Print all entries of LCP
   */
  entries.forEach((item, i) => {
    console.dir(item);
    console.log(`${i+1} current LCP item : ${item.element}: ${item.startTime}`);
    /**
     * Highlight LCP elements on the page
     */
    item.element ? item.element.style = "border: 5px dotted blue;" : '';
  })
  
  /**
   * LCP is the lastEntry in getEntries Array
   */
  const lastEntry = entries[entries.length - 1];
  /**
   * Print final LCP
   */
  console.log(`LCP is: ${lastEntry.startTime}`);
});

/**
 * Start observing for largest-contentful-paint
 * buffered true getEntries prior to this script execution
 */
po.observe({ type: 'largest-contentful-paint', buffered: true })

function dedupe(arr, key){
  return [...new Map(arr.map(item => [item[key], item])).values()]
}
```

### Cumulative Layout Shift

```js
try {
  let cumulativeLayoutShiftScore = 0;
  const observer = new PerformanceObserver(list => {
    for(const entry of list.getEntries()){
      if(!entry.hadRecentInput){
        cumulativeLayoutShiftScore += entry.value;
      }
    }
  });

  observer.observe({type: 'layout-shift', buffered: true});

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){
      observer.takeRecords();
      observer.disconnect();
      
      console.log(`CLS: ${cumulativeLayoutShiftScore}`);
    }
  })

} catch(e) {
  console.log(`Browser doesn't support this API`);
}
```

## Loading

### Scripts Loading

List all the `<scripts>` in the DOM and show a table to see if are loaded `async` and/or `defer`

```js
let scripts = document.querySelectorAll('script[src]');

let scriptsLoading = [...scripts].map(obj => {
 let newObj = {};
 newObj = {
     "src": obj.src,
     "async": obj.async,
     "defer": obj.defer
 }
 return newObj;
});
console.table(scriptsLoading);
```

### Resources hints

Check is the page has resources hints

```js
dconst rels = ['preload', 'prefetch', 'preconnect', 'dns-prefetch', 'preconnect dns-prefetch', 'prerender', 'modulepreload']

rels.forEach(element => {
  const linkElements = document.querySelectorAll(`link[rel="${element}"]`)
  const dot = linkElements.length > 0 ? '🟩' : '🟥'
  console.log(`${dot} ${element}`)
  linkElements.forEach(el => console.log(el))
});

```
