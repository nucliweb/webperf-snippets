---
name: webperf-media
description: Audit images, videos, and SVGs for performance issues. Use when the user asks about image optimization, video performance, lazy loading, image formats, or SVG analysis. Compatible with Chrome DevTools MCP.
---

# WebPerf: Media Performance

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Available Snippets

| Snippet | Description | File |
|---------|-------------|------|
| Image Element Audit | Audits all <img> elements on the page against image performance best practices — covering loading st | scripts/Image-Element-Audit.js |
| SVG Embedded Bitmap Analysis | Scans all SVG resources on the page — both external files and inline <svg> elements — and flags any  | scripts/SVG-Embedded-Bitmap-Analysis.js |
| Video Element Audit | Audits all <video> elements on the page against video performance best practices — covering preload  | scripts/Video-Element-Audit.js |

## Execution with Chrome DevTools MCP

```
1. mcp__chrome-devtools__navigate_page  → navigate to target URL
2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)
3. mcp__chrome-devtools__get_console_message → capture console output
4. Interpret results using thresholds below, provide recommendations
```

---

## Image Element Audit

Audits all <img> elements on the page against image performance best practices — covering loading strategy, fetch priority, format modernisation, responsive markup, and CLS prevention.

**Script:** `scripts/Image-Element-Audit.js`

---

## SVG Embedded Bitmap Analysis

Scans all SVG resources on the page — both external files and inline <svg> elements — and flags any that contain embedded bitmap images, reporting name, transfer size, compression encoding, and embedded bitmap details.

**Script:** `scripts/SVG-Embedded-Bitmap-Analysis.js`

---

## Video Element Audit

Audits all <video> elements on the page against video performance best practices — covering preload strategy, autoplay configuration, format modernisation, CLS prevention, and playback accessibility.

**Script:** `scripts/Video-Element-Audit.js`
