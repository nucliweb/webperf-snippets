---
name: webperf-loading
description: Intelligent loading performance analysis with automated workflows for TTFB investigation (DNS/connection/server breakdown), render-blocking detection, script performance deep dive (first vs third-party attribution), font optimization, and resource hints validation. Includes decision trees that automatically analyze TTFB sub-parts when slow, detect script loading anti-patterns (async/defer/preload conflicts), identify render-blocking resources, and validate resource hints usage. Features workflows for complete loading audit (6 phases), backend performance investigation, and priority optimization. Cross-skill integration with Core Web Vitals (LCP resource loading), Interaction (script execution blocking), and Media (lazy loading strategy). Use when the user asks about TTFB, FCP, render-blocking, slow loading, font performance, script optimization, or resource hints. Compatible with Chrome DevTools MCP.
context: fork
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 1.3.0
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf: Loading Performance

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Scripts

- `scripts/Back-Forward-Cache.js` — Back Forward Cache
- `scripts/CSS-Media-Queries-Analysis.js` — CSS media queries analysis
- `scripts/Cache-Strategy-Analysis.js` — Cache Strategy Analysis
- `scripts/Client-Side-Redirect-Detection.js` — Client Side Redirect Detection
- `scripts/Compression-Audit.js` — Compression audit
- `scripts/Content-Visibility.js` — Content visibility
- `scripts/Critical-CSS-Detection.js` — Critical CSS detection
- `scripts/Event-Processing-Time.js` — Event processing time
- `scripts/FCP.js` — First contentful paint (FCP)
- `scripts/Find-Above-The-Fold-Lazy-Loaded-Images.js` — Find above the fold lazy loaded images
- `scripts/Find-Images-With-Lazy-and-Fetchpriority.js` — Find images with loading lazy and fetchpriority
- `scripts/Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js` — Find non lazy loaded images outside of the viewport
- `scripts/Find-render-blocking-resources.js` — Find render-blocking resources
- `scripts/First-And-Third-Party-Script-Info.js` — First And Third Party Script Info
- `scripts/First-And-Third-Party-Script-Timings.js` — First and third party script timings
- `scripts/Fonts-Preloaded-Loaded-and-used-above-the-fold.js` — Fonts preloaded, loaded, and used above the fold
- `scripts/Inline-CSS-Info-and-Size.js` — Inline CSS info and size
- `scripts/Inline-Script-Info-and-Size.js` — Inline script info and size
- `scripts/JS-Execution-Time-Breakdown.js` — JavaScript execution time breakdown
- `scripts/Prefetch-Resource-Validation.js` — Prefetch resource validation
- `scripts/Priority-Hints-Audit.js` — Priority hints audit
- `scripts/Resource-Hints-Validation.js` — Resource Hints Validation
- `scripts/Resource-Hints.js` — Resource hints
- `scripts/SSR-Hydration-Data-Analysis.js` — SSR framework hydration data analysis
- `scripts/Script-Loading.js` — Scripts loading
- `scripts/Server-Timing-Early-Hints.js` — Server-Timing and Early Hints viewer
- `scripts/Service-Worker-Analysis.js` — Service worker analysis
- `scripts/Speculation-Rules-Inspector.js` — Speculation rules inspector
- `scripts/TTFB-Resources.js` — Time to first byte: Measure TTFB for all resources
- `scripts/TTFB-Sub-Parts.js` — Time to first byte: Measure TTFB sub-parts
- `scripts/TTFB.js` — Time to first byte: Measure the time to first byte
- `scripts/Third-Party-Impact-by-Domain.js` — Third-party impact by domain
- `scripts/Validate-Preload-Async-Defer-Scripts.js` — Validate Preload Async Defer Scripts
- `scripts/Webfont-Usage-Analyzer.js` — Webfont usage analyzer


## Common Workflows

### Complete Loading Performance Audit

When the user asks for a comprehensive loading analysis or "audit loading performance":

1. **TTFB.js** - Establish baseline server/network performance
2. **FCP.js** - Check initial render timing
3. **Find-render-blocking-resources.js** - Identify what's blocking rendering
4. **Critical-CSS-Detection.js** - Validate CSS strategy
5. **Script-Loading.js** - Audit script loading patterns
6. **Resource-Hints-Validation.js** - Check optimization hints

### Server/Backend Performance Investigation

When TTFB is slow or the user asks "why is my server slow":

1. **TTFB.js** - Measure overall TTFB
2. **TTFB-Sub-Parts.js** - Break down into DNS, connection, server time
3. **Service-Worker-Analysis.js** - Check for SW overhead impacting TTFB
4. **TTFB-Resources.js** - Identify slow third-party or API endpoints
5. **Server-Timing-Early-Hints.js** - Read backend phases from `Server-Timing` and check 103 Early Hints

### Font Loading Optimization

When the user asks about fonts, FOIT, FOUT, or font performance:

