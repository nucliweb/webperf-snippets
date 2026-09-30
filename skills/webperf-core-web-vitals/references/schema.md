# Script Return Value Schema

All scripts in the skills directory must return a structured JSON object as the IIFE return value. This allows agents using `mcp__chrome-devtools__evaluate_script` to read structured data directly from the return value, rather than parsing human-readable console output.

## Why this matters

`evaluate_script` captures **both** the console output **and** the return value of the evaluated expression. Console output (with `%c` CSS styling, emojis, tables) is meant for humans reading DevTools. The return value is meant for agents.

```
// Agent workflow
result = evaluate_script(scriptCode)  // return value → structured JSON for agent
get_console_message()                  // console output → human debugging only
```

---

## Base Shape

Every script must return an object matching this shape:

```typescript
{
  // Required in all scripts
  script: string;        // Script name, e.g. "LCP", "TTFB", "Script-Loading"
  status: "ok"           // Script ran, has data
       | "tracking"      // Observer active, data accumulates over time
       | "error"         // Failed or no data available
       | "unsupported";  // Browser API not supported

  // Metric scripts (LCP, CLS, INP, TTFB, FCP)
  metric?: string;       // Short metric name: "LCP", "CLS", "INP", "TTFB", "FCP"
  value?: number;        // Always a number, never a formatted string
  unit?: "ms"            // Milliseconds
       | "score"         // Unitless score (CLS)
       | "count"         // Integer count
       | "bytes"         // Raw bytes
       | "bpp"           // Bits per pixel
       | "fps";          // Frames per second
  rating?: "good" | "needs-improvement" | "poor";
  thresholds?: {
    good: number;        // Upper bound for "good"
    needsImprovement: number;  // Upper bound for "needs-improvement"
  };

  // Audit/inspection scripts (render-blocking, images, scripts)
  count?: number;        // Total number of items found
  items?: object[];      // Array of individual findings

  // Audit scripts that read resource sizes or timings hidden by Timing-Allow-Origin
  corsLimitedAnalysis?: boolean;  // true when at least one cross-origin resource could not be analyzed; the result is a lower bound

  // Script-specific structured data
  details?: object;

  // Issues detected (for audit scripts)
  issues?: Array<{
    severity: "error" | "warning" | "info";
    message: string;
  }>;

  // Tracking scripts (status: "tracking")
  message?: string;      // Human-readable status message
  getDataFn?: string;    // window function to call for data: evaluate_script(`${getDataFn}()`). May be a dotted path such as "loafHelpers.getData"

  // Error info (status: "error" or "unsupported")
  error?: string;
}
```

---

## Execution Patterns

### Pattern 1: Fully synchronous

Scripts that read DOM or `performance.getEntriesByType()` directly. Return JSON at the end of the IIFE.

```js
// Example: TTFB.js
(() => {
  const [nav] = performance.getEntriesByType("navigation");
  if (!nav) return { script: "TTFB", status: "error", error: "No navigation entry" };

  const value = Math.round(nav.responseStart);
  const rating = value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";

  // Human output
  console.log(`TTFB: ${value}ms (${rating})`);

  // Agent output
  return {
    script: "TTFB",
    status: "ok",
    metric: "TTFB",
    value,
    unit: "ms",
    rating,
    thresholds: { good: 800, needsImprovement: 1800 },
  };
})();
```

**Scripts using this pattern:** TTFB, TTFB-Sub-Parts, FCP, Find-render-blocking-resources, Script-Loading, LCP-Video-Candidate, Resource-Hints, Resource-Hints-Validation, Priority-Hints-Audit, Validate-Preload-Async-Defer-Scripts, Fonts-Preloaded, Service-Worker-Analysis, Back-Forward-Cache, Content-Visibility, Critical-CSS-Detection, Inline-CSS-Info-and-Size, Inline-Script-Info-and-Size, First-And-Third-Party-Script-Info, First-And-Third-Party-Script-Timings, Compression-Audit, JS-Execution-Time-Breakdown, CSS-Media-Queries-Analysis, Client-Side-Redirect-Detection, SSR-Hydration-Data-Analysis, Network-Bandwidth-Connection-Quality, Find-Above-The-Fold-Lazy-Loaded-Images, Find-Images-With-Lazy-and-Fetchpriority, Find-non-Lazy-Loaded-Images-outside-of-the-viewport, SVG-Embedded-Bitmap-Analysis, Prefetch-Resource-Validation, TTFB-Resources.

### Pattern 2: Buffered observer

Chrome exposes some entry types only through a `PerformanceObserver`: `largest-contentful-paint`, `layout-shift`, `longtask`, `event` and `first-input`. `performance.getEntriesByType()` returns `[]` for them, so a synchronous read gives an empty result. Collect them with a buffered observer and wait briefly for it to deliver, which makes the script async (Pattern 4).

Entry types that `getEntriesByType()` does return can be read synchronously: `navigation`, `resource`, `paint`, `mark`, `measure` and `long-animation-frame`.

