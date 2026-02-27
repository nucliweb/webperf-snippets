---
name: webperf-interaction
description: Intelligent interaction performance analysis with automated workflows for INP debugging, scroll jank investigation, and main thread blocking. Includes decision trees that automatically run script attribution when long frames detected, break down input latency phases, and correlate layout shifts with interactions. Features workflows for complete interaction audit, third-party script impact analysis, and animation performance debugging. Cross-skill integration with Core Web Vitals (INP/CLS correlation) and Loading (script execution analysis). Use when the user asks about slow interactions, janky scrolling, unresponsive pages, or INP optimization. Compatible with Chrome DevTools MCP.
---

# WebPerf: Interaction & Animation

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Available Snippets

| Snippet | Description | File |
|---------|-------------|------|
| Input Latency Breakdown | Aggregates interaction latency by event type to reveal which phase causes slowness across all intera | scripts/Input-Latency-Breakdown.js |
| Interactions | Tracks all user interactions in real-time to help debug and improve Interaction to Next Paint (INP) | scripts/Interactions.js |
| Layout Shift Tracking | Tracks all layout shifts during page load and user interaction, identifying the elements causing Cum | scripts/Layout-Shift-Loading-and-Interaction.js |
| LoAF Helpers | Advanced debugging utilities for Long Animation Frames | scripts/Long-Animation-Frames-Helpers.js |
| Long Animation Frames Script Attribution | Analyzes and visualizes which scripts are responsible for blocking the main thread | scripts/Long-Animation-Frames-Script-Attribution.js |
| Long Animation Frames (LoAF) | Tracks Long Animation Frames to identify JavaScript and rendering work that blocks the main thread | scripts/Long-Animation-Frames.js |
| Long Tasks | Tracks tasks that block the main thread for more than 50ms | scripts/LongTask.js |
| Scroll Performance Analysis | Measures scroll jank, frame drops, and event listener configuration to identify what makes scrolling | scripts/Scroll-Performance.js |

## Execution with Chrome DevTools MCP

```
1. mcp__chrome-devtools__navigate_page  → navigate to target URL
2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)
3. mcp__chrome-devtools__get_console_message → capture console output
4. Interpret results using thresholds below, provide recommendations
```

## Common Workflows

### Complete Interaction Performance Audit

When the user asks for interaction analysis or "audit responsiveness":

1. **Interactions.js** - List all user interactions with timing
2. **Input-Latency-Breakdown.js** - Break down interaction phases
3. **Long-Animation-Frames.js** - Detect blocking animation frames
4. **LongTask.js** - Identify long tasks blocking the main thread
5. **Scroll-Performance.js** - Measure scroll smoothness

### INP Deep Dive

When INP is slow (>200ms) or the user asks "debug INP" or "slow interactions":

1. **Interactions.js** - Identify which interactions are slow
2. **Input-Latency-Breakdown.js** - Break down into input delay, processing time, presentation delay
3. **Long-Animation-Frames.js** - Find animation frames >50ms that block interactions
4. **Long-Animation-Frames-Script-Attribution.js** - Identify scripts causing the blocking
5. **Long-Animation-Frames-Helpers.js** - Get detailed timing and attribution helpers

### Scroll Jank Investigation

When the user reports "scroll jank", "choppy scrolling", or "scroll performance issues":

1. **Scroll-Performance.js** - Measure scroll smoothness and frame drops
2. **Long-Animation-Frames.js** - Detect frames causing jank (>50ms)
3. **Layout-Shift-Loading-and-Interaction.js** - Check for layout shifts during scroll
4. **Long-Animation-Frames-Script-Attribution.js** - Find scripts running during scroll

### Main Thread Blocking Analysis

When the page feels unresponsive or the user asks "why is the page frozen":

1. **LongTask.js** - List all tasks >50ms blocking the main thread
2. **Long-Animation-Frames.js** - Correlate with animation frame timing
3. **Long-Animation-Frames-Script-Attribution.js** - Attribute blocking to specific scripts
4. Cross-reference with **webperf-loading** skill:
   - JS-Execution-Time-Breakdown.js (script parsing/execution time)
   - First-And-Third-Party-Script-Info.js (identify third-party blockers)

### Layout Shift During Interaction

When the user reports "things move when I click" or CLS issues during interaction:

