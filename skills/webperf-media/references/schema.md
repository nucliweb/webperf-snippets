# Script Return Value Schema

All scripts in the skills directory must return a structured JSON object as the IIFE return value. This allows agents using `mcp__chrome-devtools__evaluate_script` to read structured data directly from the return value, rather than parsing human-readable console output.

## Why this matters

The console output of a snippet (with `%c` CSS styling, emojis, tables) is meant for humans reading DevTools. The return value is meant for agents. The scripts in the skills are built without console calls, so the return value of `evaluate_script` is the only output an agent gets.

```
// Agent workflow
result = evaluate_script(scriptCode)  // return value → structured JSON for the agent
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
    code: string;      // What the issue is, kebab-case, stable across runs and versions (see Issue codes)
    severity: "error" | "warning" | "info";
    message: string;
    target?: string;   // The URL, selector or name the issue is about, when there is one issue per thing
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

**Scripts using this pattern:** TTFB, TTFB-Sub-Parts, FCP, Find-render-blocking-resources, Script-Loading, LCP-Video-Candidate, Resource-Hints, Resource-Hints-Validation, Priority-Hints-Audit, Validate-Preload-Async-Defer-Scripts, Fonts-Preloaded, Service-Worker-Analysis, Back-Forward-Cache, Content-Visibility, Critical-CSS-Detection, Inline-CSS-Info-and-Size, Inline-Script-Info-and-Size, First-And-Third-Party-Script-Info, First-And-Third-Party-Script-Timings, Compression-Audit, Third-Party-Impact-by-Domain, JS-Execution-Time-Breakdown, CSS-Media-Queries-Analysis, Client-Side-Redirect-Detection, SSR-Hydration-Data-Analysis, Network-Bandwidth-Connection-Quality, Find-Above-The-Fold-Lazy-Loaded-Images, Find-Images-With-Lazy-and-Fetchpriority, Find-non-Lazy-Loaded-Images-outside-of-the-viewport, SVG-Embedded-Bitmap-Analysis, Prefetch-Resource-Validation, TTFB-Resources.

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

Always check `PerformanceObserver.supportedEntryTypes` first. On browsers without the entry type a script must return `status: "unsupported"`, not a value that looks like a passing result. A tracking script also defines its `getDataFn`, which returns the same `unsupported` object.

When only part of the result depends on an API, the script still runs: it sets a `details.<name>Supported` flag to `false` and reports the fields that depend on the API as `null`, never as `0` or `false`. `loafSupported` (Long Animation Frames) and `renderBlockingSupported` (`renderBlockingStatus` in Resource Timing, Chromium only) follow this rule.

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
- `status: "tracking"` with a `message` and its `getDataFn` when there is nothing to report yet and someone has to act first (no interactions recorded): nothing failed, the snippet is still recording. `status: "error"` is for a snippet that failed.

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
    "url": "https://example.com/hero.jpg",
    "sizePixels": 756000
  }
}
```

`details.element` is a CSS selector that matches only the LCP element, so `document.querySelector(details.element)` returns it: the id when it is unique, otherwise a path of tag, classes and `:nth-of-type()` from the nearest ancestor with a unique id, such as `section.intro:nth-of-type(2) > p.copy:nth-of-type(2)`. LCP-Subparts (`details.element`) and LCP-Trail (`finalElement` and each `selector`) build it the same way.

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

If no interactions yet, `getINP()` returns `status: "tracking"` with a `message` and `getDataFn: "getINP"`: interact with the page and call it again.

The phases describe the whole interaction, not one of its events. A tap fires `pointerdown`, `pointerup` and `click`, and a key press `keydown` and `keyup`, with one `interactionId`. INP, Interactions and Input-Latency-Breakdown group the entries by `interactionId`, also when they arrive in separate observer callbacks, and measure the interaction over its entries painted in the frame of the longest one: `inputDelay` runs from the first `startTime` to the first `processingStart`, `processingTime` to the last `processingEnd`, and `presentationDelay` from there to the paint (`startTime + duration`, never below zero). The interaction is reported under the event whose handler ran longest, or under the `click` or `keydown` when no handler took a millisecond more than theirs; `worstEvent`, the Interactions `type` and the Input-Latency-Breakdown event type follow that rule.

`getINPDetails()` returns the 15 slowest interactions, slowest first, with the total in `count`. `target` is a CSS selector built like `details.element` of LCP, or `null` when the browser reports no target. Use it when `getINP()` shows poor INP and you need to identify patterns across multiple slow interactions. With no interactions yet it returns `status: "tracking"`, a `message`, `count: 0` and no items.