```js
// Example: LCP.js
(async () => {
  if (!PerformanceObserver.supportedEntryTypes?.includes("largest-contentful-paint")) {
    return { script: "LCP", status: "unsupported", error: "largest-contentful-paint entries not supported in this browser" };
  }

  // Collect buffered entries; 100ms lets the observer process them on busy pages
  const lastEntry = await new Promise((resolve) => {
    const entries = [];
    const obs = new PerformanceObserver((list) => entries.push(...list.getEntries()));
    obs.observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => { obs.disconnect(); resolve(entries.at(-1) ?? null); }, 100);
  });
  if (!lastEntry) return { script: "LCP", status: "error", error: "No LCP entries yet" };

  const activationStart = performance.getEntriesByType("navigation")[0]?.activationStart ?? 0;
  const value = Math.round(Math.max(0, lastEntry.startTime - activationStart));
  const rating = value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";

  return {
    script: "LCP", status: "ok", metric: "LCP", value, unit: "ms", rating,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: { element: selector, elementType: type, url: lastEntry.url, sizePixels: lastEntry.size }
  };
})();
```

Always check `PerformanceObserver.supportedEntryTypes` first. On browsers without the entry type a script must return `status: "unsupported"`, not a value that looks like a passing result.

The repository enforces this with an ESLint rule (`no-restricted-syntax` in `eslint.config.mjs`) that rejects `getEntriesByType()` for the observer-only types.

**Scripts using this pattern:** LCP, CLS, LCP-Subparts, LCP-Trail, LCP-Image-Entropy, LongTask, Layout-Shift-Loading-and-Interaction.

### Pattern 3: Tracking observers

Scripts that observe ongoing user interactions cannot return meaningful data synchronously. They return `status: "tracking"` immediately, and expose a `window.getXxx()` function for agents to call later.

```js
// Return at the end of the IIFE:
return {
  script: "INP",
  status: "tracking",
  message: "INP tracking active. Interact with the page then call getINP() for results.",
  getDataFn: "getINP",
};
```

**Agent workflow for tracking scripts:**

```
1. evaluate_script(INP.js)          → { status: "tracking", getDataFn: "getINP" }
2. (user interacts with the page)
3. evaluate_script("getINP()")      → { script: "INP", status: "ok", value: 350, rating: "needs-improvement", ... }
```

**The window function must also return a structured object** matching the same schema, including when nothing has been recorded yet:

- `status: "ok"` with `count: 0` when zero is a valid result (no long tasks, no long animation frames).
- `status: "error"` with an `error` message when there is nothing to report yet and the agent needs to act first (no interactions recorded).

**Scripts using this pattern:** INP, Interactions, Input-Latency-Breakdown, Layout-Shift-Loading-and-Interaction, Scroll-Performance, Long-Animation-Frames (ongoing tracking), LongTask (ongoing tracking), Long-Animation-Frames-Script-Attribution.

### Pattern 4: Async scripts

Scripts that use `async/await` or `setTimeout`. The IIFE returns a Promise, which `evaluate_script` can await (Chrome DevTools `awaitPromise`).

Keep the existing `async () => {}` wrapper. Add a `return` statement with structured data at the end. The agent receives the resolved value.

A script wrapped in `void (async () => {...})()` discards its return value. Never use `void` on the IIFE.

**Scripts using this pattern:** Image-Element-Audit (fetches content-type headers), Video-Element-Audit, SVG-Embedded-Bitmap-Analysis, Service-Worker-Analysis, and every script that collects observer-only entry types (Pattern 2).

---

## Script-Specific Schemas

### Core Web Vitals

#### LCP

```json
{
  "script": "LCP",
  "status": "ok",
  "metric": "LCP",
  "value": 1240,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "element": "img.hero",
    "elementType": "Image",
    "url": "https://web.dev/hero.jpg",
    "sizePixels": 756000
  }
}
```

#### CLS

Returns buffered CLS immediately and keeps tracking. Always call `getCLS()` after interactions to get an updated value.

```json
{
  "script": "CLS",
  "status": "ok",
  "metric": "CLS",
  "value": 0.05,
  "unit": "score",
  "rating": "good",
  "thresholds": { "good": 0.1, "needsImprovement": 0.25 },
  "message": "CLS tracking active. Call getCLS() for updated value after page interactions.",
  "getDataFn": "getCLS"
}
```

`getCLS()` returns the same shape with the latest accumulated value.

#### INP (tracking)

```json
{
  "script": "INP",
  "status": "tracking",
  "message": "INP tracking active. Interact with the page then call getINP() for results.",
  "getDataFn": "getINP"
}
```

`getINP()` returns:

```json
{
  "script": "INP",
  "status": "ok",
  "metric": "INP",
  "value": 350,
  "unit": "ms",
  "rating": "needs-improvement",
  "thresholds": { "good": 200, "needsImprovement": 500 },
  "details": {
    "totalInteractions": 5,
    "worstEvent": "click -> button.submit",
    "phases": { "inputDelay": 120, "processingTime": 180, "presentationDelay": 50 }
  }
}
```

If no interactions yet, `getINP()` returns `status: "error"` with `getDataFn: "getINP"` — retry after user interaction.

`getINPDetails()` returns the full sorted interaction list (array of up to 15 entries). Use when `getINP()` shows poor INP and you need to identify patterns across multiple slow interactions:

