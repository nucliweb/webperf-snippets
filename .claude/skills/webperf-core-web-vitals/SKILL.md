---
name: webperf-core-web-vitals
description: Measure and debug Core Web Vitals (LCP, CLS, INP). Use when the user asks about LCP, CLS, INP, page loading performance, or wants to analyze Core Web Vitals on a URL or current page. Compatible with Chrome DevTools MCP.
---

# WebPerf: Core Web Vitals

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Available Snippets

| Snippet | Description | File |
|---------|-------------|------|
| Cumulative Layout Shift (CLS) | Quick check for Cumulative Layout Shift, a Core Web Vital that measures visual stability | scripts/CLS.js |
| Interaction to Next Paint (INP) | Tracks Interaction to Next Paint, a Core Web Vital that measures responsiveness | scripts/INP.js |
| LCP Image Entropy | Checks if images qualify as LCP candidates based on their entropy (bits per pixel) | scripts/LCP-Image-Entropy.js |
| LCP Sub-Parts | Breaks down Largest Contentful Paint into its four phases to identify optimization opportunities | scripts/LCP-Sub-Parts.js |
| LCP Trail | Tracks every LCP candidate element during page load and highlights each one with a distinct pastel-c | scripts/LCP-Trail.js |
| LCP Video Candidate | Detects whether the LCP element is a <video> and audits the poster image configuration — the most co | scripts/LCP-Video-Candidate.js |
| Largest Contentful Paint (LCP) | Quick check for Largest Contentful Paint, a Core Web Vital that measures loading performance | scripts/LCP.js |

## Execution with Chrome DevTools MCP

```
1. mcp__chrome-devtools__navigate_page  → navigate to target URL
2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)
3. mcp__chrome-devtools__get_console_message → capture console output
4. Interpret results using thresholds below, provide recommendations
```

---

## Cumulative Layout Shift (CLS)

Quick check for Cumulative Layout Shift, a Core Web Vital that measures visual stability. CLS tracks how much the page layout shifts unexpectedly during its lifetime, providing a single score that represents the cumulative impact of all unexpected layout shifts.

**Script:** `scripts/CLS.js`

**Thresholds:**

| Rating | Score | Meaning |
|--------|-------|---------|
| 🟢 Good | ≤ 0.1 | Stable, minimal shifting |
| 🟡 Needs Improvement | ≤ 0.25 | Noticeable shifting |
| 🔴 Poor | > 0.25 | Significant layout instability |

---

## Interaction to Next Paint (INP)

Tracks Interaction to Next Paint, a Core Web Vital that measures responsiveness. INP evaluates how quickly a page responds to user interactions throughout the entire page visit, replacing First Input Delay (FID) as a Core Web Vital in March 2024.

**Script:** `scripts/INP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 200ms | Responsive, feels instant |
| 🟡 Needs Improvement | ≤ 500ms | Noticeable delay |
| 🔴 Poor | > 500ms | Slow, frustrating experience |

---

## LCP Image Entropy

Checks if images qualify as LCP candidates based on their entropy (bits per pixel). Since Chrome 112, low-entropy images are ignored for LCP measurement.

**Script:** `scripts/LCP-Image-Entropy.js`

**Thresholds:**

| BPP | Entropy | LCP Eligible | Example |
|-----|---------|--------------|---------|
| < 0.05 | 🔴 Low | ❌ No | Solid colors, simple gradients, placeholders |
| ≥ 0.05 | 🟢 Normal | ✅ Yes | Photos, complex graphics |

---

## LCP Sub-Parts

Breaks down Largest Contentful Paint into its four phases to identify optimization opportunities. Understanding which phase is slowest helps you focus your optimization efforts where they'll have the most impact. Based on the Web Vitals Chrome Extension.

**Script:** `scripts/LCP-Sub-Parts.js`

---

## LCP Trail

Tracks every LCP candidate element during page load and highlights each one with a distinct pastel-colored dashed outline — so you can see the full trail from first candidate to final LCP.

**Script:** `scripts/LCP-Trail.js`

---

## LCP Video Candidate

Detects whether the LCP element is a <video> and audits the poster image configuration — the most common source of avoidable LCP delay when video is the hero element.

**Script:** `scripts/LCP-Video-Candidate.js`

---

## Largest Contentful Paint (LCP)

Quick check for Largest Contentful Paint, a Core Web Vital that measures loading performance. LCP marks when the largest content element becomes visible in the viewport.

**Script:** `scripts/LCP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 2.5s | Fast, content appears quickly |
| 🟡 Needs Improvement | ≤ 4s | Moderate delay |
| 🔴 Poor | > 4s | Slow, users may abandon |
