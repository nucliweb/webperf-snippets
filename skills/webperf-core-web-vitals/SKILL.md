---
name: webperf-core-web-vitals
description: Intelligent Core Web Vitals analysis with automated workflows and decision trees. Measures LCP, CLS, INP with guided debugging that automatically determines follow-up analysis based on results. Includes workflows for LCP deep dive (5 phases), CLS investigation (loading vs interaction), INP debugging (latency breakdown + attribution), and cross-skill integration with loading, interaction, and media skills. Use when the user asks about Core Web Vitals, LCP optimization, layout shifts, or interaction responsiveness. Compatible with Chrome DevTools MCP.
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 1.0.0
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf: Core Web Vitals

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Scripts

- `scripts/CLS.js` — Cumulative Layout Shift (CLS)
- `scripts/INP.js` — Interaction to Next Paint (INP)
- `scripts/LCP-Image-Entropy.js` — LCP Image Entropy
- `scripts/LCP-Sub-Parts.js` — LCP Sub-Parts
- `scripts/LCP-Trail.js` — LCP Trail
- `scripts/LCP-Video-Candidate.js` — LCP Video Candidate
- `scripts/LCP.js` — Largest Contentful Paint (LCP)

Descriptions and thresholds: `references/snippets.md`

## Common Workflows

### Complete Core Web Vitals Audit

When the user asks for a comprehensive Core Web Vitals analysis or "audit CWV":

1. **LCP.js** - Measure Largest Contentful Paint
2. **CLS.js** - Measure Cumulative Layout Shift
3. **INP.js** - Measure Interaction to Next Paint
4. **LCP-Sub-Parts.js** - Break down LCP timing phases
5. **LCP-Trail.js** - Track LCP candidate evolution

### LCP Deep Dive

When LCP is slow or the user asks "debug LCP" or "why is LCP slow":

1. **LCP.js** - Establish baseline LCP value
2. **LCP-Sub-Parts.js** - Break down into TTFB, resource load, render delay
3. **LCP-Trail.js** - Identify all LCP candidates and changes
4. **LCP-Image-Entropy.js** - Check if LCP image has visual complexity issues
5. **LCP-Video-Candidate.js** - Detect if LCP is a video (poster or video element)

### CLS Investigation

When layout shifts are detected or the user asks "debug CLS" or "layout shift issues":

1. **CLS.js** - Measure overall CLS score
2. **Layout-Shift-Loading-and-Interaction.js** (from Interaction skill) - Separate loading vs interaction shifts
3. Cross-reference with **webperf-loading** skill:
   - Find-Above-The-Fold-Lazy-Loaded-Images.js (lazy images causing shifts)
   - Fonts-Preloaded-Loaded-and-used-above-the-fold.js (font swap causing shifts)

### INP Debugging

When interactions feel slow or the user asks "debug INP" or "slow interactions":

1. **INP.js** - Measure overall INP value
2. **Interactions.js** (from Interaction skill) - List all interactions with timing
3. **Input-Latency-Breakdown.js** (from Interaction skill) - Break down input delay, processing, presentation
4. **Long-Animation-Frames.js** (from Interaction skill) - Identify blocking animation frames
5. **Long-Animation-Frames-Script-Attribution.js** (from Interaction skill) - Find scripts causing delays

### Video as LCP Investigation

When LCP is a video element (detected by LCP-Video-Candidate.js):

1. **LCP-Video-Candidate.js** - Identify video as LCP candidate
2. **Video-Element-Audit.js** (from Media skill) - Audit video loading strategy
3. **LCP-Sub-Parts.js** - Analyze video loading phases
4. Cross-reference with **webperf-loading** skill:
   - Resource-Hints-Validation.js (check for video preload)
   - Priority-Hints-Audit.js (check for fetchpriority on video)

### Image as LCP Investigation

When LCP is an image (most common case):

1. **LCP.js** - Measure LCP timing
2. **LCP-Sub-Parts.js** - Break down timing phases
3. **LCP-Image-Entropy.js** - Analyze image complexity
4. Cross-reference with **webperf-media** skill:
   - Image-Element-Audit.js (check format, dimensions, lazy loading)
5. Cross-reference with **webperf-loading** skill:
   - Find-Above-The-Fold-Lazy-Loaded-Images.js (check if incorrectly lazy)
   - Priority-Hints-Audit.js (check for fetchpriority="high")
   - Resource-Hints-Validation.js (check for preload)

## Decision Tree

Use this decision tree to automatically run follow-up snippets based on results:

### After LCP.js

- **If LCP > 2.5s** → Run **LCP-Sub-Parts.js** to diagnose which phase is slow
- **If LCP > 4.0s (poor)** → Run full LCP deep dive workflow (5 snippets)
- **If LCP candidate is an image** → Run **LCP-Image-Entropy.js** and **webperf-media:Image-Element-Audit.js**
- **If LCP candidate is a video** → Run **LCP-Video-Candidate.js** and **webperf-media:Video-Element-Audit.js**
- **Always run** → **LCP-Trail.js** to understand candidate evolution

### After LCP-Sub-Parts.js

- **If TTFB phase > 600ms** → Switch to **webperf-loading** skill and run TTFB-Sub-Parts.js
- **If Resource Load Time > 1500ms** → Run:
  1. **webperf-loading:Resource-Hints-Validation.js** (check for preload/preconnect)
  2. **webperf-loading:Priority-Hints-Audit.js** (check fetchpriority)
  3. **webperf-loading:Find-render-blocking-resources.js** (competing resources)