```json
[
  {
    "formattedName": "click → button.submit",
    "duration": 450,
    "startTime": 1200,
    "phases": { "inputDelay": 120, "processingTime": 280, "presentationDelay": 50 }
  }
]
```

#### LCP-Subparts

```json
{
  "script": "LCP-Subparts",
  "status": "ok",
  "metric": "LCP",
  "value": 2100,
  "unit": "ms",
  "rating": "needs-improvement",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "element": "img.hero",
    "url": "hero.jpg",
    "subParts": {
      "ttfb": { "value": 450, "percent": 21, "overTarget": false },
      "resourceLoadDelay": { "value": 120, "percent": 6, "overTarget": false },
      "resourceLoadTime": { "value": 1200, "percent": 57, "overTarget": true },
      "elementRenderDelay": { "value": 330, "percent": 16, "overTarget": true }
    },
    "slowestPhase": "resourceLoadTime"
  }
}
```

#### LCP-Trail

```json
{
  "script": "LCP-Trail",
  "status": "ok",
  "metric": "LCP",
  "value": 1240,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "candidateCount": 2,
    "finalElement": "img.hero",
    "candidates": [
      { "index": 1, "selector": "h1", "time": 800, "elementType": "Text block" },
      {
        "index": 2,
        "selector": "img.hero",
        "time": 1240,
        "elementType": "Image",
        "url": "hero.jpg"
      }
    ]
  }
}
```

#### LCP-Image-Entropy

`items` holds the 50 most relevant images: the LCP image first, then the low-entropy ones, then the lowest bits per pixel. `count` and `details` cover every image.

```json
{
  "script": "LCP-Image-Entropy",
  "status": "ok",
  "count": 5,
  "details": {
    "totalImages": 5,
    "lowEntropyCount": 1,
    "lcpImageEligible": true,
    "lcpImage": {
      "url": "hero.jpg",
      "bpp": 1.65,
      "isLowEntropy": false
    }
  },
  "items": [
    {
      "url": "hero.jpg",
      "width": 1200,
      "height": 630,
      "fileSizeBytes": 156000,
      "bpp": 1.65,
      "isLowEntropy": false,
      "lcpEligible": true,
      "isLCP": true
    }
  ],
  "issues": []
}
```

#### LCP-Video-Candidate

```json
{
  "script": "LCP-Video-Candidate",
  "status": "ok",
  "metric": "LCP",
  "value": 1800,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "isVideo": true,
    "posterUrl": "https://web.dev/hero.avif",
    "posterFormat": "avif",
    "posterPreloaded": true,
    "fetchpriorityOnPreload": "high",
    "isCrossOrigin": false,
    "videoAttributes": { "autoplay": true, "muted": true, "playsinline": true, "preload": "auto" }
  },
  "issues": []
}
```

### Loading

#### TTFB

```json
{
  "script": "TTFB",
  "status": "ok",
  "metric": "TTFB",
  "value": 245,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 800, "needsImprovement": 1800 }
}
```

#### TTFB-Sub-Parts

```json
{
  "script": "TTFB-Sub-Parts",
  "status": "ok",
  "metric": "TTFB",
  "value": 245,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 800, "needsImprovement": 1800 },
  "details": {
    "subParts": {
      "redirectWait": { "value": 0, "unit": "ms" },
      "serviceWorkerCache": { "value": 0, "unit": "ms" },
      "dnsLookup": { "value": 5, "unit": "ms" },
      "tcpConnection": { "value": 30, "unit": "ms" },
      "sslTls": { "value": 45, "unit": "ms" },
      "serverResponse": { "value": 165, "unit": "ms" }
    },
    "slowestPhase": "serverResponse"
  }
}
```

#### Find-render-blocking-resources

```json
{
  "script": "Find-render-blocking-resources",
  "status": "ok",
  "count": 3,
  "details": {
    "totalBlockingUntilMs": 450,
    "totalSizeBytes": 135000,
    "byType": { "link": 2, "script": 1 }
  },
  "items": [
    {
      "type": "link",
      "url": "https://web.dev/style.css",
      "shortName": "style.css",
      "responseEndMs": 450,
      "durationMs": 200,
      "sizeBytes": 45000
    }
  ]
}
```

#### Script-Loading

`items` holds the 50 scripts to look at first: render-blocking, then third-party, then the largest. `count` and `details` cover every script. `corsLimitedAnalysis` is `true` when `details.sizeUnknownCount` is above zero, so `details.totalSizeBytes` is a lower bound.

```json
{
  "script": "Script-Loading",
  "status": "ok",
  "count": 8,
  "rating": "needs-improvement",
  "details": {
    "totalSizeBytes": 245000,
    "sizeUnknownCount": 0,
    "byStrategy": { "blocking": 2, "async": 4, "defer": 1, "module": 1 },
    "byParty": { "firstParty": 5, "thirdParty": 3 },
    "thirdPartyBlockingCount": 1
  },
  "items": [
    {
      "url": "https://web.dev/app.js",
      "shortName": "app.js",
      "strategy": "blocking",
      "location": "head",
      "party": "first",
      "sizeBytes": 85000,
      "sizeKnown": true,
      "durationMs": 120
    }
  ],
  "issues": [
    { "severity": "error", "message": "2 blocking scripts in <head>" },
    { "severity": "error", "message": "1 third-party blocking script" }
  ]
}
```

