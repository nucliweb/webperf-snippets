---
## Back Forward Cache

**Script:** `scripts/Back-Forward-Cache.js`
---
## CSS media queries analysis

Analyze all @media rules in CSS stylesheets to identify classes and properties targeting viewports bigger than a specified breakpoint (default: 768px). Results are grouped by inline CSS and external files, with byte size estimates for potential mobile savings.

**Script:** `scripts/CSS-Media-Queries-Analysis.js`
---
## Cache Strategy Analysis

**Script:** `scripts/Cache-Strategy-Analysis.js`
---
## Client Side Redirect Detection

**Script:** `scripts/Client-Side-Redirect-Detection.js`
---
## Compression audit

Finds text-based resources (JavaScript, CSS, HTML, JSON, SVG, XML and TTF/OTF fonts) served without HTTP compression, and estimates how many bytes gzip or brotli would save. Compressing text typically shrinks it by 60–80%, so an uncompressed script or stylesheet is one of the cheapest fixes for slow loading.

**Script:** `scripts/Compression-Audit.js`
---
## Content visibility

Detect and analyze all elements using content-visibility: auto on a page. This CSS property is a powerful rendering optimization that allows browsers to skip layout and painting work for offscreen content, significantly improving initial page load performance.

**Script:** `scripts/Content-Visibility.js`
---
## Critical CSS detection

Analyzes the CSS loading strategy of a page, identifying render-blocking stylesheets, measuring their size against the critical 14 KB budget, and detecting whether critical CSS is properly inlined for above-the-fold content.

**Script:** `scripts/Critical-CSS-Detection.js`
---
## Event processing time

Analyzes the time spent in each phase of page navigation, from initial redirect to the load event. This helps identify bottlenecks in the page loading process and understand where time is being spent.

**Script:** `scripts/Event-Processing-Time.js`
---
## First contentful paint (FCP)

Quick check for First Contentful Paint, the metric that marks when the browser renders the first piece of DOM content, text, image, canvas, or SVG. FCP measures the user's perception of whether the page is loading.