1. **Fonts-Preloaded-Loaded-and-used-above-the-fold.js** - Full font audit
2. **Resource-Hints-Validation.js** - Verify font preloads are correct
3. **Find-render-blocking-resources.js** - Check if fonts block rendering
4. **Webfont-Usage-Analyzer.js** - Find font faces that are unused, never loaded, or use a blocking `font-display`

### Text Compression Audit

When the user asks about compression, gzip, brotli, or large transfer sizes for text resources:

1. **Compression-Audit.js** - Find text resources served without compression and estimate savings
2. **Find-render-blocking-resources.js** - Prioritize uncompressed CSS/JS that block rendering
3. **TTFB-Resources.js** - Check server response of the uncompressed resources

### Script Performance Deep Dive

When scripts are suspected to slow down the page:

1. **Script-Loading.js** - Identify blocking scripts and loading strategy
2. **First-And-Third-Party-Script-Info.js** - Separate first vs third-party impact
   - **Third-Party-Impact-by-Domain.js** - Rank third-party domains by render-blocking, main-thread time and size
3. **First-And-Third-Party-Script-Timings.js** - Diagnose slow script connections
4. **JS-Execution-Time-Breakdown.js** - Network vs parse/execution time
5. **Inline-Script-Info-and-Size.js** - Measure inline script overhead
6. **Validate-Preload-Async-Defer-Scripts.js** - Find preload anti-patterns

### Resource Hints & Priority Optimization

When the user wants to optimize resource loading priorities:

1. **Resource-Hints.js** - Overview of all hints in use
2. **Resource-Hints-Validation.js** - Verify hints are actually used
3. **Priority-Hints-Audit.js** - Check fetchpriority usage
4. **Prefetch-Resource-Validation.js** - Validate prefetch strategy
5. **Validate-Preload-Async-Defer-Scripts.js** - Find conflicts
6. **Speculation-Rules-Inspector.js** - Inspect prefetch/prerender rules and prerender activation

### CSS Optimization Workflow

When CSS is bloated or blocking rendering:

1. **Critical-CSS-Detection.js** - Check critical CSS strategy
2. **Inline-CSS-Info-and-Size.js** - Measure inline CSS overhead
3. **CSS-Media-Queries-Analysis.js** - Find unused responsive CSS
4. **Find-render-blocking-resources.js** - Identify blocking stylesheets

### SSR/Framework Performance

When analyzing Next.js, Nuxt, Remix, or other SSR frameworks:

1. **SSR-Hydration-Data-Analysis.js** - Analyze hydration data size
2. **Script-Loading.js** - Check framework script loading patterns
3. **JS-Execution-Time-Breakdown.js** - Measure hydration execution cost
4. **Content-Visibility.js** - Check if content-visibility is used for optimization

## Decision Tree

Use this decision tree to automatically run follow-up snippets based on results:

### After TTFB.js

- **If TTFB > 600ms** → Run **TTFB-Sub-Parts.js** to diagnose where time is spent
- **If Service Worker detected** → Run **Service-Worker-Analysis.js** to check for SW overhead
- **If TTFB varies significantly across resources** → Run **TTFB-Resources.js**
- **If server time dominates TTFB-Sub-Parts.js** → Run **Server-Timing-Early-Hints.js** to see which backend phase is slow

### After Server-Timing-Early-Hints.js

- **If no `Server-Timing` metrics found** → Recommend adding `Server-Timing` headers for database, cache and render phases
- **If cross-origin resources look hidden** → Recommend `Timing-Allow-Origin` on those responses
- **If no 103 Early Hints received and server time is high** → Recommend Early Hints for the main stylesheet and LCP image

### After FCP.js

- **If FCP > 1.8s** → Run:
  1. **Find-render-blocking-resources.js** (CSS/JS blocking)
  2. **Critical-CSS-Detection.js** (CSS strategy)
  3. **Script-Loading.js** (blocking scripts)
- **If FCP is good but user complains about perceived slowness** → Check LCP with **webperf-core-web-vitals** skill

### After Find-render-blocking-resources.js

- **If blocking stylesheets found** → Run **Critical-CSS-Detection.js**
- **If blocking scripts found** → Run:
  1. **Script-Loading.js** (loading strategy)
  2. **Validate-Preload-Async-Defer-Scripts.js** (check for anti-patterns)
- **If fonts blocking** → Run **Fonts-Preloaded-Loaded-and-used-above-the-fold.js**

### After Script-Loading.js

- **If many blocking/parser-blocking scripts** → Run:
  1. **JS-Execution-Time-Breakdown.js** (measure execution cost)
  2. **First-And-Third-Party-Script-Info.js** (identify third-party culprits)
- **If third-party scripts detected** → Run **First-And-Third-Party-Script-Timings.js**
- **If large inline scripts** → Run **Inline-Script-Info-and-Size.js**