#### Compression-Audit

Synchronous. `count` is the number of uncompressed text resources; `items` holds the 50 with the largest estimated savings, while `details` totals the whole set. A cross-origin resource without `Timing-Allow-Origin` reports zero for every size, so it is counted in `sizeUnknownCount` (left out of `items`) and `corsLimitedAnalysis` is `true`. Resources under 1 KB are counted in `skippedSmallCount`, so the counts add up to `totalTextResources`. `estimatedSavingsBytes` applies a typical gzip/brotli reduction (70% for JS, CSS, HTML, JSON, SVG and XML; 50% for TTF/OTF), so it is an estimate.

```json
{
  "script": "Compression-Audit",
  "status": "ok",
  "count": 1,
  "corsLimitedAnalysis": true,
  "details": {
    "totalTextResources": 6,
    "compressedCount": 4,
    "uncompressedCount": 1,
    "sizeUnknownCount": 1,
    "skippedSmallCount": 0,
    "totalUncompressedBytes": 61440,
    "estimatedSavingsBytes": 43008,
    "byEncoding": { "br": 3, "gzip": 1, "none": 1 },
    "contentEncodingSupported": true
  },
  "items": [
    {
      "url": "https://web.dev/app.css",
      "shortName": "app.css",
      "type": "css",
      "encoding": "none",
      "encodedBytes": 61440,
      "decodedBytes": 61440,
      "estimatedSavingsBytes": 43008
    }
  ],
  "issues": [
    { "severity": "warning", "message": "1 text resource(s) served without compression; enabling gzip or brotli could save about 42.0 KB" },
    { "severity": "info", "message": "1 cross-origin text resource(s) without Timing-Allow-Origin report zero sizes, so their compression is unknown" }
  ]
}
```

#### Service-Worker-Analysis

Async. Returns one item per registration. `cacheHitRate` is computed over the resources whose source is known: a cross-origin resource without `Timing-Allow-Origin` reports zero for every size, so it is counted in `fromUnknown` and left out of the rate. `rating` is present only when a rate exists, and `cacheStorage` lists the 20 largest caches (`cacheStorageCount` is the total). With no registration the script returns `status: "ok"`, `count: 0` and an info issue.

```json
{
  "script": "Service-Worker-Analysis",
  "status": "ok",
  "count": 1,
  "rating": "needs-improvement",
  "details": {
    "controlled": true,
    "controllerState": "activated",
    "swOverheadMs": 0.8,
    "totalResources": 12,
    "swIntercepted": 3,
    "notIntercepted": 9,
    "fromCache": 1,
    "fromNetwork": 1,
    "fromUnknown": 1,
    "cacheHitRate": 50,
    "savedBytes": 650,
    "cacheStorageCount": 1,
    "cacheStorage": [{ "name": "precache", "entries": 1 }]
  },
  "items": [
    {
      "scope": "https://web.dev/",
      "scriptURL": "https://web.dev/sw.js",
      "state": "active",
      "hasWaiting": false,
      "hasInstalling": false,
      "navigationPreloadEnabled": false,
      "navigationPreloadHeaderValue": "true"
    }
  ],
  "issues": [
    { "severity": "warning", "message": "Moderate SW cache hit rate (50%). Review the caching strategy for more resources." },
    { "severity": "info", "message": "1 intercepted resource(s) are cross-origin without Timing-Allow-Origin, so their source is unknown. The hit rate excludes them." }
  ]
}
```

#### JS-Execution-Time-Breakdown

`criticalBundles` lists the scripts over 1 MB decoded (at most 20, largest first). `items` holds the first 50 scripts, and a script whose size is hidden by a missing `Timing-Allow-Origin` header has `corsRestricted: true`, which sets `corsLimitedAnalysis` to `true`.

```json
{
  "script": "JS-Execution-Time-Breakdown",
  "status": "ok",
  "count": 2,
  "details": {
    "blockingCount": 1,
    "nonBlockingCount": 1,
    "totalTransferBytes": 1300644,
    "totalDecodedBytes": 1300044,
    "totalDownloadMs": 6,
    "totalEstParseMobileMs": 1270,
    "splitCandidatesCount": 1,
    "domInteractiveMs": 9,
    "domContentLoadedMs": 9,
    "loadEventMs": 9,
    "criticalBundles": [
      { "shortName": "big.js", "decodedBytes": 1300024, "transferBytes": 1300324, "estimatedParseMobileMs": 1270, "estimatedParseDesktopMs": 423 }
    ]
  },
  "items": [
    { "shortName": "big.js", "isBlocking": true, "downloadMs": 3, "estimatedParseMobileMs": 1270, "transferBytes": 1300324, "decodedBytes": 1300024, "corsRestricted": false }
  ],
  "issues": [{ "severity": "error", "message": "1 render-blocking script(s) delay HTML parsing" }]
}
```

#### FCP

