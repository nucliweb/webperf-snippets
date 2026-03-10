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