### After Resource-Hints-Validation.js

- **If unused preloads found** → Recommend removing them
- **If missing preloads for critical resources** → Run:
  1. **Fonts-Preloaded-Loaded-and-used-above-the-fold.js** (fonts)
  2. **Priority-Hints-Audit.js** (LCP candidate)
- **If preloads on async/defer scripts** → Run **Validate-Preload-Async-Defer-Scripts.js**

### After Compression-Audit.js

- **If uncompressed CSS/JS found** → Run **Find-render-blocking-resources.js** to see if they block rendering
- **If estimated savings > 100KB** → Recommend enabling gzip or brotli on the server or CDN
- **If corsLimitedAnalysis is true** → Report the result as a lower bound and suggest `Timing-Allow-Origin` on resources you control

### After Third-Party-Impact-by-Domain.js

- **If a domain is render-blocking** → Recommend `async`, `defer`, lazy loading or self-hosting; run **Script-Loading.js** for the loading strategy
- **If a domain's main-thread time > 250ms** → Run **Long-Animation-Frames-Script-Attribution.js** (webperf-interaction) to find the functions responsible, and recommend delaying or removing the script
- **If many domains with few requests each** → Recommend auditing tags and removing unused ones
- **If corsLimitedAnalysis is true** → Report sizes as a lower bound; use **First-And-Third-Party-Script-Timings.js** for timings of the hidden resources

### After Service-Worker-Analysis.js

- **If SW overhead > 100ms** → Recommend Navigation Preload API
- **If SW caching many resources** → Run **TTFB-Resources.js** to verify cache hits
- **If SW not detected but site is SPA/PWA** → Recommend implementing SW

### After Fonts-Preloaded-Loaded-and-used-above-the-fold.js

- **If fonts preloaded but not used above-the-fold** → Recommend removing preloads
- **If fonts used but not preloaded** → Recommend adding preload
- **If many font variants loaded** → Suggest subsetting or reducing variants, and run **Webfont-Usage-Analyzer.js** to find the unused ones

### After Webfont-Usage-Analyzer.js

- **If fonts loaded but not used** → Recommend removing the `@font-face` declaration or the preload
- **If faces use `font-display: auto` or `block`** → Recommend `swap` or `optional`, then check **Find-render-blocking-resources.js**
- **If font bytes are high** → Suggest subsetting with `unicode-range` and WOFF2
- **If the LCP element is text** → Run **LCP.js** with the **webperf-core-web-vitals** skill

### After First-And-Third-Party-Script-Info.js

- **If many third-party scripts (>5)** → Run:
  1. **First-And-Third-Party-Script-Timings.js** (detailed timing)
  2. **JS-Execution-Time-Breakdown.js** (execution impact)
- **If third-party scripts are slow** → Recommend async/defer or removal

### After SSR-Hydration-Data-Analysis.js

- **If hydration data > 100KB** → Recommend optimization strategies
- **If multiple hydration scripts** → Investigate framework configuration
- **If large inline hydration data** → Consider streaming or chunking

### After Priority-Hints-Audit.js

- **If LCP candidate lacks fetchpriority="high"** → Recommend adding it
- **If conflicting priorities (preload + low)** → Recommend resolving conflict
- **If fetchpriority on non-critical resources** → Review priority strategy

### After Prefetch-Resource-Validation.js

- **If >10 prefetch hints** → Recommend reducing to critical resources
- **If individual prefetch > 500KB** → Question necessity
- **If total prefetch > 2MB** → Flag as mobile bandwidth concern
- **If few or no prefetch hints for likely next navigations** → Run **Speculation-Rules-Inspector.js** to check for prefetch/prerender rules

### After Speculation-Rules-Inspector.js

- **If no speculation rules found but the site has predictable navigations** → Recommend adding prefetch or prerender rules
- **If invalid JSON or wasteful rules (eager prerender of many URLs)** → Recommend fixing or lowering eagerness to `moderate` or `conservative`
- **If the page was prerendered (`activationStart` > 0)** → Subtract `activationStart` when interpreting **TTFB.js**, **FCP.js** and LCP results

### After Critical-CSS-Detection.js

- **If render-blocking CSS > 14KB** → Recommend inlining critical CSS
- **If no inline CSS but has blocking stylesheets** → Suggest critical CSS extraction
- **If CSS > 50KB total** → Run **CSS-Media-Queries-Analysis.js** to find savings

### After Back-Forward-Cache.js

- **If bfcache blocked** → Provide specific remediation based on blocking reasons
- **If bfcache eligible** → Confirm optimization is working

### After Client-Side-Redirect-Detection.js

- **If client-side redirects detected** → Recommend server-side redirects
- **If redirect chain found** → Suggest eliminating intermediate hops

## References

- `references/snippets.md` — Descriptions and thresholds for each script
- `references/schema.md` — Return value schema for interpreting script output