`value` is measured from `activationStart` on prerendered pages. `details` splits it into three phases that add up to `value`: TTFB, the wait for the last render-blocking resource, and the rest until the paint. `items` lists the render-blocking resources, the last to finish first (at most 50).

```json
{
  "script": "FCP",
  "status": "ok",
  "metric": "FCP",
  "value": 1240,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 1800, "needsImprovement": 3000 },
  "details": { "ttfbMs": 180, "renderBlockingLoadMs": 620, "renderDelayMs": 440, "blockingResourceCount": 2 },
  "items": [{ "url": "app.css", "type": "CSS", "durationMs": 310 }]
}
```

#### Resource-Hints

`items` holds at most 50 hints, those with an error or a warning first, and `count` is the total. `details.sizeUnknownCount` counts the third-party resources whose size is hidden by a missing `Timing-Allow-Origin` header; `corsLimitedAnalysis` is `true` when it is above zero, and the `sizeBytes` of `missingPreconnects` is then a lower bound. `details.missingPreconnects` lists the third-party origins without a preconnect (at most 20). `details.missingPreconnectsCount` is the total.

```json
{
  "script": "Resource-Hints",
  "status": "ok",
  "details": {
    "byType": { "preload": 2, "preconnect": 1 },
    "missingPreconnectsCount": 1,
    "missingPreconnects": [
      { "origin": "https://cdn.example", "requestCount": 6, "sizeBytes": 84000, "resourceTypes": ["script", "img"], "recommendedHint": "preconnect" }
    ]
  }
}
```

#### Resource-Hints-Validation

`items` lists the origins that need a hint and the origins that have both `preconnect` and `dns-prefetch` (at most 50).

```json
{
  "script": "Resource-Hints-Validation",
  "status": "ok",
  "items": [
    { "domain": "https://cdn.example", "requestCount": 6, "action": "add-preconnect", "recommendedHint": "preconnect" },
    { "domain": "https://fonts.example", "requestCount": 2, "action": "remove-dns-prefetch", "recommendedHint": "preconnect" }
  ]
}
```

#### Priority-Hints-Audit and Validate-Preload-Async-Defer-Scripts

Issues keep `{ severity, message }`. The fix is the last sentence of the message, after `Fix:`. `Validate-Preload-Async-Defer-Scripts` returns one item per script, an issue replacing the valid entry of the same URL (at most 50).

```json
{
  "script": "Validate-Preload-Async-Defer-Scripts",
  "status": "ok",
  "items": [{ "url": "app.js", "type": "blocking", "strategy": "defer", "location": "head", "reviewNote": "" }],
  "issues": [{ "severity": "warning", "message": "app.js is preloaded and loaded with defer. Fix: remove the preload or the defer." }]
}
```

#### Fonts-Preloaded-Loaded-and-used-above-the-fold

`items` lists the loaded fonts and `usedFonts` the fonts used above the fold, the two lists the Visualizer reads. `details.preloadedFonts` lists the preload links (at most 20).

```json
{
  "script": "Fonts-Preloaded-Loaded-and-used-above-the-fold",
  "status": "ok",
  "count": 1,
  "details": {
    "preloadedCount": 1,
    "loadedCount": 1,
    "usedAboveFoldCount": 1,
    "preloadedNotUsedCount": 0,
    "usedNotPreloadedCount": 0,
    "preloadedFonts": [{ "family": "inter", "href": "https://cdn.example/inter.woff2", "fontType": "font/woff2", "crossorigin": "anonymous", "thirdParty": true }]
  },
  "items": [{ "family": "Inter", "weight": "400", "style": "normal", "display": "swap" }],
  "usedFonts": [{ "family": "Inter", "weight": "400", "style": "normal", "elements": 12 }]
}
```

#### SSR-Hydration-Data-Analysis

`details.frameworks` summarizes each detected framework. `items` lists the Next.js props and the Astro islands with one shape, the biggest first (at most 30). `flags` holds `large-array`, `deeply-nested` or `sensitive-key`, and `detail` is the client directive of an island. Only key names are checked for sensitive data, so a value that contains the word "token" is not flagged.

```json
{
  "script": "SSR-Hydration-Data-Analysis",
  "status": "ok",
  "count": 1,
  "details": {
    "frameworksFound": 1,
    "totalHydrationBytes": 4200,
    "otherInlineBytes": 900,
    "hasExceedingThreshold": false,
    "frameworks": [{ "name": "Next.js", "sizeBytes": 4200, "thresholdBytes": 51200, "exceedsThreshold": false }]
  },
  "items": [
    { "framework": "Next.js", "kind": "prop", "name": "rows", "sizeBytes": 3100, "flags": ["large-array"], "detail": null },
    { "framework": "Astro", "kind": "island", "name": "Counter.js", "sizeBytes": 20, "flags": [], "detail": "load" }
  ],
  "issues": [{ "severity": "warning", "message": "pageProps has keys that look sensitive (session.token). Everything in pageProps is sent to every visitor." }]
}
```

#### CSS-Media-Queries-Analysis

`details.performanceImpact` estimates the cost of the desktop-only CSS for each device profile, in numbers rounded to one decimal. It is `null` when there is no desktop-only CSS. The detailed console report stays opt-in through `analyzeCSSPerformanceImpact()`.