1. **Layout-Shift-Loading-and-Interaction.js** - Separate loading vs interaction shifts
2. **Interactions.js** - Correlate shifts with specific interactions
3. **CLS.js** (from Core Web Vitals skill) - Measure total CLS
4. Cross-reference with **webperf-media** skill:
   - Image-Element-Audit.js (images without dimensions causing shifts)

### Animation Performance Analysis

When animations feel sluggish or the user asks "debug animation performance":

1. **Long-Animation-Frames.js** - Identify frames taking too long to render
2. **Long-Animation-Frames-Helpers.js** - Detailed frame timing analysis
3. **Long-Animation-Frames-Script-Attribution.js** - Find scripts delaying frames
4. **Scroll-Performance.js** - If scroll animations are involved

### Third-Party Script Impact on Interactions

When interactions are slow and third-party scripts are suspected:

1. **Long-Animation-Frames-Script-Attribution.js** - Identify third-party scripts in long frames
2. **LongTask.js** - Measure long task frequency
3. Cross-reference with **webperf-loading** skill:
   - First-And-Third-Party-Script-Info.js (list all third-party scripts)
   - First-And-Third-Party-Script-Timings.js (measure script loading impact)
   - Script-Loading.js (check for blocking scripts)

## Decision Tree

Use this decision tree to automatically run follow-up snippets based on results:

### After Interactions.js

- **If any interaction > 200ms** → Run **Input-Latency-Breakdown.js** on slow interactions
- **If many interactions > 200ms** → Main thread congestion, run:
  1. **Long-Animation-Frames.js** (blocking frames)
  2. **LongTask.js** (long tasks)
  3. **Long-Animation-Frames-Script-Attribution.js** (culprit scripts)
- **If specific interaction types are slow (e.g., click vs keyboard)** → Focus on that interaction type
- **If interactions occur during page load** → Cross-check with **webperf-loading:JS-Execution-Time-Breakdown.js**

### After Input-Latency-Breakdown.js

- **If Input Delay > 50ms** → Main thread was busy, run:
  1. **Long-Animation-Frames.js** (what was blocking)
  2. **LongTask.js** (long task before interaction)
- **If Processing Time > 100ms** → Heavy event handlers, run:
  1. **Long-Animation-Frames-Script-Attribution.js** (which scripts)
  2. **webperf-loading:First-And-Third-Party-Script-Info.js** (third-party involvement)
- **If Presentation Delay > 50ms** → Rendering bottleneck, run:
  1. **Long-Animation-Frames.js** (frame rendering time)
  2. **Layout-Shift-Loading-and-Interaction.js** (check for layout work)

### After Long-Animation-Frames.js

- **If many frames > 50ms** → Run **Long-Animation-Frames-Script-Attribution.js** to identify causes
- **If frames > 100ms** → Critical blocking, run:
  1. **Long-Animation-Frames-Script-Attribution.js** (detailed attribution)
  2. **LongTask.js** (related long tasks)
  3. **webperf-loading:JS-Execution-Time-Breakdown.js** (script execution cost)
- **If frames occur during scroll** → Run **Scroll-Performance.js** to measure impact
- **If frames occur during page load** → Cross-check with **webperf-loading:Event-Processing-Time.js**

### After Long-Animation-Frames-Script-Attribution.js

- **If third-party scripts are causing long frames** → Run:
  1. **webperf-loading:First-And-Third-Party-Script-Info.js** (list all third-party scripts)
  2. **webperf-loading:Script-Loading.js** (check loading strategy)
  3. Recommend deferring or removing problematic scripts
- **If first-party scripts are causing long frames** → Recommend:
  - Code splitting
  - Debouncing/throttling event handlers
  - Web Workers for heavy computation
- **If forced reflow/layout detected** → Analyze DOM manipulation patterns

### After LongTask.js

- **If many long tasks (>5)** → Main thread is congested, run:
  1. **Long-Animation-Frames-Script-Attribution.js** (detailed attribution)
  2. **webperf-loading:JS-Execution-Time-Breakdown.js** (script execution analysis)
  3. **webperf-loading:First-And-Third-Party-Script-Info.js** (identify heavy scripts)
- **If long tasks > 500ms** → Critical blocking, investigate:
  - Synchronous third-party scripts
  - Heavy computation without Web Workers
  - Excessive DOM manipulation
