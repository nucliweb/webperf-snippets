---
name: webperf-interaction
description: Measure interaction and animation performance (Long Animation Frames, Long Tasks, scroll jank, layout shifts). Use when the user asks about interaction latency, jank, animation frames, long tasks, or scroll performance. Compatible with Chrome DevTools MCP.
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

---

## Input Latency Breakdown

Aggregates interaction latency by event type to reveal which phase causes slowness across all interactions with the page. While Interactions shows a per-interaction breakdown in real time, this snippet collects data over time and answers a different question: is click systematically slower than keypress? Is the bottleneck always input delay, or does it vary by event?

**Script:** `scripts/Input-Latency-Breakdown.js`

**Further Reading:**

- [Interaction to Next Paint (INP)](https://web.dev/articles/inp) | web.dev
- [Optimize INP](https://web.dev/articles/optimize-inp) | web.dev
- [Find slow interactions in the field](https://web.dev/articles/find-slow-interactions-in-the-field) | web.dev
- [scheduler.yield()](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield) | MDN

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

**Further Reading:**

- [Interaction to Next Paint (INP)](https://web.dev/articles/inp) | web.dev
- [Optimize INP](https://web.dev/articles/optimize-inp) | web.dev
- [Find slow interactions](https://web.dev/articles/find-slow-interactions-in-the-field) | web.dev
- [Web Vitals Extension](https://chrome.google.com/webstore/detail/web-vitals/ahfhijdlegdabablpippeagghigmibma) | Chrome Web Store

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

**Further Reading:**

- [Cumulative Layout Shift (CLS)](https://web.dev/articles/cls) | web.dev
- [Optimize CLS](https://web.dev/articles/optimize-cls) | web.dev
- [Debug layout shifts](https://web.dev/articles/debug-layout-shifts) | web.dev
- [Layout Instability API](https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift) | MDN

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

**Further Reading:**

- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) | Chrome Developers
- [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) | web.dev
- [Real User Monitoring](https://web.dev/articles/vitals-measurement-getting-started) | web.dev

---

## Long Animation Frames Script Attribution

Analyzes and visualizes which scripts are responsible for blocking the main thread. This snippet categorizes blocking time by script origin (your code, framework, third-party, extensions) and provides actionable insights for optimization.

**Script:** `scripts/Long-Animation-Frames-Script-Attribution.js`

**Further Reading:**

- [Long Animation Frames API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming) | MDN
- [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) | web.dev
- [Script evaluation and long tasks](https://web.dev/articles/script-evaluation-and-long-tasks) | web.dev
- Long Animation Frames Helpers | This site
- [Third-party JavaScript](https://web.dev/articles/third-party-javascript) | web.dev

---

## Long Animation Frames (LoAF)

Tracks Long Animation Frames to identify JavaScript and rendering work that blocks the main thread. LoAF is the underlying API that powers INP debugging and provides detailed attribution for slow interactions.

**Script:** `scripts/Long-Animation-Frames.js`

**Further Reading:**

- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) | Chrome Developers
- [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) | web.dev
- [Avoid large, complex layouts](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) | web.dev
- [LoAF explainer](https://github.com/nicnacs/nicnacs) | GitHub

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

**Further Reading:**

- [Long Tasks API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming) | MDN
- [Are long tasks the main thread is doing?](https://web.dev/articles/optimize-long-tasks) | web.dev
- [Total Blocking Time (TBT)](https://web.dev/articles/tbt) | web.dev

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

**Further Reading:**

- [Passive event listeners](https://developer.chrome.com/docs/lighthouse/best-practices/uses-passive-event-listeners) | Chrome Lighthouse
- [content-visibility: the new CSS property that boosts your rendering performance](https://web.dev/articles/content-visibility) | web.dev
- [Avoid large, complex layouts](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) | web.dev
- [will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) | MDN
