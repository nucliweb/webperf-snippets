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

  // Script-specific structured data
  details?: object;

  // Issues detected (for audit scripts)
  issues?: Array<{
    severity: "error" | "warning" | "info";
    message: string;
  }>;

  // Tracking scripts (status: "tracking")
  message?: string;      // Human-readable status message
  getDataFn?: string;    // window function name to call for data: evaluate_script(`${getDataFn}()`)

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
  return { script: "TTFB", status: "ok", metric: "TTFB", value, unit: "ms", rating,
           thresholds: { good: 800, needsImprovement: 1800 } };
})();
```

**Scripts using this pattern:** TTFB, TTFB-Sub-Parts, FCP, Find-render-blocking-resources, Script-Loading, LCP-Video-Candidate, Resource-Hints, Resource-Hints-Validation, Priority-Hints-Audit, Validate-Preload-Async-Defer-Scripts, Fonts-Preloaded, Service-Worker-Analysis, Back-Forward-Cache, Content-Visibility, Critical-CSS-Detection, Inline-CSS-Info-and-Size, Inline-Script-Info-and-Size, First-And-Third-Party-Script-Info, First-And-Third-Party-Script-Timings, JS-Execution-Time-Breakdown, CSS-Media-Queries-Analysis, Client-Side-Redirect-Detection, SSR-Hydration-Data-Analysis, Network-Bandwidth-Connection-Quality, Find-Above-The-Fold-Lazy-Loaded-Images, Find-Images-With-Lazy-and-Fetchpriority, Find-non-Lazy-Loaded-Images-outside-of-the-viewport, SVG-Embedded-Bitmap-Analysis, Prefetch-Resource-Validation, TTFB-Resources.

### Pattern 2: PerformanceObserver → getEntriesByType

Scripts using `PerformanceObserver` with `buffered: true` can read the same data synchronously via `performance.getEntriesByType()`. The observer stays for human console display; the return value is computed synchronously.

```js
// Example: LCP.js
(() => {
  // Synchronous data for agent (computed at top)
  const entries = performance.getEntriesByType("largest-contentful-paint");
  const lastEntry = entries.at(-1);
  if (!lastEntry) {
    // Still set up the observer for human display
    // observer.observe(...)
    return { script: "LCP", status: "error", error: "No LCP entries yet" };
  }

  const activationStart = performance.getEntriesByType("navigation")[0]?.activationStart ?? 0;
  const value = Math.round(Math.max(0, lastEntry.startTime - activationStart));
  const rating = value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";

  // Human output via PerformanceObserver (unchanged)
  const observer = new PerformanceObserver(...);
  observer.observe({ type: "largest-contentful-paint", buffered: true });

  // Agent return value
  return {
    script: "LCP", status: "ok", metric: "LCP", value, unit: "ms", rating,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: { element: selector, elementType: type, url: lastEntry.url, sizePixels: lastEntry.size }
  };
})();
```

**Scripts using this pattern:** LCP, CLS, LCP-Sub-Parts, LCP-Trail, LCP-Image-Entropy, Event-Processing-Time, Long-Animation-Frames (buffered LoAFs), LongTask (buffered tasks).

### Pattern 3: Tracking observers

Scripts that observe ongoing user interactions cannot return meaningful data synchronously. They return `status: "tracking"` immediately, and expose a `window.getXxx()` function for agents to call later.

```js
// Return at the end of the IIFE:
return {
  script: "INP",
  status: "tracking",
  message: "INP tracking active. Interact with the page then call getINP() for results.",
  getDataFn: "getINP"
};
```

**Agent workflow for tracking scripts:**
```
1. evaluate_script(INP.js)          → { status: "tracking", getDataFn: "getINP" }
2. (user interacts with the page)
3. evaluate_script("getINP()")      → { script: "INP", status: "ok", value: 350, rating: "needs-improvement", ... }
```

**The window function must also return a structured object** matching the same schema.

**Scripts using this pattern:** INP, Interactions, Input-Latency-Breakdown, Layout-Shift-Loading-and-Interaction, Scroll-Performance, Long-Animation-Frames (ongoing tracking), LongTask (ongoing tracking), Long-Animation-Frames-Script-Attribution.

### Pattern 4: Async scripts

Scripts that use `async/await` or `setTimeout`. The IIFE returns a Promise, which `evaluate_script` can await (Chrome DevTools `awaitPromise`).

Keep the existing `async () => {}` wrapper. Add a `return` statement with structured data at the end. The agent receives the resolved value.

**Scripts using this pattern:** Image-Element-Audit (fetches content-type headers), Video-Element-Audit, Long-Animation-Frames-Script-Attribution (should be converted to return buffered data immediately instead of waiting 10s).

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

#### CLS
```json
{
  "script": "CLS",
  "status": "ok",
  "metric": "CLS",
  "value": 0.05,
  "unit": "score",
  "rating": "good",
  "thresholds": { "good": 0.1, "needsImprovement": 0.25 }
}
```

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

#### LCP-Sub-Parts
```json
{
  "script": "LCP-Sub-Parts",
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
      { "index": 2, "selector": "img.hero", "time": 1240, "elementType": "Image", "url": "hero.jpg" }
    ]
  }
}
```

#### LCP-Image-Entropy
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
    { "url": "hero.jpg", "width": 1200, "height": 630, "fileSizeBytes": 156000, "bpp": 1.65, "isLowEntropy": false, "lcpEligible": true, "isLCP": true }
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
    { "type": "link", "url": "https://example.com/style.css", "shortName": "style.css", "responseEndMs": 450, "durationMs": 200, "sizeBytes": 45000 }
  ]
}
```

