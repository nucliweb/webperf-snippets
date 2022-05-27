# ⚡️💾 Web Performance Snippets

A curated list of snippets to get Web Performance metrics to use in the browser console

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
const scripts = document.querySelectorAll('script[src]');

const scriptsLoading = [...scripts].map(obj => {
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
const rels = ['preload', 'prefetch', 'preconnect', 'dns-prefetch', 'preconnect dns-prefetch', 'prerender', 'modulepreload']

rels.forEach(element => {
  const linkElements = document.querySelectorAll(`link[rel="${element}"]`)
  const dot = linkElements.length > 0 ? '🟩' : '🟥'
  console.log(`${dot} ${element}`)
  linkElements.forEach(el => console.log(el))
});

```

### Find Above The Fold Lazy Loaded Images

List all images that have `loading="lazy"` above the fold

```js
function findATFLazyLoadedImages() {
  const lazy = document.querySelectorAll('[loading="lazy"]');
  let flag = false;
  lazy.forEach((tag) => {
    const position = parseInt(tag.getBoundingClientRect().top);
    if (position < window.innerHeight && position !== 0) {
      console.log(tag, position);
      flag = true;
    }
  });

  return flag;
}

console.log(findATFLazyLoadedImages());

```

### Image Info

List all image resources and sort by (`name, transferSize, encodedBodySize, decodedBodySize, initiatorType`)

[More Info](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming])

```js
function getImgs(sortBy) {
  const imgs = [];

  const resourceListEntries = performance.getEntriesByType("resource");
  resourceListEntries.forEach(
    ({
      name,
      transferSize,
      encodedBodySize,
      decodedBodySize,
      initiatorType,
    }) => {
      if (initiatorType == "img") {
        imgs.push({
          name,
          transferSize,
          decodedBodySize,
          encodedBodySize,
        });
      }
    }
  );

  const imgList = imgs.sort((a, b) => {
    return b[sortBy] - a[sortBy];
  });

  return imgList
}
console.table(getImgs('encodedBodySize'))

```

### First And Third Party Script Info

List all scripts using PerformanceResourceTiming API and separating them by first and third party

[More Info](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming)
[Info On CORS](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#coping_with_cors)

```js
function getScriptInfo() {
  const resourceListEntries = performance.getEntriesByType("resource");
  // set for first party scripts
  const first = [];
  // set for third party scripts
  const third = [];

  resourceListEntries.forEach((resource) => {
    // check for initiator type
    const value = "initiatorType" in resource;
    if (value) {
      if (resource.initiatorType === "script") {
        const { host } = new URL(resource.name);
        const windowHost = location.host;
        // check if resource url host matches location.host = first party script
        if (host == windowHost) {
          const json = resource.toJSON();
          first.push({ ...json, type: "First Party" });
        } else {
          // add to third party script
          const json = resource.toJSON();
          third.push({ ...json, type: "Third Party" });
        }
      }
    }
  });

  return {
    ...(first.length && { firstParty: first }),
    ...(third.length && { thirdParty: third }),
  };
}

console.groupCollapsed("FIRST PARTY SCRIPTS");
console.table(getScriptInfo().firstParty);
console.groupEnd();
console.groupCollapsed("THIRD PARTY SCRIPTS");
console.group();
console.table(getScriptInfo().thirdParty);
console.groupEnd();


```