- **If long tasks correlate with interactions** → Run **Interactions.js** to see impact

### After Scroll-Performance.js

- **If scroll FPS < 30** → Severe jank, run:
  1. **Long-Animation-Frames.js** (blocking frames during scroll)
  2. **Long-Animation-Frames-Script-Attribution.js** (scripts running on scroll)
  3. **Layout-Shift-Loading-and-Interaction.js** (layout work during scroll)
- **If scroll FPS 30-50** → Noticeable jank, investigate:
  - Scroll event handlers
  - Passive event listeners
  - CSS will-change properties
- **If scroll FPS > 50** → Good, but check for layout shifts during scroll

### After Layout-Shift-Loading-and-Interaction.js

- **If shifts occur during page load** → Cross-reference with **webperf-core-web-vitals:CLS.js**
- **If shifts occur during interaction** → This impacts INP and UX, investigate:
  1. Dynamic content insertion
  2. Images/ads loading without dimensions
  3. Font swaps (run **webperf-loading:Fonts-Preloaded-Loaded-and-used-above-the-fold.js**)
- **If shifts occur during scroll** → Run **Scroll-Performance.js** to measure impact

### After Long-Animation-Frames-Helpers.js

This is a utility snippet, use results to:
- Understand frame timing in detail
- Identify precise script attribution
- Measure style/layout/paint phases
- No automatic follow-up, use data to inform next steps

### Cross-Skill Triggers

These triggers recommend using snippets from other skills:

#### From Interaction to Core Web Vitals Skill

- **If INP > 200ms detected** → Use **webperf-core-web-vitals** skill:
  - INP.js (official INP measurement)
  - LCP-Sub-Parts.js (if render delay is causing INP)

- **If layout shifts during interaction** → Use **webperf-core-web-vitals** skill:
  - CLS.js (measure cumulative impact)
  - LCP-Trail.js (check if shifts affect LCP candidate)

#### From Interaction to Loading Skill

- **If long frames caused by script execution** → Use **webperf-loading** skill:
  - JS-Execution-Time-Breakdown.js (parsing vs execution time)
  - First-And-Third-Party-Script-Info.js (identify heavy scripts)
  - Script-Loading.js (check for blocking patterns)

- **If interactions slow during page load** → Use **webperf-loading** skill:
  - Event-Processing-Time.js (page load phases)
  - Find-render-blocking-resources.js (competing resources)

#### From Interaction to Media Skill

- **If layout shifts involve images** → Use **webperf-media** skill:
  - Image-Element-Audit.js (check for missing dimensions)

### Performance Budget Thresholds

Use these thresholds to automatically trigger follow-up analysis:

**INP Thresholds:**
- **Good**: ≤ 200ms → Monitor, no action needed
- **Needs Improvement**: 200-500ms → Run Input-Latency-Breakdown.js
- **Poor**: > 500ms → Run full INP debugging workflow (5 snippets)

**Long Animation Frames:**
- **Warning**: > 50ms → Run Long-Animation-Frames-Script-Attribution.js
- **Critical**: > 100ms → Run full main thread blocking workflow

**Long Tasks:**
- **Warning**: > 50ms → Monitor frequency
- **Critical**: > 200ms or >5 tasks per second → Run attribution and script analysis

**Scroll Performance:**
- **Good**: ≥ 50 FPS → Monitor
- **Needs Improvement**: 30-50 FPS → Run Long-Animation-Frames.js
- **Poor**: < 30 FPS → Run full scroll jank workflow

**Interaction Frequency:**
- **If >10 interactions/second** → User is actively interacting, prioritize INP optimization
- **If <1 interaction/5 seconds** → Interactions are rare, focus on first interaction responsiveness

### Multi-Metric Correlation

When multiple interaction metrics are poor:

- **If Long Tasks AND Long Animation Frames both detected** → Shared root cause:
  1. Run Long-Animation-Frames-Script-Attribution.js
  2. Likely heavy JavaScript execution
  3. Consider code splitting or Web Workers

- **If INP slow AND CLS high** → Interaction-triggered layout shifts:
  1. Run Layout-Shift-Loading-and-Interaction.js
  2. Correlate shift timing with interaction timing
  3. Check for dynamic content insertion

