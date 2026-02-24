---
name: webperf-loading
description: Analyze loading performance (TTFB, FCP, render-blocking resources, scripts, fonts, resource hints, service workers). Use when the user asks about loading time, TTFB, FCP, render-blocking, font loading, script analysis, or prefetching. Compatible with Chrome DevTools MCP.
---

# WebPerf: Loading Performance

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Available Snippets

| Snippet | Description | File |
|---------|-------------|------|
| Back/Forward Cache (bfcache) | Analyzes Back/Forward Cache (bfcache) to determine if your page is eligible for instant back/forward | scripts/Back-Forward-Cache.js |
| CSS Media Queries Analysis | Analyze all @media rules in CSS stylesheets to identify classes and properties targeting viewports b | scripts/CSS-Media-Queries-Analysis.js |
| Content Visibility | Detect and analyze all elements using content-visibility: auto on a page | scripts/Content-Visibility.js |
| Critical CSS Detection | Analyzes the CSS loading strategy of a page — identifying render-blocking stylesheets, measuring the | scripts/Critical-CSS-Detection.js |
| Event Processing Time | Analyzes the time spent in each phase of page navigation, from initial redirect to the load event | scripts/Event-Processing-Time.js |
| First Contentful Paint (FCP) | Quick check for First Contentful Paint, the metric that marks when the browser renders the first pie | scripts/FCP.js |
| Find Above The Fold Lazy Loaded Images | Detect images with lazy loading that are incorrectly placed above the fold (in the viewport) | scripts/Find-Above-The-Fold-Lazy-Loaded-Images.js |
| Find Images With Loading Lazy and Fetchpriority | Detects images that have both loading="lazy" and fetchpriority="high" - a contradictory combination  | scripts/Find-Images-With-Lazy-and-Fetchpriority.js |
| Find non Lazy Loaded Images outside of the viewport | Identifies images that are loaded eagerly but not visible in the initial viewport, representing wast | scripts/Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js |
| Find render-blocking resources | Identifies resources that block the browser from rendering the page | scripts/Find-render-blocking-resources.js |
| First And Third Party Script Info | Analyzes all scripts loaded on the page, separating them into first-party (your domain) and third-pa | scripts/First-And-Third-Party-Script-Info.js |
| First And Third Party Script Timings | Analyzes detailed timing phases for all scripts, comparing first-party vs third-party performance | scripts/First-And-Third-Party-Script-Timings.js |
| Fonts Preloaded, Loaded, and Used Above The Fold | Analyzes font loading strategy by comparing preloaded fonts, loaded fonts, and fonts actually used a | scripts/Fonts-Preloaded-Loaded-and-used-above-the-fold.js |
| Inline CSS Info and Size | Analyzes all inline <style> tags on the page, measuring their size and identifying optimization oppo | scripts/Inline-CSS-Info-and-Size.js |
| Inline Script Info and Size | Analyzes all inline <script> tags on the page, measuring their size and identifying potential perfor | scripts/Inline-Script-Info-and-Size.js |
| JavaScript Execution Time Breakdown | Identifies where JavaScript time goes during page load: network download vs browser parsing | scripts/JS-Execution-Time-Breakdown.js |
| Prefetch Resource Validation | Detects potential performance issues with rel="prefetch" resource hints by analyzing quantity, size, | scripts/Prefetch-Resource-Validation.js |
| Priority Hints Audit | Audits all fetchpriority attribute usage across the page — covering non-image resources (scripts, pr | scripts/Priority-Hints-Audit.js |
| Resource Hints Validation | Validates resource hints (preload, preconnect, dns-prefetch) by analyzing which hints are declared a | scripts/Resource-Hints-Validation.js |
| Resource Hints | Analyzes resource hints on the page, checking for proper usage and identifying optimization opportun | scripts/Resource-Hints.js |
| SSR Framework Hydration Data Analysis | Analyzes hydration data scripts used by SSR frameworks like Next | scripts/SSR-Hydration-Data-Analysis.js |
| Scripts Loading | Analyzes all scripts on the page, showing their loading strategy and identifying potential performan | scripts/Script-Loading.js |
| Service Worker Analysis | Analyzes the Service Worker lifecycle, cache behavior, and its performance impact on resource loadin | scripts/Service-Worker-Analysis.js |
| Time To First Byte: Measure TTFB for all resources | Analyzes TTFB for every resource loaded on the page (scripts, stylesheets, images, fonts, etc | scripts/TTFB-Resources.js |
| Time To First Byte: Measure TTFB sub-parts | Breaks down TTFB into its component phases to identify where time is being spent | scripts/TTFB-Sub-Parts.js |
| Time To First Byte: Measure the time to first byte | Time to First Byte (TTFB) measures the time from when the user starts navigating to a page until the | scripts/TTFB.js |
| Validate Preload on Async/Defer Scripts | Detects preload resource hints for scripts that use async or defer attributes | scripts/Validate-Preload-Async-Defer-Scripts.js |

## Execution with Chrome DevTools MCP

```
1. mcp__chrome-devtools__navigate_page  → navigate to target URL
2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)
3. mcp__chrome-devtools__get_console_message → capture console output
4. Interpret results using thresholds below, provide recommendations
```

---

## Back/Forward Cache (bfcache)

Analyzes Back/Forward Cache (bfcache) to determine if your page is eligible for instant back/forward navigations. When bfcache works, users get instant (0ms) page loads when using browser back/forward buttons, dramatically improving perceived performance.

**Script:** `scripts/Back-Forward-Cache.js`

**Further Reading:**

- [Back/forward cache (bfcache)](https://web.dev/articles/bfcache) | web.dev
- [NotRestoredReasons API](https://developer.chrome.com/docs/web-platform/bfcache-notrestoredreasons/) | Chrome Developers
- [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api/) | Chrome Developers
- [bfcache tester](https://back-forward-cache-tester.glitch.me/) | Interactive testing tool

---

## CSS Media Queries Analysis

Analyze all @media rules in CSS stylesheets to identify classes and properties targeting viewports bigger than a specified breakpoint (default: 768px). Results are grouped by inline CSS and external files, with byte size estimates for potential mobile savings.

**Script:** `scripts/CSS-Media-Queries-Analysis.js`

---

## Content Visibility

Detect and analyze all elements using content-visibility: auto on a page. This CSS property is a powerful rendering optimization that allows browsers to skip layout and painting work for offscreen content, significantly improving initial page load performance.

**Script:** `scripts/Content-Visibility.js`

---

## Critical CSS Detection

Analyzes the CSS loading strategy of a page — identifying render-blocking stylesheets, measuring their size against the critical 14 KB budget, and detecting whether critical CSS is properly inlined for above-the-fold content.

**Script:** `scripts/Critical-CSS-Detection.js`

**Further Reading:**

- [Extract critical CSS](https://web.dev/articles/extract-critical-css) | web.dev
- [Defer non-critical CSS](https://web.dev/articles/defer-non-critical-css) | web.dev
- [Eliminate render-blocking resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources) | Chrome for Developers
- [Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Critical_rendering_path) | MDN

---

## Event Processing Time

Analyzes the time spent in each phase of page navigation, from initial redirect to the load event. This helps identify bottlenecks in the page loading process and understand where time is being spent.

**Script:** `scripts/Event-Processing-Time.js`

**Further Reading:**

- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API) | MDN
- [PerformanceNavigationTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming) | MDN
- [Critical Rendering Path](https://web.dev/articles/critical-rendering-path) | web.dev
- [Optimize LCP](https://web.dev/articles/optimize-lcp) | web.dev

---

## First Contentful Paint (FCP)

Quick check for First Contentful Paint, the metric that marks when the browser renders the first piece of DOM content — text, image, canvas, or SVG. FCP measures the user's perception of whether the page is loading.

**Script:** `scripts/FCP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 1.8s | Content appears quickly |
| 🟡 Needs Improvement | ≤ 3s | Noticeable delay |
| 🔴 Poor | > 3s | Users may perceive the page as broken |

**Further Reading:**

- [First Contentful Paint (FCP)](https://web.dev/articles/fcp) | web.dev
- [Optimize FCP](https://web.dev/articles/optimize-fcp) | web.dev
- Find Render-Blocking Resources | Detailed analysis with fixes
- TTFB | Time to First Byte
- LCP | Largest Contentful Paint
- LCP Sub-Parts | Detailed LCP phase breakdown

---

## Find Above The Fold Lazy Loaded Images

Detect images with lazy loading that are incorrectly placed above the fold (in the viewport). Lazy loading above-the-fold images is a common performance anti-pattern that can significantly harm your Largest Contentful Paint (LCP) score.

**Script:** `scripts/Find-Above-The-Fold-Lazy-Loaded-Images.js`

**Further Reading:**

- [Browser-level image lazy loading for the web](https://web.dev/articles/browser-level-image-lazy-loading) | web.dev
- [Lazy loading images](https://developer.mozilla.org/en-US/docs/Web/Performance/Lazy_loading#images_and_iframes) | MDN Web Docs
- [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp) | web.dev
- [Fetch Priority API](https://web.dev/articles/fetch-priority) | web.dev
- [The loading attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#loading) | MDN Web Docs
- [Don't lazy-load LCP images](https://web.dev/articles/lcp-lazy-loading) | web.dev

---

## Find Images With Loading Lazy and Fetchpriority

Detects images that have both loading="lazy" and fetchpriority="high" - a contradictory combination that indicates a misconfiguration.

**Script:** `scripts/Find-Images-With-Lazy-and-Fetchpriority.js`

**Further Reading:**

- [Fetch Priority API](https://web.dev/articles/fetch-priority) | web.dev
- [Browser-level lazy loading](https://web.dev/articles/browser-level-image-lazy-loading) | web.dev
- [Optimizing resource loading with Priority Hints](https://developer.chrome.com/docs/web-platform/performance/resource-priorities) | Chrome Developers

---

## Find non Lazy Loaded Images outside of the viewport

Identifies images that are loaded eagerly but not visible in the initial viewport, representing wasted bandwidth and parsing time that delays page interactivity. The snippet analyzes all <img> elements to find optimization opportunities for lazy loading.

**Script:** `scripts/Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js`

---

## Find render-blocking resources

Identifies resources that block the browser from rendering the page. These resources must be fully downloaded and processed before the browser can display any content, directly impacting First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

**Script:** `scripts/Find-render-blocking-resources.js`

**Further Reading:**

- [Eliminate render-blocking resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources) | Chrome Developers
- [Render-blocking CSS](https://web.dev/articles/critical-rendering-path/render-blocking-css) | web.dev
- [Efficiently load JavaScript](https://web.dev/articles/efficiently-load-third-party-javascript) | web.dev
- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- FCP | See how render-blocking resources impact First Contentful Paint

---

## First And Third Party Script Info

Analyzes all scripts loaded on the page, separating them into first-party (your domain) and third-party (external) scripts. This helps identify the performance impact of external dependencies.

**Script:** `scripts/First-And-Third-Party-Script-Info.js`

**Further Reading:**

- [Loading Third-Party JavaScript](https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/loading-third-party-javascript) | Google Developers
- [Best practices for third-party scripts](https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript) | web.dev
- [PerformanceResourceTiming API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming) | MDN
- [Using the Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API#coping_with_cors) | MDN

---

## First And Third Party Script Timings

Analyzes detailed timing phases for all scripts, comparing first-party vs third-party performance. This helps identify slow connection phases, DNS issues, or server response problems.

**Script:** `scripts/First-And-Third-Party-Script-Timings.js`

**Further Reading:**

- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API/Using_the_Resource_Timing_API) | MDN
- [Timing-Allow-Origin Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Timing-Allow-Origin) | MDN
- [ResourceTiming Visibility](https://nicj.net/resourcetiming-visibility-third-party-scripts-ads-and-page-weight/) | Nic Jansma

---

## Fonts Preloaded, Loaded, and Used Above The Fold

Analyzes font loading strategy by comparing preloaded fonts, loaded fonts, and fonts actually used above the fold. This helps identify optimization opportunities and wasted resources.

**Script:** `scripts/Fonts-Preloaded-Loaded-and-used-above-the-fold.js`

**Further Reading:**

- [Optimize WebFont loading](https://web.dev/articles/optimize-webfont-loading) | web.dev
- [Best practices for fonts](https://web.dev/articles/font-best-practices) | web.dev
- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API) | MDN

---

## Inline CSS Info and Size

Analyzes all inline <style> tags on the page, measuring their size and identifying optimization opportunities. This helps understand how much CSS is inlined and whether it's being used effectively.

**Script:** `scripts/Inline-CSS-Info-and-Size.js`

**Further Reading:**

- [Extract critical CSS](https://web.dev/articles/extract-critical-css) | web.dev
- [Defer non-critical CSS](https://web.dev/articles/defer-non-critical-css) | web.dev
- [Reduce the scope of style calculations](https://web.dev/articles/reduce-the-scope-and-complexity-of-style-calculations) | web.dev
- [Critical rendering path](https://developer.mozilla.org/en-US/docs/Web/Performance/Critical_rendering_path) | MDN

---

## Inline Script Info and Size

Analyzes all inline <script> tags on the page, measuring their size and identifying potential performance issues. This helps understand the impact of inline JavaScript on page load.

**Script:** `scripts/Inline-Script-Info-and-Size.js`

**Further Reading:**

- [Efficiently load JavaScript](https://web.dev/articles/efficiently-load-third-party-javascript) | web.dev
- [Remove render-blocking resources](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources) | Chrome Developers
- [Script loading strategies](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps/What_is_JavaScript#script_loading_strategies) | MDN
- [JSON-LD structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) | Google Developers

---

## JavaScript Execution Time Breakdown

Identifies where JavaScript time goes during page load: network download vs browser parsing. Shows which scripts delay domInteractive (TTI proxy) and flags code splitting opportunities.

**Script:** `scripts/JS-Execution-Time-Breakdown.js`

**Further Reading:**

- [Script evaluation and long tasks](https://web.dev/articles/script-evaluation-and-long-tasks) | web.dev
- [Optimize JavaScript execution](https://developer.chrome.com/docs/devtools/performance/reference) | Chrome Developers
- [Code splitting](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting) | web.dev
- [JavaScript parsing cost](https://v8.dev/blog/cost-of-javascript-2019) | V8 Blog
- [modulepreload](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/modulepreload) | MDN
- Long Animation Frames Script Attribution | This site

---

## Prefetch Resource Validation

Detects potential performance issues with rel="prefetch" resource hints by analyzing quantity, size, type, and appropriateness of prefetched resources. Excessive or incorrect prefetch usage can waste bandwidth, delay critical resources, and negatively impact mobile users.

**Script:** `scripts/Prefetch-Resource-Validation.js`

**Thresholds:**

| Metric               | Warning          | Critical | Rationale                                  |
| -------------------- | ---------------- | -------- | ------------------------------------------ |
| Resource count       | &gt;10 resources | -        | Excessive prefetch wastes mobile bandwidth |
| Individual file size | &gt;500KB        | -        | Large files may not be used immediately    |
| Total prefetch size  | &gt;2MB          | &gt;5MB  | Mobile data consumption and network impact |

**Further Reading:**

- [Resource Hints: `rel=prefetch`](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/prefetch) | MDN
- [Resource Hints Specification](https://www.w3.org/TR/resource-hints/#prefetch) | W3C
- [Prefetching in Chrome](https://developer.chrome.com/docs/web-platform/prerender-pages) | Chrome Developers
- [Optimize resource loading with Priority Hints](https://web.dev/articles/priority-hints) | web.dev
- [Fast load times with prefetch](https://web.dev/articles/link-prefetch) | web.dev
- [Resource Hints comparison](https://www.debugbear.com/blog/resource-hints-rel-preload-prefetch-preconnect) | DebugBear
- [The Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API) | MDN

---

## Priority Hints Audit

Audits all fetchpriority attribute usage across the page — covering non-image resources (scripts, preload links, iframes), fetchpriority="low" analysis, and conflicts between preload and low priority. Identifies the LCP candidate when it lacks fetchpriority="high".

**Script:** `scripts/Priority-Hints-Audit.js`

**Further Reading:**

- [Optimizing resource loading with Priority Hints](https://web.dev/articles/fetch-priority) | web.dev
- [fetchpriority attribute](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/fetchPriority) | MDN
- [Resource priorities in Chrome](https://web.dev/articles/resource-priority) | web.dev
- [Optimizing LCP](https://web.dev/articles/optimize-lcp) | web.dev

---

## Resource Hints Validation

Validates resource hints (preload, preconnect, dns-prefetch) by analyzing which hints are declared and whether the resources or connections are actually used. Detects unused hints that waste browser resources and opportunities to optimize loading.

**Script:** `scripts/Resource-Hints-Validation.js`

**Further Reading:**

- [Resource Hints](https://www.w3.org/TR/resource-hints/) | W3C Specification
- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- [Establish network connections early](https://web.dev/articles/preconnect-and-dns-prefetch) | web.dev
- [Resource Hints comparison](https://www.debugbear.com/blog/resource-hints-rel-preload-prefetch-preconnect) | DebugBear
- [Optimize resource loading with the Fetch Priority API](https://web.dev/articles/fetch-priority) | web.dev

---

## Resource Hints

Analyzes resource hints on the page, checking for proper usage and identifying optimization opportunities. Resource hints help the browser prioritize resource loading for better performance.

**Script:** `scripts/Resource-Hints.js`

**Further Reading:**

- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- [Establish network connections early](https://web.dev/articles/preconnect-and-dns-prefetch) | web.dev
- [Prefetch resources](https://developer.chrome.com/docs/devtools/application/debugging-speculation-rules) | Chrome Developers
- [Resource Hints specification](https://www.w3.org/TR/resource-hints/) | W3C

---

## SSR Framework Hydration Data Analysis

Analyzes hydration data scripts used by SSR frameworks like Next.js, Nuxt, Remix, Gatsby, and others. These scripts contain serialized state that the client needs to "hydrate" the server-rendered HTML into an interactive application.

**Script:** `scripts/SSR-Hydration-Data-Analysis.js`

**Further Reading:**

- [Next.js: Large Page Data warning](https://nextjs.org/docs/messages/large-page-data) | Next.js Docs
- [Nuxt: Reducing Payload Size](https://nuxt.com/docs/getting-started/data-fetching#reducing-payload-size) | Nuxt Docs
- [Remix: Performance](https://remix.run/docs/en/main/guides/performance) | Remix Docs
- [Astro: Islands Architecture](https://docs.astro.build/en/concepts/islands/) | Astro Docs
- [Understanding Hydration](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) | Josh W. Comeau

---

## Scripts Loading

Analyzes all scripts on the page, showing their loading strategy and identifying potential performance issues. Scripts are often the biggest cause of main thread blocking and delayed rendering. This snippet helps you audit which scripts are blocking the critical rendering path.

**Script:** `scripts/Script-Loading.js`

**Further Reading:**

- [Efficiently load JavaScript](https://web.dev/articles/efficiently-load-third-party-javascript) | web.dev
- [Script loading strategies](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources) | Chrome Developers
- [JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) | MDN
- [async vs defer](https://javascript.info/script-async-defer) | javascript.info

---

## Service Worker Analysis

Analyzes the Service Worker lifecycle, cache behavior, and its performance impact on resource loading. Service Workers can dramatically improve performance through caching strategies, but misconfigured workers can introduce startup delays and degrade TTFB.

**Script:** `scripts/Service-Worker-Analysis.js`

**Thresholds:**

| Rating | Overhead | Meaning |
|--------|----------|---------|
| 🟢 Good | < 50ms | SW is running or starts fast |
| 🟡 Needs attention | 50–100ms | Consider Navigation Preload |
| 🔴 Poor | > 100ms | SW cold start adds visible latency to TTFB |

**Further Reading:**

- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | MDN
- [Speed up Service Worker with Navigation Preloads](https://developer.chrome.com/docs/workbox/navigation-preload/) | Chrome Developers
- [Service worker caching and HTTP caching](https://web.dev/articles/service-worker-caching-and-http-caching) | web.dev
- [Workbox](https://developer.chrome.com/docs/workbox/) | Production SW library by Google
- TTFB | Time To First Byte — affected by SW startup time

---

## Time To First Byte: Measure TTFB for all resources

Analyzes TTFB for every resource loaded on the page (scripts, stylesheets, images, fonts, etc.). Helps identify slow third-party resources or backend endpoints.

**Script:** `scripts/TTFB-Resources.js`

**Further Reading:**

- [Time to First Byte (TTFB)](https://web.dev/articles/ttfb) | web.dev
- [Optimize TTFB](https://web.dev/articles/optimize-ttfb) | web.dev
- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API) | MDN
- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing) | MDN
- FCP | First Contentful Paint — the next metric after TTFB

---

## Time To First Byte: Measure TTFB sub-parts

Breaks down TTFB into its component phases to identify where time is being spent. This helps pinpoint whether slowness is due to DNS, TCP connection, SSL negotiation, or server processing.

**Script:** `scripts/TTFB-Sub-Parts.js`

**Further Reading:**

- [Time to First Byte (TTFB)](https://web.dev/articles/ttfb) | web.dev
- [Optimize TTFB](https://web.dev/articles/optimize-ttfb) | web.dev
- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API) | MDN
- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing) | MDN
- FCP | First Contentful Paint — the next metric after TTFB

---

## Time To First Byte: Measure the time to first byte

Time to First Byte (TTFB) measures the time from when the user starts navigating to a page until the first byte of the HTML response is received. It's a critical metric that reflects server responsiveness and network latency.

**Script:** `scripts/TTFB.js`

**Further Reading:**

- [Time to First Byte (TTFB)](https://web.dev/articles/ttfb) | web.dev
- [Optimize TTFB](https://web.dev/articles/optimize-ttfb) | web.dev
- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API) | MDN
- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing) | MDN
- FCP | First Contentful Paint — the next metric after TTFB

---

## Validate Preload on Async/Defer Scripts

Detects preload resource hints for scripts that use async or defer attributes. This is an anti-pattern that wastes bandwidth and can hurt performance by artificially elevating the priority of resources that should load at lower priority.

**Script:** `scripts/Validate-Preload-Async-Defer-Scripts.js`

**Further Reading:**

- [JavaScript Loading Priorities](https://addyosmani.com/blog/script-priorities/) | Addy Osmani - Detailed breakdown of network and execution priorities
- [Negative performance impact from preloading](https://www.debugbear.com/blog/resource-hints-rel-preload-prefetch-preconnect#negative-performance-impact-from-preloading) | DebugBear
- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- [Script loading strategies](https://developer.chrome.com/docs/lighthouse/performance/render-blocking-resources) | Chrome Developers
- [Resource prioritization](https://web.dev/articles/prioritize-resources) | web.dev
- [Andy Davies on font preloading](https://andydavies.me/blog/2019/02/12/preloading-fonts-and-the-puzzle-of-priorities/) | Andy Davies
