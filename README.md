<div style="margin-bottom: 1ch">
    <img src="https://github.com/nucliweb/webperf-snippets/assets/1307927/f47f3049-34f5-407c-896a-d26a30ddf344" alt"WebPerf Snippets">
</div>

A curated list of snippets to get Web Performance metrics to use in the browser console or as snippets on [Chrome DevTools](https://developer.chrome.com/docs/devtools/).

![Chrome DevTools](https://github.com/nucliweb/webperf-snippets/assets/1307927/0d7bb9c8-5f21-47c6-90c5-2707a430dacb)

## Add snippet to Chrome DevTools

You can use the webperf-snippets as a Snippet in the Chrome DevTools Sources tab.

1. Copy any of the WebPerf Snippets
2. [Open Chrome DevTools](https://developer.chrome.com/docs/devtools/open/)
3. Select the Sources tab
4. Select the Snippets sub tab
5. Click New snippet button, e.g. [LCP](https://github.com/nucliweb/webperf-snippets#largest-contentful-paint-lcp)
6. Write the snippet name, LCP
7. Paste the copied code at the right area
8. Run the snippet

## Video

https://github.com/nucliweb/webperf-snippets/assets/1307927/2987a2ca-3eef-4b73-8f6b-7b1e06b50040


<details>
    <summary>Table of Contents</summary>

- [Core Web Vitals](#core-web-vitals)
  - [Largest Contentful Paint (LCP)](#largest-contentful-paint-lcp)
  - [Largest Contentful Paint Sub-Parts (LCP)](#largest-contentful-paint-sub-parts-lcp)
  - [Quick BPP (image entropy) check](#quick-bpp-image-entropy-check)
  - [Cumulative Layout Shift (CLS)](#cumulative-layout-shift-cls)
- [Loading](#loading)
  - [Time To First Byte](#time-to-first-byte)
  - [Scripts Loading](#scripts-loading)
  - [Resources hints](#resources-hints)
  - [Find Above The Fold Lazy Loaded Images](#find-above-the-fold-lazy-loaded-images)
  - [Find non Lazy Loaded Images outside of the viewport](#find-non-lazy-loaded-images-outside-of-the-viewport)
  - [Find render-blocking resources](#find-render-blocking-resources)
  - [Image Info](#image-info)
  - [Fonts Preloaded, Loaded, and Used Above The Fold](#fonts-preloaded-loaded-and-used-above-the-fold)
  - [First And Third Party Script Info](#first-and-third-party-script-info)
  - [First And Third Party Script Timings](#first-and-third-party-script-timings)
  - [Inline Script Info and Size](#inline-script-info-and-size)
  - [Inline Script Info and Size Including ```__NEXT_DATA__```](#inline-script-info-and-size-including-__next_data__)
  - [Inline CSS Info and Size](#inline-css-info-and-size)
  - [Get your `<head>` in order](#get-your-head-in-order)
    - [e.g. web.dev](#eg-webdev)
- [Interaction](#interaction)
  - [Long Task](#long-task)
  - [Layout Shifts](#layout-shifts)
  - [Interactions](#interactions)
</details>

## Core Web Vitals

### Largest Contentful Paint (LCP)

List the Largest Contentful Paint in the console and add a blue dotted line in the LCP element.

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
###  Largest Contentful Paint Sub-Parts (LCP)

This script it's part of the [Web Vitals Chrome Extension](https://chrome.google.com/webstore/detail/web-vitals/ahfhijdlegdabablpippeagghigmibma) and appear on the [Optimize Largest Contentful Paint](https://web.dev/i18n/en/optimize-lcp/) post.

<img width="1019" alt="Largest Contentful Paint Sub-Parts" src="https://github.com/nucliweb/webperf-snippets/assets/1307927/43383791-14b3-42a1-aef1-dcd1c6124735">

```js
const LCP_SUB_PARTS = [
  'Time to first byte',
  'Resource load delay',
  'Resource load time',
  'Element render delay',
];

new PerformanceObserver((list) => {
  const lcpEntry = list.getEntries().at(-1);
  const navEntry = performance.getEntriesByType('navigation')[0];
  const lcpResEntry = performance
    .getEntriesByType('resource')
    .filter((e) => e.name === lcpEntry.url)[0];

  const ttfb = navEntry.responseStart;
  const lcpRequestStart = Math.max(
    ttfb,
    lcpResEntry ? lcpResEntry.requestStart || lcpResEntry.startTime : 0
  );
  const lcpResponseEnd = Math.max(
    lcpRequestStart,
    lcpResEntry ? lcpResEntry.responseEnd : 0
  );
  const lcpRenderTime = Math.max(
    lcpResponseEnd,
    lcpEntry ? lcpEntry.startTime : 0
  );

  LCP_SUB_PARTS.forEach((part) => performance.clearMeasures(part));

  const lcpSubPartMeasures = [
    performance.measure(LCP_SUB_PARTS[0], {
      start: 0,
      end: ttfb,
    }),
    performance.measure(LCP_SUB_PARTS[1], {
      start: ttfb,
      end: lcpRequestStart,
    }),
    performance.measure(LCP_SUB_PARTS[2], {
      start: lcpRequestStart,
      end: lcpResponseEnd,
    }),
    performance.measure(LCP_SUB_PARTS[3], {
      start: lcpResponseEnd,
      end: lcpRenderTime,
    }),
  ];

  // Log helpful debug information to the console.
  console.log('LCP value: ', lcpRenderTime);
  console.log('LCP element: ', lcpEntry.element, lcpEntry?.url);
  console.table(
    lcpSubPartMeasures.map((measure) => ({
      'LCP sub-part': measure.name,
      'Time (ms)': measure.duration,
      '% of LCP': `${
        Math.round((1000 * measure.duration) / lcpRenderTime) / 10
      }%`,
    }))
  );
}).observe({type: 'largest-contentful-paint', buffered: true});
```

### Quick BPP (image entropy) check

Context: [Largest Contentful Paint change in Chrome 112 to ignore low-entropy images](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/speed/metrics_changelog/2023_04_lcp.md)

This snippet is based on and with the permission [Stoyan Stefanov](https://twitter.com/stoyanstefanov), read his post [here](https://www.phpied.com/quick-bpp-image-entropy-check/).

With the script you can get a list of the BPP of all(1) images loaded on the site.

> (1) the images with source "data:image" and third-party images are ignored.

```js
console.table(
  [...document.images]
    .filter(
      (img) => img.currentSrc != "" && !img.currentSrc.includes("data:image")
    )
    .map((img) => [
      img.currentSrc,
      (performance.getEntriesByName(img.currentSrc)[0]?.encodedBodySize * 8) /
        (img.width * img.height),
    ])
    .filter((img) => img[1] !== 0)
);
```

### Cumulative Layout Shift (CLS)

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
  console.error(`Browser doesn't support this API`);
}
```


## Loading

### Time To First Byte

Measure the time to first byte, from the document

```js
new PerformanceObserver((entryList) => {
  const [pageNav] = entryList.getEntriesByType("navigation");
  console.log(`TTFB (ms): ${pageNav.responseStart}`);
}).observe({
  type: "navigation",
  buffered: true,
});
```

Measure the time to first byte of all the resources loaded

```js
new PerformanceObserver((entryList) => {
  const entries = entryList.getEntries();
  const resourcesLoaded = [...entries].map((entry) => {
    let obj = {};
    // Some resources may have a responseStart value of 0, due
    // to the resource being cached, or a cross-origin resource
    // being served without a Timing-Allow-Origin header set.
    if (entry.responseStart > 0) {
      obj = {
        "TTFB (ms)": entry.responseStart,
        Resource: entry.name,
      };
    }
    return obj;
  });
  console.table(resourcesLoaded);
}).observe({
  type: "resource",
  buffered: true,
});
```

### Scripts Loading

List all the `<scripts>` in the DOM and show a table to see if are loaded `async` and/or `defer`

```js
const scripts = document.querySelectorAll("script[src]");

const scriptsLoading = [...scripts].map((obj) => {
  let newObj = {};
  newObj = {
    src: obj.src,
    async: obj.async,
    defer: obj.defer,
    "render blocking": obj.async || obj.defer ? "" : "🟥",
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

List all images that have `loading="lazy"` or `[data-src]` _(lazy loading via JS)_ above the fold

```js
function findATFLazyLoadedImages() {
  const lazy = document.querySelectorAll('[loading="lazy"], [data-src]');
  let lazyImages = [];
  lazy.forEach((tag) => {
    const position = parseInt(tag.getBoundingClientRect().top);
    if (position < window.innerHeight && position !== 0) {
      lazyImages = [...lazyImages, tag];
    }
  });
  return lazyImages.length > 0 ? lazyImages : false;
}

console.log(findATFLazyLoadedImages());
```

### Find non Lazy Loaded Images outside of the viewport

List all images that don't have `loading="lazy"` or `[data-src]` _(lazy loading via JS)_ and are not in the viewport when the page loads. This script will help you find candidates for lazy loading.

```js
// Execute it after the page has loaded without any user interaction (Scroll, click, etc)
function findImgCanidatesForLazyLoading() {
  let notLazyImages = document.querySelectorAll(
    'img:not([data-src]):not([loading="lazy"])'
  );
  return Array.from(notLazyImages).filter((tag) => !isInViewport(tag));
}

function isInViewport(tag) {
  let rect = tag.getBoundingClientRect();
  return (
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.left <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

console.log(
  "Consider lazyloading the following images: ",
  findImgCanidatesForLazyLoading()
);
```

### Find render-blocking resources

List all resources that are blocking rendering.

> It's currently Chromium only

```js
function RenderBlocking({startTime, duration, responseEnd, name, initiatorType}) {
  this.startTime = startTime
  this.duration = duration
  this.responseEnd = responseEnd
  this.name = name
  this.initiatorType = initiatorType
}

function findRenderBlockingResources() {
  return window.performance.getEntriesByType('resource')
    .filter(({renderBlockingStatus}) => renderBlockingStatus === 'blocking')
    .map(({startTime, duration, responseEnd, name, initiatorType}) => new RenderBlocking({startTime, duration, responseEnd, name, initiatorType}));
}

console.table(findRenderBlockingResources())
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

### Fonts Preloaded, Loaded, and Used Above The Fold

List all the fonts preloaded via resources hints, all the fonts loaded via CSS, and all the fonts used in the viewport above the fold.

```js
const linkElements = document.querySelectorAll(`link[rel="preload"]`);
const arrayLinks = Array.from(linkElements);
const preloadedFonts = arrayLinks.filter((link) => link.as === "font");

console.log("Fonts Preloaded via Resources Hints");
preloadedFonts.forEach((font) => console.log(`▸ ${font.href}`));
console.log("");

const loadedFonts = [
  ...new Set(
    Array.from(document.fonts.values())
      .map((font) => font)
      .filter((font) => font.status === "loaded")
      .map((font) => `${font.family} - ${font.weight} - ${font.style}`)
  ),
];

console.log("Fonts and Weights Loaded in the Document");
loadedFonts.forEach((font) => console.log(`▸ ${font}`));
console.log("");

const childrenSlector =
  "body * > *:not(script):not(style):not(link):not(source)";
const aboveFoldElements = Array.from(
  document.querySelectorAll(childrenSlector)
).filter((elm) => {
  const rect = elm.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
});

const usedFonts = Array.from(
  new Set(
    [...aboveFoldElements].map(
      (e) =>
        `${getComputedStyle(e).fontFamily} | ${
          getComputedStyle(e).fontWeight
        } | ${getComputedStyle(e).fontStyle}`
    )
  )
);

console.log("Fonts and Weights Used Above the Fold");
usedFonts.forEach((font) => console.log(`▸ ${font}`));
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

- [Akamai Tech Docs - Timing-Allow-Origin](https://techdocs.akamai.com/mpulse/docs/use-metrics#the-resource-timing-api)
- [MDN - Timing-Allow-Origin Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Timing-Allow-Origin)
- [More Info on TAO header by Nic Jansma](https://nicj.net/resourcetiming-visibility-third-party-scripts-ads-and-page-weight/)

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
### Inline Script Info and Size

Find all inline scripts on the page and list the scripts and count. Find the total byte size of all the inline scripts in the console.

```javascript

function findInlineScripts() {
    const inlineScripts = document.querySelectorAll(["script:not([async]):not([defer]):not([src])"])
    console.log(inlineScripts)
    console.log(`COUNT: ${inlineScripts.length}`)
    let totalByteSize = 0
    for (const script of [...inlineScripts]) {
      const html = script.innerHTML
      const size = new Blob([html]).size
      totalByteSize += size
    }
  console.log((totalByteSize / 1000) + " kb")
}

findInlineScripts()

```

### Inline Script Info and Size Including ```__NEXT_DATA__```

Find all inline scripts and their total size separately from ```__NEXT_DATA__``` serialized JSON inline Script

```javascript

function findInlineScriptsWithNextData() {
  const inlineScripts = document.querySelectorAll([
    "script:not([async]):not([defer]):not([src])"
  ]);
  console.log(inlineScripts);
  console.log(`COUNT: ${inlineScripts.length}`);

  const byteSize = {
    NEXT_DATA_SIZE: 0,
    OTHER_SIZE: 0
  };

  function getSize(script) {
    const html = script.innerHTML;
    return new Blob([html]).size;
  }

  function convertToKb(bytes) {
    return bytes / 1000;
  }

  for (const script of [...inlineScripts]) {
    if (script.id == "__NEXT_DATA__") {
      byteSize.NEXT_DATA_SIZE += getSize(script);
    } else {
      byteSize.OTHER_SIZE += getSize(script);
    }
  }

  return {
    NEXT_DATA_SIZE: convertToKb(byteSize.NEXT_DATA_SIZE) + " kb",
    OTHER_SIZE: convertToKb(byteSize.OTHER_SIZE) + " kb",
    totalByteSize:
      convertToKb(byteSize.NEXT_DATA_SIZE) +
      convertToKb(byteSize.OTHER_SIZE) +
      " kb"
  };
}

console.log(findInlineScriptsWithNextData());

```

### Inline CSS Info and Size

Find all inline style tags and list them in a table with individual and total byte size. Customize the table below.

```javascript

// Wait for the page to fully load

function findAllInlineCSS() {
  const convertToKb = (bytes) => bytes / 1000;
  const inlineCSS = document.querySelectorAll("style");
  let totalByteSize = 0;
  for (const css of [...inlineCSS]) {
    const html = css.innerHTML;
    const size = new Blob([html]).size;
    css.byteSizeInKb = convertToKb(size)
    totalByteSize += size;
  }
  // customize table here, can right click on header in console to sort table
  console.table(inlineCSS, [
    "baseURI",
    "parentElement",
    "byteSizeInKb",
    "innerHTML"
  ]);
  
console.log(`Total size: ${convertToKb(totalByteSize)} kB`);
}

findAllInlineCSS()


```

### Get your `<head>` in order

How you order elements in the <head> can have an effect on the (perceived) performance of the page.

Use [capo.js](https://github.com/rviscomi/capo.js) the [Rick Viscomi](https://github.com/rviscomi) script

#### e.g. web.dev

<img width="842" alt="image" src="https://github.com/rviscomi/capo.js/assets/1120896/fe6bb67c-697a-4fdf-aa28-52429239fcf5">

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
  po.observe({ type: "longtask", buffered: true });
} catch (e) {
  console.error(`The browser doesn't support this API`);
}
```

### Layout Shifts

To find more specific information about layout shifts, you can use [PerformanceObserver](https://developer.mozilla.org/docs/Web/API/PerformanceObserver) and register to observe entries of type `layout-shift`:

```js
function genColor() {
  let n = (Math.random() * 0xfffff * 1000000).toString(16);
  return "#" + n.slice(0, 6);
}

// console.log(shifts) to see full list of shifts above threshold
const shifts = [];

// threshold ex: 0.05
// Layout Shifts will be grouped by color.
// All nodes attributed to the shift will have a border with the corresponding color
// Shift value will be added above parent node.
// Will have all details related to that shift in dropdown
// Useful for single page applications and finding shifts after initial load

function findShifts(threshold) {
  return new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.value > threshold && !entry.hadRecentInput) {
        const color = genColor();
        shifts.push(entry);
        console.log(shifts);

        const valueNode = document.createElement("details");
        valueNode.innerHTML = `
        <summary>Layout Shift: ${entry.value}</summary>
        <pre>${JSON.stringify(entry, null, 2)}</pre>
        `;
        valueNode.style = `color: ${color};`;
        entry.sources.forEach((source) => {
          source.node.parentNode.insertBefore(valueNode, source.node);
          source.node.style = `border: 2px ${color} solid`;
        });
      }
    });
  });
}

findShifts(0.05).observe({ entryTypes: ["layout-shift"] });
```

Print al the CLS metrics when load the page and the user interactive with the page:

```js
new PerformanceObserver((entryList) => {
  console.log(entryList.getEntries());
}).observe({ type: "layout-shift", buffered: true });
```
### Interactions

This script it's part of the [Web Vitals Chrome Extension](https://chrome.google.com/webstore/detail/web-vitals/ahfhijdlegdabablpippeagghigmibma) and allows you to track all interactions as you click around the page to help improve INP.

<img width="1040" alt="Interaction tracking in console log" src="https://github.com/nucliweb/webperf-snippets/assets/10931297/857f1cf1-ce18-4074-b707-7c910ff12d7c">

```js
const valueToRating = (score) => score <= 200 ? 'good' : score <= 500 ? 'needs-improvement' : 'poor';

const COLOR_GOOD = '#0CCE6A';
const COLOR_NEEDS_IMPROVEMENT = '#FFA400';
const COLOR_POOR = '#FF4E42';
const RATING_COLORS = {
  'good': COLOR_GOOD,
  'needs-improvement': COLOR_NEEDS_IMPROVEMENT,
  'poor': COLOR_POOR
};

const observer = new PerformanceObserver((list) => {
  const interactions = {};

  for (const entry of list.getEntries().filter((entry) => entry.interactionId)) {
    interactions[entry.interactionId] = interactions[entry.interactionId] || [];
    interactions[entry.interactionId].push(entry);
  }

  // Will report as a single interaction even if parts are in separate frames.
  // Consider splitting by animation frame.
  for (const interaction of Object.values(interactions)) {
    const entry = interaction.reduce((prev, curr) => prev.duration >= curr.duration ? prev : curr);
    const value = entry.duration;
    const rating = valueToRating(value);

    const formattedValue = `${value.toFixed(0)} ms`;
    console.groupCollapsed(
      `Interaction tracking snippet %c${formattedValue} (${rating})`,
      `color: ${RATING_COLORS[rating] || 'inherit'}`
    );
    console.log('Interaction target:', entry.target);

    for (let entry of interaction) {
      console.log(`Interaction event type: %c${entry.name}`, 'font-family: monospace');

      // RenderTime is an estimate, because duration is rounded, and may get rounded down.
      // In rare cases it can be less than processingEnd and that breaks performance.measure().
      // Lets make sure its at least 4ms in those cases so you can just barely see it.
      const adjustedPresentationTime = Math.max(entry.processingEnd + 4, entry.startTime + entry.duration);

      console.table([{
        subPartString: 'Input delay',
        'Time (ms)': Math.round(entry.processingStart - entry.startTime, 0),
      },
      {
        subPartString: 'Processing time',
        'Time (ms)': Math.round(entry.processingEnd - entry.processingStart, 0),
      },
      {
        subPartString: 'Presentation delay',
        'Time (ms)': Math.round(adjustedPresentationTime - entry.processingEnd, 0),
      }]);
    }

    console.groupEnd();

  }
});

observer.observe({
  type: 'event',
  durationThreshold: 0, // 16 minimum by spec
  buffered: true
});
```