```json
{
  "script": "CSS-Media-Queries-Analysis",
  "status": "ok",
  "count": 2,
  "details": {
    "corsBlockedCount": 0,
    "performanceImpact": {
      "unnecessaryBytes": 1200,
      "totalClasses": 4,
      "totalProperties": 9,
      "deviceImpact": {
        "Mid-range (Moto G Power, iPhone SE)": { "renderBlockingTimeMs": 3.1, "runtimeOverheadMs": 0.1, "fcpImpactMs": 1.9, "lcpImpactMs": 1.2, "inpOverheadMs": 0.1 }
      }
    }
  }
}
```

#### Content-Visibility

With no usage the script returns `count: 0`, no items and an `info` issue.

```json
{
  "script": "Content-Visibility",
  "status": "ok",
  "count": 0,
  "details": { "autoCount": 0, "hiddenCount": 0 },
  "items": [],
  "issues": [{ "severity": "info", "message": "No content-visibility usage found. Consider content-visibility: auto on below-the-fold sections to reduce the initial render cost." }]
}
```

### Interaction

Tracking scripts return `status: "tracking"` first. The function named by `getDataFn` returns the full result. Items are capped at 50 (20 for frames) and sorted by relevance; `count` holds the total.

#### Interactions (tracking)

```json
{
  "script": "Interactions",
  "status": "tracking",
  "message": "Tracking interactions. Interact with the page then call getInteractionSummary() for results.",
  "getDataFn": "getInteractionSummary"
}
```

`getInteractionSummary()`:

```json
{
  "script": "Interactions",
  "status": "ok",
  "count": 5,
  "details": {
    "totalInteractions": 5,
    "worstMs": 312,
    "avgMs": 140,
    "p75Ms": 210,
    "byRating": { "good": 3, "needs-improvement": 1, "poor": 1 }
  },
  "items": [{ "type": "click", "durationMs": 312, "rating": "needs-improvement" }],
  "issues": [{ "severity": "warning", "message": "click interaction took 312ms (needs-improvement), above the 200ms threshold" }]
}
```

`items` is sorted slowest first, and `issues` lists at most the 10 slowest interactions that are not good.

#### Input-Latency-Breakdown (tracking)

```json
{
  "script": "Input-Latency-Breakdown",
  "status": "tracking",
  "message": "Tracking input latency by event type. Interact with the page then call getInputLatencyBreakdown().",
  "getDataFn": "getInputLatencyBreakdown"
}
```

`getInputLatencyBreakdown()` returns `status: "error"` until an interaction is recorded. Then:

```json
{
  "script": "Input-Latency-Breakdown",
  "status": "ok",
  "count": 2,
  "details": { "eventTypes": { "click": { "count": 3, "p75Ms": 260, "inputDelayMs": 4, "processingMs": 240, "presentationMs": 16 } } },
  "items": [{ "type": "click", "count": 3, "p75Ms": 260, "inputDelayMs": 4, "processingMs": 240, "presentationMs": 16, "rating": "needs-improvement" }],
  "issues": [{ "severity": "warning", "message": "click P75 is 260ms (needs-improvement). Bottleneck: Processing. Fix: optimize the event handlers or debounce them." }]
}
```

#### Forced-Synchronous-Layout (tracking)

```json
{
  "script": "Forced-Synchronous-Layout",
  "status": "tracking",
  "count": 0,
  "message": "FSL Detector active. Reproduce the interaction then call getFSLSummary() to inspect results.",
  "getDataFn": "getFSLSummary",
  "stopFn": "stopFSLDetector"
}
```

`getFSLSummary()` groups the events by property, access type and element:

```json
{
  "script": "Forced-Synchronous-Layout",
  "status": "ok",
  "count": 30,
  "details": { "byProperty": { "offsetWidth": 15, "getBoundingClientRect()": 15 }, "byElement": { "div#box": 30 }, "fastestSinceLastMutationMs": 0.02 },
  "items": [{ "property": "offsetWidth", "accessType": "read", "element": "div#box", "count": 15, "fastestSinceLastMutationMs": 0.02 }],
  "issues": [{ "severity": "error", "message": "offsetWidth triggered 15 forced synchronous layouts. Read layout properties before writing to the DOM." }]
}
```

The detector sees mutations made through `classList`, `setAttribute`, `style.setProperty` and `style.cssText`.

#### Layout-Shift-Loading-and-Interaction

Immediately returns the buffered CLS (the largest session window), plus a summary function for ongoing tracking. `details.topElements` lists the five elements that shifted the most, and `getLayoutShiftSummary()` returns the same value.

```json
{
  "script": "Layout-Shift-Loading-and-Interaction",
  "status": "tracking",
  "metric": "CLS",
  "value": 0.08,
  "unit": "score",
  "rating": "good",
  "thresholds": { "good": 0.1, "needsImprovement": 0.25 },
  "details": {
    "currentCLS": 0.08,
    "shiftCount": 3,
    "countedShifts": 3,
    "excludedShifts": 0,
    "topElements": [{ "selector": "#banner", "shiftCount": 2, "totalImpact": 0.06 }]
  },
  "message": "Layout shift tracking active. Call getLayoutShiftSummary() for full element attribution.",
  "getDataFn": "getLayoutShiftSummary"
}
```