- **If Render Delay > 200ms** → Run:
  1. **webperf-loading:Find-render-blocking-resources.js** (blocking CSS/JS)
  2. **webperf-loading:Script-Loading.js** (parser-blocking scripts)
  3. **webperf-interaction:Long-Animation-Frames.js** (main thread blocking)

### After LCP-Trail.js

- **If many LCP candidate changes (>3)** → This causes visual instability, investigate:
  1. **webperf-loading:Find-Above-The-Fold-Lazy-Loaded-Images.js** (late-loading images)
  2. **webperf-loading:Fonts-Preloaded-Loaded-and-used-above-the-fold.js** (font swaps)
  3. **CLS.js** (layout shifts contributing to LCP changes)
- **If final LCP candidate appears late** → Run **webperf-loading:Resource-Hints-Validation.js**
- **If early candidate was replaced** → Understand why initial content was pushed down (likely CLS issue)

### After LCP-Image-Entropy.js

- **If entropy is very high** → Image is visually complex, recommend:
  - Modern formats (WebP, AVIF)
  - Appropriate compression
  - Potentially a placeholder strategy
- **If entropy is low** → Image may be over-optimized or placeholder-like
- **If large file size detected** → Run **webperf-media:Image-Element-Audit.js** for format/sizing analysis

### After LCP-Video-Candidate.js

- **If video is LCP** → Run:
  1. **webperf-media:Video-Element-Audit.js** (check poster, preload, formats)
  2. **webperf-loading:Priority-Hints-Audit.js** (check fetchpriority on poster)
  3. **LCP-Sub-Parts.js** (analyze video loading phases)
- **If poster image is LCP** → Treat as image LCP (run image workflows)

### After CLS.js

- **If CLS > 0.1** → Run **webperf-interaction:Layout-Shift-Loading-and-Interaction.js** to separate causes
- **If CLS > 0.25 (poor)** → Run comprehensive shift investigation:
  1. **webperf-loading:Find-Above-The-Fold-Lazy-Loaded-Images.js** (images without dimensions)
  2. **webperf-loading:Fonts-Preloaded-Loaded-and-used-above-the-fold.js** (font loading strategy)
  3. **webperf-loading:Critical-CSS-Detection.js** (late-loading styles)
  4. **webperf-media:Image-Element-Audit.js** (missing width/height)
- **If CLS = 0** → Confirm with multiple page loads (might be timing-dependent)

### After INP.js

- **If INP > 200ms** → Run **webperf-interaction:Interactions.js** to identify slow interactions
- **If INP > 500ms (poor)** → Run full INP debugging workflow:
  1. **webperf-interaction:Interactions.js** (list all interactions)
  2. **webperf-interaction:Input-Latency-Breakdown.js** (phase breakdown)
  3. **webperf-interaction:Long-Animation-Frames.js** (blocking frames)
  4. **webperf-interaction:Long-Animation-Frames-Script-Attribution.js** (culprit scripts)
- **If specific interaction type is slow (e.g., keyboard)** → Focus analysis on that interaction type

### Cross-Skill Triggers

These triggers recommend using snippets from other skills:

#### From LCP to Loading Skill

- **If LCP > 2.5s and TTFB phase is dominant** → Use **webperf-loading** skill:
  - TTFB.js, TTFB-Sub-Parts.js, Service-Worker-Analysis.js

- **If LCP image is lazy-loaded** → Use **webperf-loading** skill:
  - Find-Above-The-Fold-Lazy-Loaded-Images.js

- **If LCP has no fetchpriority** → Use **webperf-loading** skill:
  - Priority-Hints-Audit.js

#### From CLS to Loading Skill

- **If CLS caused by fonts** → Use **webperf-loading** skill:
  - Fonts-Preloaded-Loaded-and-used-above-the-fold.js
  - Resource-Hints-Validation.js (for font preload)

- **If CLS caused by images** → Use **webperf-media** skill:
  - Image-Element-Audit.js (check for width/height attributes)

#### From INP to Interaction Skill

- **If INP > 200ms** → Use **webperf-interaction** skill for full debugging:
  - Interactions.js, Input-Latency-Breakdown.js
  - Long-Animation-Frames.js, Long-Animation-Frames-Script-Attribution.js
  - LongTask.js (if pre-interaction blocking suspected)

#### From LCP/INP to Interaction Skill

- **If render delay or interaction delay is high** → Use **webperf-interaction** skill:
  - Long-Animation-Frames.js (main thread blocking)
  - LongTask.js (long tasks delaying rendering)

### Multi-Metric Correlation

When multiple CWV metrics are poor, prioritize investigation:

- **If LCP > 2.5s AND CLS > 0.1** → Likely shared root cause:
  1. Check for late-loading content pushing LCP element
  2. Run LCP-Trail.js to see LCP candidate changes
  3. Run Layout-Shift-Loading-and-Interaction.js to correlate timing

- **If LCP > 2.5s AND INP > 200ms** → Main thread congestion:
  1. Run Long-Animation-Frames.js
  2. Run webperf-loading:Script-Loading.js
  3. Run webperf-loading:JS-Execution-Time-Breakdown.js

- **If CLS > 0.1 AND INP > 200ms** → Layout thrashing or interaction-triggered shifts:
  1. Run Layout-Shift-Loading-and-Interaction.js
  2. Run Interactions.js
  3. Check if shifts occur during/after interactions

## References

- `references/snippets.md` — Descriptions and thresholds for each script
- `references/schema.md` — Return value schema for interpreting script output

> Execute via `mcp__chrome-devtools__evaluate_script` → read with `mcp__chrome-devtools__get_console_message`.