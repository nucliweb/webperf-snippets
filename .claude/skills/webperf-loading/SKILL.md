---
name: webperf-loading
description: Intelligent loading performance analysis with automated workflows for TTFB investigation (DNS/connection/server breakdown), render-blocking detection, script performance deep dive (first vs third-party attribution), font optimization, and resource hints validation. Includes decision trees that automatically analyze TTFB sub-parts when slow, detect script loading anti-patterns (async/defer/preload conflicts), identify render-blocking resources, and validate resource hints usage. Features workflows for complete loading audit (6 phases), backend performance investigation, and priority optimization. Cross-skill integration with Core Web Vitals (LCP resource loading), Interaction (script execution blocking), and Media (lazy loading strategy). Use when the user asks about TTFB, FCP, render-blocking, slow loading, font performance, script optimization, or resource hints. Compatible with Chrome DevTools MCP.
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 1.0.0
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf: Loading Performance

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Scripts

- `scripts/Back-Forward-Cache.js` — Back/Forward Cache (bfcache)
- `scripts/CSS-Media-Queries-Analysis.js` — CSS Media Queries Analysis
- `scripts/Client-Side-Redirect-Detection.js` — Client-Side Redirect Detection
- `scripts/Content-Visibility.js` — Content Visibility
- `scripts/Critical-CSS-Detection.js` — Critical CSS Detection
- `scripts/Event-Processing-Time.js` — Event Processing Time
- `scripts/FCP.js` — First Contentful Paint (FCP)
- `scripts/Find-Above-The-Fold-Lazy-Loaded-Images.js` — Find Above The Fold Lazy Loaded Images
- `scripts/Find-Images-With-Lazy-and-Fetchpriority.js` — Find Images With Loading Lazy and Fetchpriority
- `scripts/Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js` — Find non Lazy Loaded Images outside of the viewport
- `scripts/Find-render-blocking-resources.js` — Find render-blocking resources
- `scripts/First-And-Third-Party-Script-Info.js` — First And Third Party Script Info
- `scripts/First-And-Third-Party-Script-Timings.js` — First And Third Party Script Timings
- `scripts/Fonts-Preloaded-Loaded-and-used-above-the-fold.js` — Fonts Preloaded, Loaded, and Used Above The Fold
- `scripts/Inline-CSS-Info-and-Size.js` — Inline CSS Info and Size
- `scripts/Inline-Script-Info-and-Size.js` — Inline Script Info and Size
- `scripts/JS-Execution-Time-Breakdown.js` — JavaScript Execution Time Breakdown
- `scripts/Prefetch-Resource-Validation.js` — Prefetch Resource Validation
- `scripts/Priority-Hints-Audit.js` — Priority Hints Audit
- `scripts/Resource-Hints-Validation.js` — Resource Hints Validation
- `scripts/Resource-Hints.js` — Resource Hints
- `scripts/SSR-Hydration-Data-Analysis.js` — SSR Framework Hydration Data Analysis
- `scripts/Script-Loading.js` — Scripts Loading
- `scripts/Service-Worker-Analysis.js` — Service Worker Analysis
- `scripts/TTFB-Resources.js` — Time To First Byte: Measure TTFB for all resources
- `scripts/TTFB-Sub-Parts.js` — Time To First Byte: Measure TTFB sub-parts
- `scripts/TTFB.js` — Time To First Byte: Measure the time to first byte
- `scripts/Validate-Preload-Async-Defer-Scripts.js` — Validate Preload on Async/Defer Scripts

Descriptions and thresholds: `references/snippets.md`

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

### Font Loading Optimization

When the user asks about fonts, FOIT, FOUT, or font performance:

1. **Fonts-Preloaded-Loaded-and-used-above-the-fold.js** - Full font audit
2. **Resource-Hints-Validation.js** - Verify font preloads are correct
3. **Find-render-blocking-resources.js** - Check if fonts block rendering

### Script Performance Deep Dive

When scripts are suspected to slow down the page:

1. **Script-Loading.js** - Identify blocking scripts and loading strategy
2. **First-And-Third-Party-Script-Info.js** - Separate first vs third-party impact
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

### CSS Optimization Workflow

When CSS is bloated or blocking rendering:

1. **Critical-CSS-Detection.js** - Check critical CSS strategy
2. **Inline-CSS-Info-and-Size.js** - Measure inline CSS overhead
3. **CSS-Media-Queries-Analysis.js** - Find unused responsive CSS
4. **Find-render-blocking-resources.js** - Identify blocking stylesheets

### Image Loading Audit

When images are suspected to cause loading issues:

1. **Find-Above-The-Fold-Lazy-Loaded-Images.js** - Check for lazy-loading anti-patterns
2. **Find-non-Lazy-Loaded-Images-outside-of-the-viewport.js** - Find missed optimization opportunities
3. **Find-Images-With-Lazy-and-Fetchpriority.js** - Detect contradictory attributes
4. **Priority-Hints-Audit.js** - Verify LCP image has fetchpriority="high"

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

### After Service-Worker-Analysis.js

- **If SW overhead > 100ms** → Recommend Navigation Preload API
- **If SW caching many resources** → Run **TTFB-Resources.js** to verify cache hits
- **If SW not detected but site is SPA/PWA** → Recommend implementing SW

### After Fonts-Preloaded-Loaded-and-used-above-the-fold.js

- **If fonts preloaded but not used above-the-fold** → Recommend removing preloads
- **If fonts used but not preloaded** → Recommend adding preload
- **If many font variants loaded** → Suggest subsetting or reducing variants

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

> Execute via `mcp__chrome-devtools__evaluate_script` → read with `mcp__chrome-devtools__get_console_message`.