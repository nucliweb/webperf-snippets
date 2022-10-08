# ⚡️💾 Web Performance Snippets

A curated list of snippets to get Web Performance metrics to use in the browser console

## Core Web Vitals

### Largest Contentful Paint (LCP)

```js
/**
 * PerformanceObserver
 */
const po = new PerformanceObserver((list) => {
  let entries = list.getEntries();

  entries = dedupe(entries, "startTime");

  /**
   * Print all entries of LCP
   */
  entries.forEach((item, i) => {
    console.dir(item);
    console.log(
      `${i + 1} current LCP item : ${item.element}: ${item.startTime}`
    );
    /**
     * Highlight LCP elements on the page
     */
    item.element ? (item.element.style = "border: 5px dotted blue;") : "";
  });

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
po.observe({ type: "largest-contentful-paint", buffered: true });

function dedupe(arr, key) {
  return [...new Map(arr.map((item) => [item[key], item])).values()];
}
```

### Cumulative Layout Shift

```js
try {
  let cumulativeLayoutShiftScore = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        cumulativeLayoutShiftScore += entry.value;
      }
    }
  });

  observer.observe({ type: "layout-shift", buffered: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      observer.disconnect();

      console.log(`CLS: ${cumulativeLayoutShiftScore}`);
    }
  });
} catch (e) {
  console.log(`Browser doesn't support this API`);
}
```

## Loading

### Time To First Byte

Measure the time to first byte, from the document

```js
new PerformanceObserver((entryList) => {
  const [pageNav] = entryList.getEntriesByType('navigation')
  console.log(`TTFB (ms): ${pageNav.responseStart}`)
}).observe({
  type: 'navigation',
  buffered: true
})
```

Measure the time to first byte of all the resources loaded

```js
new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const resourcesLoaded = [...entries].map((entry) => {
    let obj= {};
    // Some resources may have a responseStart value of 0, due
    // to the resource being cached, or a cross-origin resource
    // being served without a Timing-Allow-Origin header set.
    if (entry.responseStart > 0) {
      obj = {
        'TTFB (ms)': entry.responseStart,
        Resource: entry.name
      }
    }
    return obj
  })
  console.table(resourcesLoaded)
}).observe({
  type: 'resource',
  buffered: true
})
```

### Scripts Loading

List all the `<scripts>` in the DOM and show a table to see if are loaded `async` and/or `defer`

```js
const scripts = document.querySelectorAll('script[src]');

const scriptsLoading = [...scripts].map((obj) => {
  let newObj = {};
  newObj = {
    src: obj.src,
    async: obj.async,
    defer: obj.defer,
    'render blocking': obj.async || obj.defer ? '' : '🟥'
  };
  return newObj;
});
console.table(scriptsLoading);
```

### Resources hints

Check is the page has resources hints

```js
const rels = [
  "preload",
  "prefetch",
  "preconnect",
  "dns-prefetch",
  "preconnect dns-prefetch",
  "prerender",
  "modulepreload",
];