#### Long-Animation-Frames

Returns buffered LoAF data immediately. Ongoing tracking continues. `items` holds the 20 frames with the most blocking time, in the same shape at start and in `getLoAFSummary()`, each with its 10 slowest scripts.

```json
{
  "script": "Long-Animation-Frames",
  "status": "tracking",
  "count": 3,
  "details": {
    "totalLoAFs": 3,
    "withBlockingTime": 2,
    "totalBlockingTimeMs": 280,
    "worstBlockingMs": 180
  },
  "items": [
    {
      "startTimeMs": 512,
      "durationMs": 230,
      "blockingDurationMs": 180,
      "scripts": [{ "invoker": "TimerHandler:setTimeout", "source": "app.js", "durationMs": 150, "forcedStyleAndLayoutMs": 0 }]
    }
  ],
  "message": "Tracking long animation frames. Call getLoAFSummary() for full script attribution.",
  "getDataFn": "getLoAFSummary"
}
```

#### Long-Animation-Frames-Script-Attribution

Returns buffered LoAF data immediately (do not wait for a timer). `functions` lists the five slowest functions of each file.

```json
{
  "script": "Long-Animation-Frames-Script-Attribution",
  "status": "ok",
  "details": {
    "frameCount": 5,
    "totalBlockingMs": 420,
    "byCategory": {
      "first-party": { "durationMs": 180, "count": 3 },
      "third-party": { "durationMs": 210, "count": 2 },
      "framework": { "durationMs": 30, "count": 1 }
    }
  },
  "items": [
    {
      "file": "app.js",
      "category": "first-party",
      "durationMs": 180,
      "count": 3,
      "functions": [{ "name": "startupWork", "invoker": "TimerHandler:setTimeout", "durationMs": 150 }]
    }
  ]
}
```

#### Long-Animation-Frames-Helpers (tracking)

Installs `window.loafHelpers`. `getDataFn` is the dotted path `loafHelpers.getData`, which returns a summary with the 20 longest frames. `loafHelpers.getRawData()` returns the raw frame array for custom analysis.

```json
{
  "script": "Long-Animation-Frames-Helpers",
  "status": "tracking",
  "message": "LoAF Helpers loaded. Use loafHelpers.summary(), loafHelpers.topScripts(), etc.",
  "getDataFn": "loafHelpers.getData"
}
```

#### Scroll-Performance (tracking)

`details` keeps the counts as numbers. `items` lists the non-passive listeners and the CSS findings with the same fields, without duplicates.

```json
{
  "script": "Scroll-Performance",
  "status": "tracking",
  "details": {
    "nonPassiveListeners": 2,
    "cssAudit": {
      "smoothScrollElements": 1,
      "willChangeElements": 1,
      "contentVisibilityElements": 3,
      "overscrollElements": 1
    }
  },
  "items": [
    { "kind": "non-passive-listener", "target": "WINDOW", "detail": "wheel" },
    { "kind": "will-change", "target": "div#card", "detail": "transform" },
    { "kind": "overscroll", "target": "div#panel", "detail": "contain" }
  ],
  "issues": [
    { "severity": "warning", "message": "2 non-passive scroll or touch listener(s). Add { passive: true } so scrolling does not wait for JavaScript." },
    { "severity": "info", "message": "will-change is set on 1 element(s). Remove it from elements that do not animate, since each one keeps a compositor layer." }
  ],
  "message": "Scroll performance tracking active. Scroll the page then call getScrollSummary() for FPS data.",
  "getDataFn": "getScrollSummary"
}
```

#### LongTask

Returns buffered long tasks immediately. Ongoing tracking continues. `items` lists the 50 slowest tasks, in the same shape at start and in `getLongTaskSummary()`. With no long tasks the summary returns `status: "ok"` and `count: 0`.

```json
{
  "script": "LongTask",
  "status": "tracking",
  "count": 4,
  "details": {
    "totalBlockingTimeMs": 380,
    "worstTaskMs": 220,
    "bySeverity": { "critical": 1, "high": 1, "medium": 2, "low": 0 }
  },
  "items": [{ "startTimeMs": 512, "durationMs": 220, "blockingTimeMs": 170, "severity": "high", "attribution": "window" }],
  "message": "Tracking long tasks. Call getLongTaskSummary() for statistics.",
  "getDataFn": "getLongTaskSummary"
}
```

### Media

#### Image-Element-Audit (async)

`items` holds the 50 images to look at first: the LCP image, then those with the most errors and warnings. `count` and `details` cover every image. The format comes from the `Content-Type` of the response; when a cross-origin image blocks `fetch()` it is guessed from the URL, `details.formatGuessedCount` counts those images and `corsLimitedAnalysis` is `true`.