**Script:** `scripts/FCP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 1.8s | Content appears quickly |
| 🟡 Needs Improvement | ≤ 3s | Noticeable delay |
| 🔴 Poor | > 3s | Users may perceive the page as broken |
---
## Find above the fold lazy loaded images

Detect images with lazy loading that are incorrectly placed above the fold (in the viewport). Lazy loading above-the-fold images is a common performance anti-pattern that can significantly harm your Largest Contentful Paint (LCP) score.

**Script:** `scripts/Find-Above-The-Fold-Lazy-Loaded-Images.js`
---
## Find images with loading lazy and fetchpriority

Detects images that have both loading="lazy" and fetchpriority="high" - a contradictory combination that indicates a misconfiguration.

**Script:** `scripts/Find-Images-With-Lazy-and-Fetchpriority.js`
---
## Find non lazy loaded images outside of the viewport

Identifies images that are loaded eagerly but not visible in the initial viewport, representing wasted bandwidth and parsing time that delays page interactivity. The snippet analyzes all <img> elements to find optimization opportunities for lazy loading.

**Script:** `scripts/Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js`
---
## Find render-blocking resources

Identifies resources that block the browser from rendering the page. These resources must be fully downloaded and processed before the browser can display any content, directly impacting First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

**Script:** `scripts/Find-render-blocking-resources.js`
---
## First And Third Party Script Info

**Script:** `scripts/First-And-Third-Party-Script-Info.js`
---
## First and third party script timings

Analyzes detailed timing phases for all scripts, comparing first-party vs third-party performance. This helps identify slow connection phases, DNS issues, or server response problems.

**Script:** `scripts/First-And-Third-Party-Script-Timings.js`
---
## Fonts preloaded, loaded, and used above the fold

Analyzes font loading strategy by comparing preloaded fonts, loaded fonts, and fonts actually used above the fold. This helps identify optimization opportunities and wasted resources.

**Script:** `scripts/Fonts-Preloaded-Loaded-and-used-above-the-fold.js`
---
## Inline CSS info and size

Analyzes all inline <style> tags on the page, measuring their size and identifying optimization opportunities. This helps understand how much CSS is inlined and whether it's being used effectively.

**Script:** `scripts/Inline-CSS-Info-and-Size.js`
---
## Inline script info and size

Analyzes all inline <script> tags on the page, measuring their size and identifying potential performance issues. This helps understand the impact of inline JavaScript on page load.

**Script:** `scripts/Inline-Script-Info-and-Size.js`
---
## JavaScript execution time breakdown

Identifies where JavaScript time goes during page load: network download vs browser parsing. Shows which scripts delay domInteractive (TTI proxy) and flags code splitting opportunities.

**Script:** `scripts/JS-Execution-Time-Breakdown.js`
---
## Prefetch resource validation

Detects potential performance issues with rel="prefetch" resource hints by analyzing quantity, size, type, and appropriateness of prefetched resources. Excessive or incorrect prefetch usage can waste bandwidth, delay critical resources, and negatively impact mobile users.

**Script:** `scripts/Prefetch-Resource-Validation.js`

**Thresholds:**

| Metric               | Warning          | Critical | Rationale                                  |
| -------------------- | ---------------- | -------- | ------------------------------------------ |
| Resource count       | &gt;10 resources | -        | Excessive prefetch wastes mobile bandwidth |
| Individual file size | &gt;500KB        | -        | Large files may not be used immediately    |
| Total prefetch size  | &gt;2MB          | &gt;5MB  | Mobile data consumption and network impact |
---
## Priority hints audit

Audits all fetchpriority attribute usage across the page, covering non-image resources (scripts, preload links, iframes), fetchpriority="low" analysis, and conflicts between preload and low priority. Identifies the LCP candidate when it lacks fetchpriority="high".

**Script:** `scripts/Priority-Hints-Audit.js`
---
## Resource Hints Validation

**Script:** `scripts/Resource-Hints-Validation.js`
---
## Resource hints

Analyzes resource hints on the page, checking for proper usage and identifying optimization opportunities. Resource hints help the browser prioritize resource loading for better performance.

**Script:** `scripts/Resource-Hints.js`
---
## SSR framework hydration data analysis

Analyzes hydration data scripts used by SSR frameworks like Next.js, Nuxt, Remix, Gatsby, and others. These scripts contain serialized state that the client needs to "hydrate" the server-rendered HTML into an interactive application.

**Script:** `scripts/SSR-Hydration-Data-Analysis.js`

**Thresholds:**

| Framework | Recommended Max | Official Warning |
|-----------|-----------------|------------------|
| Next.js | 128 KB | Yes, shows warning |
| Nuxt | 100 KB | No official limit |
| Remix | 100 KB | No official limit |
| Gatsby | 100 KB | No official limit |
| Astro | 50 KB total props | No official limit |
---
## Scripts loading

Analyzes all scripts on the page, showing their loading strategy and identifying potential performance issues. Scripts are often the biggest cause of main thread blocking and delayed rendering. This snippet helps you audit which scripts are blocking the critical rendering path.

**Script:** `scripts/Script-Loading.js`
---
## Server-Timing and Early Hints viewer

Lists the Server-Timing metrics that the server sends with the document and with each resource, and reports the 103 Early Hints timing of the navigation. These two signals show where the backend spends time before the first byte and whether the server lets the browser start fetching critical resources while it still builds the response.

**Script:** `scripts/Server-Timing-Early-Hints.js`
---
## Service worker analysis

Analyzes the Service Worker lifecycle, cache behavior, and its performance impact on resource loading. Service Workers can dramatically improve performance through caching strategies, but misconfigured workers can introduce startup delays and degrade TTFB.

**Script:** `scripts/Service-Worker-Analysis.js`

**Thresholds:**

| Rating | Overhead | Meaning |
|--------|----------|---------|
| 🟢 Good | < 50ms | SW is running or starts fast |
| 🟡 Needs attention | 50–100ms | Consider Navigation Preload |
| 🔴 Poor | > 100ms | SW cold start adds visible latency to TTFB |
---
## Speculation rules inspector

Inspects how a page uses the Speculation Rules API to prefetch and prerender future navigations, and whether the current page was itself prerendered. A prerendered page can activate instantly, which makes navigations feel immediate and changes how load metrics are measured.

**Script:** `scripts/Speculation-Rules-Inspector.js`
---
## Time to first byte: Measure TTFB for all resources

Analyzes TTFB for every resource loaded on the page (scripts, stylesheets, images, fonts, etc.). Helps identify slow third-party resources or backend endpoints.

**Script:** `scripts/TTFB-Resources.js`
---
## Time to first byte: Measure TTFB sub-parts

Breaks down TTFB into its component phases to identify where time is being spent. This helps pinpoint whether slowness is due to DNS, TCP connection, SSL negotiation, or server processing.

**Script:** `scripts/TTFB-Sub-Parts.js`
---
## Time to first byte: Measure the time to first byte

Time to First Byte (TTFB) measures the time from when the user starts navigating to a page until the first byte of the HTML response is received. It's a critical metric that reflects server responsiveness and network latency.

**Script:** `scripts/TTFB.js`
---
## Third-party impact by domain

Groups every third-party request by root domain and reports, per domain, the request count, the transfer size, whether any of its requests blocks rendering, and the main-thread time its scripts take inside long animation frames. It answers which third party to fix first.

**Script:** `scripts/Third-Party-Impact-by-Domain.js`
---
## Validate Preload Async Defer Scripts

**Script:** `scripts/Validate-Preload-Async-Defer-Scripts.js`
---
## Webfont usage analyzer

Cross-checks every font face the page knows about against the text that renders, and reports which faces are used, which downloaded for nothing, and which never loaded. Each unused font file is bytes the visitor pays for and, when the file is on the critical path, delay before text appears.

**Script:** `scripts/Webfont-Usage-Analyzer.js`