rels.forEach((element) => {
  const linkElements = document.querySelectorAll(`link[rel="${element}"]`);
  const dot = linkElements.length > 0 ? "🟩" : "🟥";
  console.log(`${dot} ${element}`);
  linkElements.forEach((el) => console.log(el));
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

[More Info](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming)

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

  return imgList;
}
console.table(getImgs("encodedBodySize"));
```

### First And Third Party Script Info

List all scripts using PerformanceResourceTiming API and separating them by first and third party

[More Info](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming)

[Info On CORS](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#coping_with_cors)

```js
// ex: katespade.com - list firsty party subdomains in HOSTS array
const HOSTS = ["assets.katespade.com"];

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
        // check if resource url host matches location.host = first party script
        if (host === location.host || HOSTS.includes(host)) {
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

  const scripts = {
    firstParty: [{ name: "no data" }],
    thirdParty: [{ name: "no data" }],
  };

  if (first.length) {
    scripts.firstParty = first;
  }

  if (third.length) {
    scripts.thirdParty = third;
  }

  return scripts;
}

const { firstParty, thirdParty } = getScriptInfo();

console.groupCollapsed("FIRST PARTY SCRIPTS");
console.table(firstParty);
console.groupEnd();
console.groupCollapsed("THIRD PARTY SCRIPTS");
console.table(thirdParty);
console.groupEnd();

/*
Choose which properties to display
https://developer.mozilla.org/en-US/docs/Web/API/console/table

console.groupCollapsed("FIRST PARTY SCRIPTS");
console.table(firstParty, ["name", "nextHopProtocol"]);
console.groupEnd();
console.groupCollapsed("THIRD PARTY SCRIPTS", ["name", "nextHopProtocol"]);
console.table(thirdParty);
console.groupEnd();
*/
```

### First And Third Party Script Timings

<small>_This relies on the above script_</small>

_Run First And Third Party Script Info in the console first, then run this_

[Calculate Load Times - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#timing_resource_loading_phases)

<details><summary><a href='https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#coping_with_cors' target="_blank">Info on CORS (why some values are 0)</a></summary>



<p>

> Note: The properties which are returned as 0 by default when loading a resource from a domain other than the one of the web page itself: redirectStart, redirectEnd, domainLookupStart, domainLookupEnd, connectStart, connectEnd, secureConnectionStart, requestStart, and responseStart.

</p>
</details>
<br>

[More Info on TAO header - Akamai Developer Resources](https://developer.akamai.com/blog/2018/06/13/how-add-timing-allow-origin-headers-improve-site-performance-measurement)

```js
function createUniqueLists(firstParty, thirdParty) {
  function getUniqueListBy(arr, key) {
    return [...new Map(arr.map((item) => [item[key], item])).values()];
  }

  const firstPartyList = getUniqueListBy(firstParty, ["name"]);
  const thirdPartyList = getUniqueListBy(thirdParty, ["name"]);
  
  return { firstPartyList, thirdPartyList };

}

const { firstPartyList, thirdPartyList } = createUniqueLists(
  firstParty,
  thirdParty
);



function calculateTimings(party, type) {
  const partyChoice = party === "first" ? firstParty : thirdParty;

  const timingChoices = {
    DNS_TIME: ["domainLookupEnd", "domainLookupStart"],
    TCP_HANDSHAKE: ["connectEnd", "connectStart"],
    RESPONSE_TIME: ["responseEnd", "responseStart"],
    SECURE_CONNECTION_TIME: ["connectEnd", "secureConnectionStart", 0],
    FETCH_UNTIL_RESPONSE: ["responseEnd", "fetchStart", 0],
    REQ_START_UNTIL_RES_END: ["responseEnd", "requestStart", 0],
    START_UNTIL_RES_END: ["responseEnd", "startTime", 0],
    REDIRECT_TIME: ["redirectEnd", "redirectStart"],
  };

  function handleChoices(timingEnd, timingStart, num) {
    if (!num) {
      return timingEnd - timingStart;
    }

    if (timingStart > 0) {
      return timingEnd - timingStart;
    }

    return 0;
  }

  const timings = partyChoice.map((script) => {
    const [timingEnd, timingStart, num] = timingChoices[type];
    const endValue = script[timingEnd];
    const startValue = script[timingStart];
    return {
      name: script.name,
      [type]: handleChoices(endValue, startValue, num),
    };
  });

  return timings;
}

// Available Options
const timingOptions = [
  "DNS_TIME",
  "TCP_HANDSHAKE",
  "RESPONSE_TIME",
  "SECURE_CONNECTION_TIME",
  "FETCH_UNTIL_RESPONSE",
  "REQ_START_UNTIL_RES_END",
  "START_UNTIL_RES_END",
  "REDIRECT_TIME",
];

// run em all!
// https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#timing_resource_loading_phases

timingOptions.forEach((timing) => {
  console.groupCollapsed(`FIRST PARTY: ${timing}`);
  console.table(calculateTimings("first", timing));
  console.groupEnd();
  console.groupCollapsed(`THIRD PARTY: ${timing}`);
  console.table(calculateTimings("third", timing));
  console.groupEnd();
});

// choose your battle - arg1 is string either "first" or "third", arg2 is string timing option listed above.

console.table(calculateTimings("first", "REQ_START_UNTIL_RES_END"));
```
## Interaction

### Long Task

To determine when long tasks happen, you can use [PerformanceObserver](https://developer.mozilla.org/docs/Web/API/PerformanceObserver) and register to observe entries of type `longtask`:

```js
try {
  // Create the performance observer.
  const po = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // Log the entry and all associated details.
      console.table(entry.toJSON());
    }
  });
  // Start listening for `longtask` entries to be dispatched.
  po.observe({type: 'longtask', buffered: true});
} catch (e) {
  console.log(`The browser doesn't support this API`)
}
```

### Cumulative Layout Shift

Print al the CLS metrics when load the page and the user interactive with the page:

```js
new PerformanceObserver(entryList => {
    console.log(entryList.getEntries());
}).observe({ type: "layout-shift", buffered: true });
```