```json
{
  "script": "INP",
  "status": "ok",
  "count": 23,
  "items": [
    {
      "formattedName": "click → button.submit",
      "eventType": "click",
      "target": "#checkout > button.submit",
      "duration": 450,
      "startTime": 1200,
      "phases": { "inputDelay": 120, "processingTime": 280, "presentationDelay": 50 }
    }
  ]
}
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
      "resourceLoadTime": { "value": 1200, "percent": 57, "overTarget": true, "waiting": 1040, "download": 160 },
      "elementRenderDelay": { "value": 330, "percent": 16, "overTarget": true }
    },
    "slowestPhase": "resourceLoadTime"
  }
}
```

`resourceLoadTime.waiting` is the time until the first byte of the response of the LCP resource, and `resourceLoadTime.download` the time to download its body. Both are missing when Resource Timing hides that timing (another origin without `Timing-Allow-Origin`).

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

`items` holds the 50 most relevant images: the LCP image first, then the low-entropy ones, then the lowest bits per pixel. `count` and `details` cover every image. `bpp` follows Chrome's rule: the encoded size in bits over the displayed area in CSS pixels (`displayedWidth` × `displayedHeight`), or over the natural area (`width` × `height`) when the image is upscaled. An image that is not rendered has no displayed area and is left out.

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
      "displayedWidth": 1200,
      "displayedHeight": 630,
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
    "posterUrl": "https://example.com/hero.avif",
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
  },
  "issues": []
}
```

When the rating is not good, `issues` holds one entry that names the TTFB and the slowest phase, a `warning` for `needs-improvement` and an `error` for `poor`:

```json
{
  "issues": [{ "severity": "warning", "message": "TTFB is 996 ms (needs-improvement); server response takes 993 ms of it (100%). Fix: optimize server processing, cache the HTML and check slow queries." }]
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
      "url": "https://example.com/style.css",
      "shortName": "style.css",
      "responseEndMs": 450,
      "durationMs": 200,
      "sizeBytes": 45000
    }
  ]
}
```

#### Script-Loading

`items` holds the 50 scripts to look at first: render-blocking, then third-party, then the largest. `count` and `details` cover every script. `corsLimitedAnalysis` is `true` when `details.sizeUnknownCount` is above zero, so `details.totalSizeBytes` is a lower bound. A classic script with `nomodule` has the strategy `nomodule` and is never blocking: a browser that supports modules does not fetch it, so its size is known (0 bytes).

```json
{
  "script": "Script-Loading",
  "status": "ok",
  "count": 8,
  "rating": "needs-improvement",
  "details": {
    "totalSizeBytes": 245000,
    "sizeUnknownCount": 0,
    "byStrategy": { "blocking": 2, "async": 4, "defer": 1, "module": 1, "nomodule": 0 },
    "byParty": { "firstParty": 5, "thirdParty": 3 },
    "thirdPartyBlockingCount": 1
  },
  "items": [
    {
      "url": "https://example.com/app.js",
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
    { "code": "blocking-in-head", "severity": "error", "message": "2 blocking script(s) in <head>" },
    { "code": "third-party-blocking", "severity": "error", "message": "1 third-party blocking script(s)" }
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
      "url": "https://example.com/app.css",
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

#### Third-Party-Impact-by-Domain

Synchronous. `count` is the number of third-party root domains; `items` holds the 50 to look at first (render-blocking, then the most main-thread time, then the largest transfer), while `details` totals every domain. `loafMs` is the script time attributed to the domain in `long-animation-frame` entries (sum of `scripts[].duration` by `sourceURL`), or `null` for every item when `details.loafSupported` is `false`. `details.longFrames` counts the long animation frames on the page and `details.unattributedLoafMs` is the time in them that no third-party script accounts for (first-party scripts, scripts under the 5 ms that the API lists, and style, layout and rendering work); both are `null` when `loafSupported` is `false`. `details.renderBlockingSupported` is `false` in browsers without `renderBlockingStatus` (only Chromium has it); then `renderBlocking` is `null` for every item, `details.blockingDomains` is `null` and an `info` issue says so. A cross-origin request without `Timing-Allow-Origin` reports zero for every size, so it is counted in `sizeUnknownCount` (per domain and in `details`), left out of the byte totals, and `corsLimitedAnalysis` is `true`.

```json
{
  "script": "Third-Party-Impact-by-Domain",
  "status": "ok",
  "count": 2,
  "corsLimitedAnalysis": true,
  "details": {
    "thirdPartyRequests": 3,
    "thirdPartyBytes": 5120,
    "thirdPartyLoafMs": 128,
    "longFrames": 2,
    "unattributedLoafMs": 74,
    "firstPartyRequests": 1,
    "blockingDomains": 1,
    "renderBlockingSupported": true,
    "loafSupported": true,
    "sizeUnknownCount": 1
  },
  "items": [
    { "domain": "tagmanager.example", "requests": 2, "transferBytes": 5120, "sizeUnknownCount": 0, "renderBlocking": true, "loafMs": 128, "loafScripts": 1 },
    { "domain": "metrics.example", "requests": 1, "transferBytes": 0, "sizeUnknownCount": 1, "renderBlocking": false, "loafMs": 0, "loafScripts": 0 }
  ],
  "issues": [
    { "severity": "warning", "message": "1 third-party domain(s) serve render-blocking resources (tagmanager.example); load them async or defer, or self-host them" },
    { "severity": "info", "message": "1 third-party request(s) without Timing-Allow-Origin report zero sizes, so the transfer size is a lower bound" }
  ]
}
```

#### First-And-Third-Party-Script-Info

Synchronous. A script is a resource with `initiatorType` `script`, or one whose URL matches a `<script src>`, `<link rel="preload" as="script">` or `<link rel="modulepreload">` in the document (a preloaded script has `initiatorType` `link` or `other`). Each URL counts once; when the browser fetches it twice, the entry of the `<script>` is kept. `items` holds the 50 scripts to look at first (render-blocking, then third-party, then the largest). `details.renderBlockingSupported` is `false` in browsers without `renderBlockingStatus` (only Chromium has it); then `renderBlocking` is `null` for every item, `details.thirdPartyBlockingCount` is `null` and an `info` issue says so.

```json
{
  "script": "First-And-Third-Party-Script-Info",
  "status": "ok",
  "count": 3,
  "corsLimitedAnalysis": true,
  "details": {
    "firstPartyCount": 1,
    "thirdPartyCount": 2,
    "thirdPartyPercent": 67,
    "firstPartySizeBytes": 48000,
    "thirdPartySizeBytes": 0,
    "thirdPartyBlockingCount": 1,
    "thirdPartyHostCount": 2,
    "sizeUnknownCount": 2,
    "renderBlockingSupported": true
  },
  "items": [
    { "shortName": "tag.js", "host": "tags.example", "firstParty": false, "transferBytes": 0, "sizeKnown": false, "durationMs": 120, "renderBlocking": true }
  ],
  "issues": [
    { "severity": "info", "message": "2 script(s) have an unknown size (missing Timing-Allow-Origin); size totals are a lower bound" },
    { "severity": "error", "message": "1 render-blocking third-party script(s)" }
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
      "scope": "https://example.com/",
      "scriptURL": "https://example.com/sw.js",
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

`value` is measured from `activationStart` on prerendered pages. `details` splits it into three phases that add up to `value`: TTFB, the wait for the last render-blocking resource, and the rest until the paint. `items` lists the render-blocking resources, the last to finish first (at most 50). `details.renderBlockingSupported` is `false` in browsers without `renderBlockingStatus` (only Chromium has it): which resources block rendering is unknown, so `renderBlockingLoadMs`, `renderDelayMs` and `blockingResourceCount` are `null`, `items` is empty, and `value` and `ttfbMs` are still measured.

```json
{
  "script": "FCP",
  "status": "ok",
  "metric": "FCP",
  "value": 1240,
  "unit": "ms",
  "rating": "good",
  "thresholds": { "good": 1800, "needsImprovement": 3000 },
  "details": { "ttfbMs": 180, "renderBlockingLoadMs": 620, "renderDelayMs": 440, "blockingResourceCount": 2, "renderBlockingSupported": true },
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

`items` lists the hints to remove because nothing uses them (`remove-unused-preload`, `remove-unused-preconnect`, `remove-unused-dns-prefetch`, with the `href` of the hint), the origins that need a hint and the origins that have both `preconnect` and `dns-prefetch` (at most 50). `href` is `null` for the last two kinds.

```json
{
  "script": "Resource-Hints-Validation",
  "status": "ok",
  "items": [
    { "domain": "https://old.example", "href": "https://old.example/", "requestCount": 0, "action": "remove-unused-preconnect", "recommendedHint": null },
    { "domain": "https://cdn.example", "href": null, "requestCount": 6, "action": "add-preconnect", "recommendedHint": "preconnect" },
    { "domain": "https://fonts.example", "href": null, "requestCount": 2, "action": "remove-dns-prefetch", "recommendedHint": "preconnect" }
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

One item per distinct media query that targets viewports wider than `details.minWidth`, largest first. `details` gives the totals, `totalUnique` and `uniquenessRatio`, and `bySource` breaks the rules down by stylesheet.

```json
{
  "script": "CSS-Media-Queries-Analysis",
  "status": "ok",
  "count": 2,
  "details": {
    "minWidth": 768,
    "rules": 3,
    "totalUnique": 2,
    "uniquenessRatio": 0.667,
    "classes": 4,
    "properties": 5,
    "bytes": 160,
    "bySource": [{ "source": "https://example.com/app.css", "inline": false, "rules": 3, "bytes": 160 }],
    "corsBlockedCount": 0
  },
  "items": [
    { "mediaQuery": "(min-width: 1024px)", "rules": 2, "files": 1, "classes": 3, "properties": 3, "bytes": 110 },
    { "mediaQuery": "(min-width: 1200px)", "rules": 1, "files": 1, "classes": 1, "properties": 2, "bytes": 50 }
  ],
  "issues": [{ "severity": "info", "message": "3 @media rules for viewports wider than 768px add 160.0 B of CSS that narrower screens download and parse without using. ..." }]
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

Returns buffered LoAF data immediately. Ongoing tracking continues. `items` holds the 20 frames with the most blocking time, in the same shape at start and in `getLoAFSummary()`, each with its 10 slowest scripts. In browsers without `long-animation-frame` entries (Firefox, Safari) the script and `getLoAFSummary()` return `{ "script": "Long-Animation-Frames", "status": "unsupported", "error": "..." }`, not a count of 0.

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

#### Oversized-Images (async)

Compares the pixels of each loaded image file with the pixels drawn (rendered size times `devicePixelRatio`, scaled by `object-fit`). `ratio` is file pixels per pixel drawn: `oversized` at 1.5 or more, `undersized` (blurry) under 0.9. `items` lists the flagged images, the most wasted pixels first (at most 50); `count` and `details` cover all of them. `wastedBytes` and `transferBytes` are `null` when the transfer size is hidden (cross-origin without `Timing-Allow-Origin`); `details.wastedBytes` counts each URL once. Images with a zero-size box, unloaded images and SVGs are counted in `details.skipped*`.

```json
{
  "script": "Oversized-Images",
  "status": "ok",
  "count": 1,
  "details": { "devicePixelRatio": 2, "totalImages": 9, "imagesChecked": 7, "oversized": 1, "undersized": 0, "wastedPixels": 1800000, "wastedBytes": 1614610, "skippedHidden": 1, "skippedNotLoaded": 1, "skippedVector": 0 },
  "items": [
    { "selector": "img#hero", "url": "https://example.com/hero.png", "verdict": "oversized", "naturalWidth": 1600, "naturalHeight": 1200, "renderedWidth": 200, "renderedHeight": 150, "neededWidth": 400, "neededHeight": 300, "ratio": 4, "wastedPixels": 1800000, "transferBytes": 1922153, "wastedBytes": 1614610, "hasSrcset": false, "hasSizes": false }
  ],
  "issues": [{ "severity": "warning", "message": "hero.png: 1600x1200 file for a 400x300 slot at 2x (4x too large, about 1577 KB wasted)" }]
}
```

#### Video-Element-Audit

Same shape as Image-Element-Audit but for video elements.

#### SVG-Embedded-Bitmap-Analysis

`details` counts the SVGs, also on a page with none. `spriteOpportunity` is `true` when five or more standalone inline SVGs could share one `<symbol>` sprite, and it is then also an `info` issue with the counts.

```json
{
  "script": "SVG-Embedded-Bitmap-Analysis",
  "status": "ok",
  "count": 2,
  "details": { "externalSvgCount": 3, "inlineSvgTotal": 7, "svgsWithUse": 1, "standaloneInlineSvgs": 6, "spriteOpportunity": true },
  "items": [{ "url": "icon.svg", "hasBitmap": true, "bitmapType": "image/png", "sizeBytes": 4500 }],
  "issues": [
    { "severity": "warning", "message": "2 SVG file(s) contain embedded bitmaps" },
    { "severity": "info", "message": "6 standalone inline SVGs could share one <symbol> sprite referenced with <use> (1 inline SVG already uses <use>)" }
  ]
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

## Issue codes

Every issue has a `code` that says what it is, so a comparison pairs the issues of two runs without reading their text: the message carries figures, and its wording can change from a version to the next. The code is kebab-case and unique within its snippet, so `script` and `code` together name an issue across the collection. A code never changes once published, and is never reused for another situation. The same situation keeps its code when its severity depends on a threshold.

An issue about one thing among several, one issue per thing, also names it in `target`: the URL of a resource, a CSS selector, or a name such as an event type or a CSS property. Two issues with the same code and different targets are two issues.

### LCP-Image-Entropy

| Code | Severity | When |
|------|----------|------|
| `low-entropy-images` | warning | Images under 0.05 bits per pixel, which Chrome does not take as the LCP |
| `lcp-low-entropy` | error | The LCP image itself has low entropy |
| `lcp-size-unknown` | info | The LCP `<img>` has no file size to read (a `data:` URL, or cross-origin without `Timing-Allow-Origin`) |
| `lcp-not-img` | info | The LCP is the image of another element, such as a CSS background or a video poster |
| `lcp-is-text` | info | The LCP element is text |

### LCP-Video-Candidate

| Code | Severity | When |
|------|----------|------|
| `lcp-not-video` | info | The LCP element is not a `<video>` |
| `lcp-element-removed` | info | The LCP element is no longer in the DOM |
| `late-candidate` | warning | The LCP candidate rendered more than 10 s after the load |
| `first-frame-lcp` | info | The LCP is the first frame of the video, without a poster |
| `first-frame-not-autoplay-muted` | warning | A first-frame LCP on a video without `autoplay` and `muted` |
| `poster-not-preloaded` | warning | The poster has no `<link rel="preload" as="image">` |
| `poster-preload-no-fetchpriority` | info | The preload of the poster has no `fetchpriority="high"` |
| `poster-legacy-format` | info | The poster is not AVIF or WebP |
| `render-time-hidden` | info | `renderTime` is 0: the video is cross-origin without `Timing-Allow-Origin` |
| `preload-none-delays-poster` | warning | `preload="none"` on a video without `autoplay` |

### Script-Loading

| Code | Severity | When |
|------|----------|------|
| `blocking-in-head` | error | Classic scripts without `async`, `defer` or `type="module"` in `<head>` |
| `third-party-blocking` | error | Blocking scripts from a third party |
| `large-blocking` | warning | Blocking scripts larger than 50 KB |
| `could-defer` | info | Blocking scripts other than the last three of `<body>`, which could try `defer` |
| `unknown-size` | info | Scripts whose size is hidden by a missing `Timing-Allow-Origin`, so the total is a lower bound |

### CSS-Media-Queries-Analysis

| Code | Severity | When |
|------|----------|------|
| `no-wide-rules` | info | No `@media` rules for viewports wider than the breakpoint (768 px by default) |
| `wide-rules` | info or warning | `@media` rules for wider viewports that narrower screens download without using, a warning above 50 KB |
| `repeated-queries` | info | Few distinct queries repeated across many `@media` blocks |
| `unreadable-stylesheets` | info | Cross-origin stylesheets whose rules cannot be read |

### Content-Visibility

| Code | Severity | When |
|------|----------|------|
| `missing-intrinsic-size` | warning | An element with `content-visibility: auto` and no `contain-intrinsic-size`; `target` is its selector |
| `not-used` | info | No `content-visibility` on the page |

### Critical-CSS-Detection

| Code | Severity | When |
|------|----------|------|
| `no-inline-critical-css` | error | Render-blocking stylesheets and no inline critical CSS |
| `render-blocking-over-budget` | error | Render-blocking CSS above the 14 KB critical budget |
| `large-not-preloaded` | warning | Render-blocking stylesheets above 10 KB without preload |
| `inline-over-budget` | error | Inline CSS above the 14 KB critical budget |
| `styles-in-body` | warning | Inline style blocks in `<body>` |

### Find-Above-The-Fold-Lazy-Loaded-Images

| Code | Severity | When |
|------|----------|------|
| `lcp-lazy` | error | The LCP candidate image has `loading="lazy"` |
| `lazy-above-fold` | warning | Other images above the fold with `loading="lazy"` |

### Find-Images-With-Lazy-and-Fetchpriority

| Code | Severity | When |
|------|----------|------|
| `lazy-and-high-priority` | error | Elements with both `loading="lazy"` and `fetchpriority="high"` |

### Find-non-Lazy-Loaded-Images-outside-of-the-viewport

| Code | Severity | When |
|------|----------|------|
| `eager-off-viewport` | warning | Images outside the viewport without `loading="lazy"` |

### Find-render-blocking-resources

| Code | Severity | When |
|------|----------|------|
| `render-blocking` | error | Resources that block rendering |

### Fonts-Preloaded-Loaded-and-used-above-the-fold

Each issue names its font in `target`.

| Code | Severity | When |
|------|----------|------|
| `preloaded-unused` | warning | A preloaded font that the content above the fold does not use |
| `used-not-preloaded` | warning | A font used above the fold without preload |
| `preload-no-crossorigin` | error | A font preload without `crossorigin`, which fetches the font twice |

### Inline-CSS-Info-and-Size

| Code | Severity | When |
|------|----------|------|
| `over-budget` | warning | Inline CSS above the 14 KB critical budget |
| `duplicate-blocks` | warning | Style blocks with identical content |
| `large-blocks` | warning | Style blocks above 5 KB |
| `styles-in-body` | warning | Style blocks in `<body>` |

### Webfont-Usage-Analyzer

`load-failed`, `loaded-unused` and `redeclared` name the font file by its URL in `target`, or the face when it has none.

| Code | Severity | When |
|------|----------|------|
| `load-failed` | error | A font that failed to load |
| `loaded-unused` | warning | A loaded font that no rendered element uses |
| `redeclared` | warning | A loaded font declared again later with the same descriptors, so the page uses the other file |
| `blocking-font-display` | warning | Faces with `font-display` `auto` or `block`, which can keep text invisible |
| `heavy-fonts` | warning | Web fonts above 300 KB in total |
| `never-loaded` | info | Faces declared and never loaded |
| `shadowed` | info | Faces declared more than once, whose earlier declarations never loaded |
| `unused-subsets` | info | `unicode-range` subsets the page did not need |
| `size-unknown` | info | Cross-origin font files without `Timing-Allow-Origin`, so the byte totals are a lower bound |
| `unreadable-stylesheets` | info | Cross-origin stylesheets whose font files cannot be matched to faces |
| `elements-capped` | info | Only the first 20,000 elements were scanned for text |

### First-And-Third-Party-Script-Info

| Code | Severity | When |
|------|----------|------|
| `unknown-size` | info | Scripts whose size is hidden by a missing `Timing-Allow-Origin`, so the totals are a lower bound |
| `render-blocking-unsupported` | info | The browser has no `renderBlockingStatus` (only Chromium has it) |
| `third-party-blocking` | error | Third-party scripts that block rendering |
| `many-third-party-hosts` | warning | Scripts from more than 3 third-party hosts |
| `large-third-party` | warning | Third-party scripts above 100 KB in total |

### First-And-Third-Party-Script-Timings

| Code | Severity | When |
|------|----------|------|
| `slow-scripts` | warning | Scripts that take more than 500 ms to load |
| `slow-dns` | warning | A DNS lookup above 100 ms |
| `slow-connection` | warning | A TCP connection above 100 ms |
| `slow-server` | warning | A server response above 200 ms |

### Inline-Script-Info-and-Size

| Code | Severity | When |
|------|----------|------|
| `parser-blocking-in-head` | error | Inline scripts in `<head>` that block the parser |
| `large-inline` | warning | Inline scripts above 2 KB |
| `duplicate-scripts` | warning | Inline scripts with identical content |
| `analytics-in-head` | warning | Analytics scripts that block in `<head>` |

### JS-Execution-Time-Breakdown

| Code | Severity | When |
|------|----------|------|
| `render-blocking` | error | Scripts that block HTML parsing |
| `high-parse-cost` | warning | An estimated parse cost above 500 ms on mobile |
| `split-candidates` | warning | Scripts above 50 KB decoded, candidates for code splitting |
| `low-compression` | warning | A compression ratio below 2x on more than 10 KB of scripts |

### SSR-Hydration-Data-Analysis

| Code | Severity | When |
|------|----------|------|
| `large-hydration-data` | warning | The hydration data of a framework above its threshold; `target` is the framework |
| `large-arrays` | warning | `pageProps` arrays with more than 50 entries |
| `deep-nesting` | warning | `pageProps` nested more than 5 levels |
| `sensitive-keys` | warning | `pageProps` keys that look sensitive |

### Third-Party-Impact-by-Domain

| Code | Severity | When |
|------|----------|------|
| `render-blocking-domains` | warning | Third-party domains that serve render-blocking resources |
| `heavy-domain` | warning | A domain whose scripts take more than 250 ms in long animation frames; `target` is the domain |
| `render-blocking-unsupported` | info | The browser has no `renderBlockingStatus` (only Chromium has it) |
| `loaf-unattributed` | info | Long animation frames with no third-party script attributed |
| `unknown-size` | info | Third-party requests without `Timing-Allow-Origin`, so the transfer size is a lower bound |

### Validate-Preload-Async-Defer-Scripts

Each issue names the preloaded script in `target`.

| Code | Severity | When |
|------|----------|------|
| `orphan-preload` | warning | A preloaded script that the page neither has nor loaded |
| `async-defer-preload` | error | A script with `async` or `defer` that is also preloaded, which raises its priority |
| `module-preload` | warning | An ES module preloaded with `rel="preload"` instead of `rel="modulepreload"` |

### Back-Forward-Cache

| Code | Severity | When |
|------|----------|------|
| `not-restored` | error | A reason the browser gave for not restoring the page from bfcache, after a back or forward navigation; `target` is the reason and its frame |
| `unload-handler` | error | A `window.onunload` handler |
| `cache-control-no-store` | warning | `Cache-Control: no-store` on the page response |
| `iframes` | info | Iframes on the page, whose blockers block the whole page |
| `service-worker` | info | A Service Worker controls the page, which bfcache allows |

### Cache-Strategy-Analysis

Each issue names its resource in `target`, except `header-coverage`. `id` repeats the code, as before the codes.

| Code | Severity | When |
|------|----------|------|
| `static-no-store` | error | A static asset with `no-store` |
| `versioned-short-cache` | warning | A URL with a hash and a short `max-age` |
| `versioned-not-immutable` | info | A URL with a hash and no `immutable` |
| `large-no-cache` | error | A large resource with no effective cache |
| `expires-without-cc` | warning | An `Expires` header without `Cache-Control` |
| `maxage-zero-static` | warning | A static asset with `max-age=0` |
| `short-cache-static` | warning | A static asset with a `max-age` under an hour |
| `uncompressed` | warning | A text resource sent uncompressed |
| `duplicate-uncached` | warning | A resource loaded several times from the network |
| `header-coverage` | info | The share of resources whose cache headers could be read |

### Client-Side-Redirect-Detection

| Code | Severity | When |
|------|----------|------|
| `server-redirects` | warning | Server-side redirects before the document |
| `document-navigation` | error | Same-origin document navigations, likely a client-side redirect |
| `same-origin-navigation` | warning | A same-origin referrer with another path |
| `fast-minimal-navigation` | warning | A small same-origin page that loads fast, possibly a redirect page |

### Compression-Audit

| Code | Severity | When |
|------|----------|------|
| `uncompressed` | warning | Text resources served without compression |
| `unknown-size` | info | Cross-origin text resources without `Timing-Allow-Origin`, whose compression is unknown |
| `content-encoding-unavailable` | info | No `contentEncoding` in Resource Timing, so compression is inferred from the sizes |

### Prefetch-Resource-Validation

Each issue about one prefetch names its URL in `target`.

| Code | Severity | When |
|------|----------|------|
| `no-prefetch` | info | No `rel="prefetch"` hints on the page |
| `missing-as` | warning | A prefetch without `as` |
| `invalid-as` | warning | A prefetch with an `as` value that does not exist |
| `duplicate-prefetch` | warning | A URL prefetched more than once |
| `used-on-current-page` | error | A prefetched resource that the current page uses, which needs `preload` |
| `large-file` | warning | A prefetched file above 500 KB |
| `inappropriate-type` | warning | A prefetched type that may not suit prefetch |
| `too-many-prefetches` | warning | More than 10 prefetch hints |
| `large-total-size` | warning or error | Prefetches above 2 MB in total, an error above 5 MB |

### Priority-Hints-Audit

Each issue names its resource in `target`.

| Code | Severity | When |
|------|----------|------|
| `preload-low-priority` | error | A preload with `fetchpriority="low"` |
| `low-priority-loaded-early` | warning | A `fetchpriority="low"` resource that still loaded early |
| `high-priority-loaded-late` | warning | A `fetchpriority="high"` resource that still loaded late |
| `lcp-no-fetchpriority` | warning | The LCP candidate image without `fetchpriority="high"` |

### Resource-Hints

Each issue about one hint names its URL in `target`.

| Code | Severity | When |
|------|----------|------|
| `preload-missing-as` | error | A preload without `as` |
| `font-preload-no-crossorigin` | error | A font preload without `crossorigin`, which fetches the font twice |
| `preconnect-no-crossorigin` | warning | A preconnect without `crossorigin` to an origin that serves CORS resources |
| `unused-preload` | warning | A preload that the page did not use during the load |
| `unused-preconnect` | warning | A preconnect to an origin the page loaded nothing from |
| `too-many-preloads` | warning | More than 6 preloads |

### Resource-Hints-Validation

| Code | Severity | When |
|------|----------|------|
| `unused-hints` | warning | Hints the page did not use |
| `missing-connection-hints` | info | Domains that could use a connection hint |
| `redundant-hints` | warning | Domains with both `preconnect` and `dns-prefetch` |

### Server-Timing-Early-Hints

| Code | Severity | When |
|------|----------|------|
| `no-server-timing` | info | The document response has no `Server-Timing` header |
| `timing-hidden` | info | Cross-origin resources without `Timing-Allow-Origin`, whose Server-Timing cannot be read |
| `no-early-hints` | info | No 103 Early Hints response for the document |

### Service-Worker-Analysis

| Code | Severity | When |
|------|----------|------|
| `unsupported` | error | The browser has no Service Workers |
| `no-service-worker` | info | No Service Worker registered |
| `not-controlled` | warning | The page is not controlled by its Service Worker, after a hard reload or on a first visit |
| `update-pending` | warning | A waiting update; `target` is the scope |
| `navigation-preload-disabled` | info | Navigation Preload is off; `target` is the scope |
| `slow-startup` | warning or error | A Service Worker startup above 50 ms, an error above 100 ms |
| `low-cache-hit-rate` | warning or error | A cache hit rate under 80%, an error under 50% |
| `unknown-source` | info | Intercepted cross-origin resources without `Timing-Allow-Origin`, left out of the hit rate |

### Speculation-Rules-Inspector

| Code | Severity | When |
|------|----------|------|
| `invalid-json` | error | A speculation rules script that is not valid JSON |
| `eager-list-capped` | warning | An eager prerender list with more than 10 URLs, above what Chrome prerenders |
| `eager-document-rule` | warning | A document prerender rule with eager eagerness |
| `no-rules` | info | No speculation rules in the DOM |
| `no-prefetch-or-prerender` | info | Speculation rules scripts without prefetch or prerender rules |
| `unsupported` | info | The browser does not support speculation rules |
| `prerendered` | info | The page was prerendered, so its timings start at `activationStart` |

### TTFB-Resources

| Code | Severity | When |
|------|----------|------|
| `no-resources` | info | No resources with TTFB data |

### TTFB-Sub-Parts

| Code | Severity | When |
|------|----------|------|
| `slow-ttfb` | warning or error | A TTFB that is not good, an error when poor, naming its slowest phase |

### DOM-Size-and-Depth

| Code | Severity | When |
|------|----------|------|
| `too-many-nodes` | warning or error | More than 800 nodes, an error above 1,400 |
| `too-deep` | warning | A DOM deeper than 32 levels |
| `too-many-children` | warning | An element with more than 60 children |

### Forced-Synchronous-Layout

| Code | Severity | When |
|------|----------|------|
| `forced-layout` | warning or error | A layout property read after a write forced a layout, an error above 5 times; `target` is the property |

### Input-Latency-Breakdown

| Code | Severity | When |
|------|----------|------|
| `slow-event-type` | warning or error | An event type whose P75 is not good, an error when poor; `target` is the event type |

### Interactions

| Code | Severity | When |
|------|----------|------|
| `slow-interaction` | warning or error | An interaction above 200 ms, an error above 500 ms; `target` is its type |

### Scroll-Performance

| Code | Severity | When |
|------|----------|------|
| `non-passive-listeners` | warning | Scroll or touch listeners without `{ passive: true }` |
| `will-change` | info | Elements with `will-change` set |

### Image-Element-Audit

Each issue names its image in `target`, except `lcp-not-img`.

| Code | Severity | When |
|------|----------|------|
| `lcp-not-img` | info | The LCP element is not an `<img>` |
| `lcp-no-fetchpriority` | error | The LCP image has no `fetchpriority="high"` |
| `lcp-lazy` | error | The LCP image has `loading="lazy"` |
| `lcp-not-decoding-sync` | warning | The LCP image has no `decoding="sync"` |
| `lcp-not-preloaded` | warning | The LCP image has no `<link rel="preload" as="image">` |
| `lcp-preload-no-fetchpriority` | info | The preload of the LCP image has no `fetchpriority="high"` |
| `lazy-in-viewport` | warning | An image in the viewport with `loading="lazy"` |
| `eager-off-viewport` | warning | An image outside the viewport without `loading="lazy"` |
| `high-priority-off-viewport` | error | An image outside the viewport with `fetchpriority="high"` |
| `lazy-and-high-priority` | error | An image with both `loading="lazy"` and `fetchpriority="high"` |
| `missing-dimensions` | warning | An image without `width` and `height` |
| `no-modern-format` | info | An image that is not WebP, AVIF, JPEG XL or SVG, outside a `<picture>` |

### Oversized-Images

Each issue names its image in `target`.

| Code | Severity | When |
|------|----------|------|
| `oversized` | info or warning | A file larger than its slot needs, a warning when it is far larger |
| `undersized` | info or warning | A file smaller than its slot needs, so it looks blurry, a warning when it is far smaller |

### SVG-Embedded-Bitmap-Analysis

| Code | Severity | When |
|------|----------|------|
| `embedded-bitmaps` | warning | SVG files that contain bitmaps |
| `sprite-opportunity` | info | Standalone inline SVGs that could share one `<symbol>` sprite |

### Video-Element-Audit

Each issue names its video in `target`, except `no-videos`.

| Code | Severity | When |
|------|----------|------|
| `no-videos` | info | No `<video>` elements on the page |
| `preload-auto` | error | `preload="auto"` on a video without `autoplay` |
| `off-viewport-preload` | warning | A video outside the viewport without `preload="none"` |
| `autoplay-not-muted` | error | `autoplay` without `muted` |
| `autoplay-no-playsinline` | warning | `autoplay` without `playsinline` |
| `missing-poster` | warning | A video without a poster |
| `missing-dimensions` | warning | A video without `width` and `height` |
| `no-modern-codec` | info | No WebM source (VP9 or AV1) |
| `no-controls` | info | A video without `controls` and without `autoplay` |

---

## Guidelines for Agents

### Reading results

```
// Read the return value: the skill scripts have no console output
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
- To tell whether an issue is new, fixed or the same as in an earlier run, compare `script`, `code` and `target`, not `message`

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
13. **Issues carry a stable code**: every issue has a kebab-case `code`, written as a literal in the source (`code: "blocking-in-head"`) and listed under Issue codes, and a `target` string when it is about one resource.

The rules are checked by `cli/tests/e2e/snippet-contract.test.js`, which runs every script, its `getDataFn` and every other getter it exposes on `window` (such as `getINPDetails()` and `checkBfcache()`), on an empty page, a seeded page and a heavy page. `cli/tests/unit/issue-codes.test.js` checks that the codes in the source of each snippet match its table under Issue codes.