- **If Scroll jank AND Long Animation Frames** → Scroll handlers blocking main thread:
  1. Run Long-Animation-Frames-Script-Attribution.js during scroll
  2. Check for non-passive scroll listeners
  3. Audit scroll-triggered animations

---

---

## Input Latency Breakdown

Aggregates interaction latency by event type to reveal which phase causes slowness across all interactions with the page. While Interactions shows a per-interaction breakdown in real time, this snippet collects data over time and answers a different question: is click systematically slower than keypress? Is the bottleneck always input delay, or does it vary by event?

**Script:** `scripts/Input-Latency-Breakdown.js`

---

## Interactions

Tracks all user interactions in real-time to help debug and improve Interaction to Next Paint (INP). INP measures responsiveness by tracking the latency of all interactions during a page visit. This snippet breaks down each interaction into three phases to identify bottlenecks. Based on the Web Vitals Chrome Extension.

**Script:** `scripts/Interactions.js`

**Thresholds:**

| Rating | Duration | Meaning |
|--------|----------|---------|
| 🟢 Good | ≤ 200ms | Fast, responsive interaction |
| 🟡 Needs Improvement | ≤ 500ms | Noticeable delay |
| 🔴 Poor | > 500ms | Frustrating delay |

---

## Layout Shift Tracking

Tracks all layout shifts during page load and user interaction, identifying the elements causing Cumulative Layout Shift (CLS). This debugging-focused snippet logs every shift with detailed information about which elements moved and when.

**Script:** `scripts/Layout-Shift-Loading-and-Interaction.js`

**Thresholds:**

| Rating | CLS Score | Meaning |
|--------|-----------|---------|
| 🟢 Good | ≤ 0.1 | Minimal, stable layout |
| 🟡 Needs Improvement | ≤ 0.25 | Noticeable shifting |
| 🔴 Poor | > 0.25 | Significant layout instability |

---

## LoAF Helpers

Advanced debugging utilities for Long Animation Frames. While the basic LoAF snippet shows real-time frame data, this helper library provides powerful analysis, filtering, and export capabilities.

**Script:** `scripts/Long-Animation-Frames-Helpers.js`

**Thresholds:**

| Severity | Duration | Indicator |
|----------|----------|-----------|
| Critical | > 200ms | 🔴 |
| High | 150-200ms | 🟠 |
| Medium | 100-150ms | 🟡 |
| Low | < 100ms | 🟢 |

---

## Long Animation Frames Script Attribution

Analyzes and visualizes which scripts are responsible for blocking the main thread. This snippet categorizes blocking time by script origin (your code, framework, third-party, extensions) and provides actionable insights for optimization.

**Script:** `scripts/Long-Animation-Frames-Script-Attribution.js`

---

## Long Animation Frames (LoAF)

Tracks Long Animation Frames to identify JavaScript and rendering work that blocks the main thread. LoAF is the underlying API that powers INP debugging and provides detailed attribution for slow interactions.

**Script:** `scripts/Long-Animation-Frames.js`

---

## Long Tasks

Tracks tasks that block the main thread for more than 50ms. Long tasks prevent the browser from responding to user input, causing poor Interaction to Next Paint (INP) and sluggish user experience.

**Script:** `scripts/LongTask.js`

**Thresholds:**

| Severity | Duration | Impact |
|----------|----------|--------|
| 🟢 Low | 50-100ms | Minor delay |
| 🟡 Medium | 100-150ms | Noticeable lag |
| 🟠 High | 150-250ms | Poor responsiveness |
| 🔴 Critical | > 250ms | Severe blocking |

---

## Scroll Performance Analysis

Measures scroll jank, frame drops, and event listener configuration to identify what makes scrolling feel laggy or unresponsive. Scroll jank — visible stuttering during scroll — is one of the most common UX problems on the web, especially on mobile.

**Script:** `scripts/Scroll-Performance.js`

**Thresholds:**

| Rating | FPS | Frame time | Experience |
|--------|-----|------------|------------|
| 🟢 Good | ≥ 55 fps | ≤ 18ms | Smooth |
| 🟡 Needs improvement | 40–54 fps | 18–25ms | Minor jank |
| 🔴 Poor | < 40 fps | > 25ms | Visible stutter |