#### Script-Loading
```json
{
  "script": "Script-Loading",
  "status": "ok",
  "count": 8,
  "rating": "needs-improvement",
  "details": {
    "totalSizeBytes": 245000,
    "byStrategy": { "blocking": 2, "async": 4, "defer": 1, "module": 1 },
    "byParty": { "firstParty": 5, "thirdParty": 3 },
    "thirdPartyBlockingCount": 1
  },
  "items": [
    { "url": "https://example.com/app.js", "shortName": "app.js", "strategy": "blocking", "location": "head", "party": "first", "sizeBytes": 85000, "durationMs": 120 }
  ],
  "issues": [
    { "severity": "error", "message": "2 blocking scripts in <head>" },
    { "severity": "error", "message": "1 third-party blocking script" }
  ]
}
```

### Interaction

#### Interactions (tracking)
```json
{
  "script": "Interactions",
  "status": "tracking",
  "message": "Tracking interactions. Interact with the page then call getInteractionSummary() for results.",
  "getDataFn": "getInteractionSummary"
}
```

#### Input-Latency-Breakdown (tracking)
```json
{
  "script": "Input-Latency-Breakdown",
  "status": "tracking",
  "message": "Tracking input latency by event type. Interact with the page then call getInputLatencyBreakdown().",
  "getDataFn": "getInputLatencyBreakdown"
}
```

#### Layout-Shift-Loading-and-Interaction
Immediately returns buffered CLS data, plus exposes summary function for ongoing tracking.
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
    "excludedShifts": 0
  },
  "message": "Layout shift tracking active. Call getLayoutShiftSummary() for full element attribution.",
  "getDataFn": "getLayoutShiftSummary"
}
```

#### Long-Animation-Frames
Returns buffered LoAF data immediately. Ongoing tracking continues.
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
  "message": "Tracking long animation frames. Call getLoAFSummary() for full script attribution.",
  "getDataFn": "getLoAFSummary"
}
```

#### Long-Animation-Frames-Script-Attribution
Returns buffered LoAF data immediately (do not wait for a timer):
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
    { "file": "app.js", "category": "first-party", "durationMs": 180, "count": 3 }
  ]
}
```

#### Scroll-Performance (tracking)
```json
{
  "script": "Scroll-Performance",
  "status": "tracking",
  "details": {
    "nonPassiveListeners": 2,
    "cssAudit": {
      "smoothScrollElements": 1,
      "willChangeElements": 0,
      "contentVisibilityElements": 3
    }
  },
  "message": "Scroll performance tracking active. Scroll the page then call getScrollSummary() for FPS data.",
  "getDataFn": "getScrollSummary"
}
```

#### LongTask
Returns buffered long tasks immediately. Ongoing tracking continues.
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
  "message": "Tracking long tasks. Call getLongTaskSummary() for statistics.",
  "getDataFn": "getLongTaskSummary"
}
```

### Media

#### Image-Element-Audit (async)
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
    { "severity": "warning", "message": "img.thumbnail: Missing width/height attributes (CLS risk)" }
  ]
}
```

#### Video-Element-Audit
Same shape as Image-Element-Audit but for video elements.

#### SVG-Embedded-Bitmap-Analysis
```json
{
  "script": "SVG-Embedded-Bitmap-Analysis",
  "status": "ok",
  "count": 2,
  "items": [
    { "url": "icon.svg", "hasBitmap": true, "bitmapType": "image/png", "sizeBytes": 4500 }
  ],
  "issues": [
    { "severity": "warning", "message": "2 SVG files contain embedded bitmaps" }
  ]
}
```

### Resources

#### Network-Bandwidth-Connection-Quality
```json
{
  "script": "Network-Bandwidth-Connection-Quality",
  "status": "ok",
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
7. **Window functions match the schema** — `getINP()`, `getLoAFSummary()`, etc. return the same structured shape.