```json
{
  "script": "Image-Element-Audit",
  "status": "ok",
  "count": 8,
  "details": {
    "totalImages": 8,
    "inViewport": 3,
    "offViewport": 5,
    "totalErrors": 2,
    "totalWarnings": 3,
    "totalInfos": 1,
    "lcpCandidate": {
      "selector": "img.hero",
      "format": "avif",
      "fetchpriority": "high",
      "loading": "(not set)",
      "preloaded": true
    }
  },
  "items": [
    {
      "selector": "img.hero",
      "url": "hero.avif",
      "format": "avif",
      "inViewport": true,
      "isLCP": true,
      "loading": "(not set)",
      "decoding": "sync",
      "fetchpriority": "high",
      "hasDimensions": true,
      "hasSrcset": false,
      "hasSizes": false,
      "inPicture": false,
      "issues": []
    }
  ],
  "issues": [
    {
      "severity": "warning",
      "message": "img.thumbnail: Missing width/height attributes (CLS risk)"
    }
  ]
}
```

#### Video-Element-Audit

Same shape as Image-Element-Audit but for video elements.

#### SVG-Embedded-Bitmap-Analysis

`details` counts the SVGs, also on a page with none. `spriteOpportunity` is `true` when five or more standalone inline SVGs could share one `<symbol>` sprite.

```json
{
  "script": "SVG-Embedded-Bitmap-Analysis",
  "status": "ok",
  "count": 2,
  "details": { "externalSvgCount": 3, "inlineSvgTotal": 7, "svgsWithUse": 1, "standaloneInlineSvgs": 6, "spriteOpportunity": true },
  "items": [{ "url": "icon.svg", "hasBitmap": true, "bitmapType": "image/png", "sizeBytes": 4500 }],
  "issues": [{ "severity": "warning", "message": "2 SVG files contain embedded bitmaps" }]
}
```

### Resources

#### Network-Bandwidth-Connection-Quality

`rating` follows `effectiveType`: `4g` is `good`, `3g` is `needs-improvement`, `2g` and `slow-2g` are `poor`. It is absent when the type is unknown.

```json
{
  "script": "Network-Bandwidth-Connection-Quality",
  "status": "ok",
  "rating": "good",
  "details": {
    "effectiveType": "4g",
    "downlink": 10,
    "rtt": 50,
    "saveData": false
  }
}
```

---

## Guidelines for Agents

### Reading results

```
// Prefer return value over console output
result = evaluate_script(scriptCode)
if result.status == "ok" → use result.value, result.rating, result.details, result.items
if result.status == "tracking" → call evaluate_script(`${result.getDataFn}()`) after user interaction
if result.status == "error" → check result.error, the browser may not have loaded the page yet
if result.status == "unsupported" → browser does not support the required API (check: Chrome 107+?)
```

### Tracking scripts workflow

```
// 1. Start tracking
result = evaluate_script(INP_js)
// result = { status: "tracking", getDataFn: "getINP" }

// 2. Wait for/trigger user interactions

// 3. Collect data
data = evaluate_script("getINP()")
// data = { status: "ok", value: 350, rating: "needs-improvement", ... }
```

### Making decisions from return values

- `rating === "good"` → no action needed for this metric
- `rating === "needs-improvement"` → investigate, check `details` and `issues`
- `rating === "poor"` → high priority fix, check `issues` for specific problems
- `count > 0` and `issues.length > 0` → audit found actionable problems
- `count === 0` → nothing to audit (no render-blocking resources, no images, etc.)

---

## Implementation Rules

1. **Numbers are numbers** — never `"245ms"`, always `245`. The agent formats as needed.
2. **Consistent field names** — `value` for the metric, `unit` for its unit, `rating` for the threshold assessment.
3. **Issues are actionable** — each issue message describes what to fix, not what was found.
4. **Items are homogeneous** — all objects in `items[]` have the same fields.
5. **No DOM references in return value** — elements can't be serialized to JSON.
6. **Keep console output unchanged** — the return value is additive, not a replacement.
7. **Window functions match the schema** — `getINP()`, `getLoAFSummary()`, etc. return the same structured shape, and never `undefined`.
8. **Bounded output** — `items[]` holds at most 50 entries, sorted by relevance, and the whole return stays under 50 KB. Put the total in `count`.
9. **Nested detail stays nested** — phases and groups are objects such as `{ "dnsLookup": { "value": 12, "unit": "ms" } }`, not flattened into `dnsLookupMs`. Renderers adapt to the schema, not the other way around.
10. **Valid statuses only** — `ok`, `tracking`, `error` or `unsupported`, with an `error` message when the status is `error` or `unsupported`.
11. **Hidden cross-origin data is reported, not guessed** — a resource whose timing or size is hidden (no `Timing-Allow-Origin`) reports zeros for every size and timing. Count it (`sizeKnown: false`, `corsRestrictedCount`) instead of treating the zero as a measurement.
12. **Partial analysis is flagged** — when hidden cross-origin data leaves part of the set unanalyzed, set the top-level `corsLimitedAnalysis: true` and report how many resources were skipped in `details` (`sizeUnknownCount`, `corsRestrictedCount`). Set it to `false` when every resource was analyzed.

The rules are checked by `cli/tests/e2e/snippet-contract.test.js`, which runs every script, and every `getDataFn`, on an empty page, a seeded page and a heavy page.
