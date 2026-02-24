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

**Further Reading:**

- [Learn Images](https://web.dev/learn/images) | web.dev
- [Optimizing Largest Contentful Paint](https://web.dev/articles/optimize-lcp) | web.dev
- [Fetch Priority API](https://web.dev/articles/fetch-priority) | web.dev
- [Preload critical assets](https://web.dev/articles/preload-critical-assets) | web.dev
- [Browser-level lazy loading](https://web.dev/articles/browser-level-image-lazy-loading) | web.dev
- [Prevent layout shifts with image dimensions](https://web.dev/articles/optimize-cls#images-without-dimensions) | web.dev
- [`loading` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#loading) | MDN
- [`decoding` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#decoding) | MDN
- [`fetchpriority` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#fetchpriority) | MDN
- [JPEG XL supported software](https://jpegxl.info/resources/supported-software.html) | jpegxl.info
- [Best practices for images — nucliweb/image-element](https://github.com/nucliweb/image-element) | GitHub

---

## SVG Embedded Bitmap Analysis

Scans all SVG resources on the page — both external files and inline <svg> elements — and flags any that contain embedded bitmap images, reporting name, transfer size, compression encoding, and embedded bitmap details.

**Script:** `scripts/SVG-Embedded-Bitmap-Analysis.js`

**Further Reading:**

- [SVG `<image>` element](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/image) | MDN
- [SVG `<use>` element](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/use) | MDN
- [Data URLs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs) | MDN
- [SVGOMG](https://jakearchibald.github.io/svgomg/) | jakearchibald.github.io
- [SVGO](https://github.com/svg/svgo) | GitHub
- Image Element Audit | webperf-snippets

---

## Video Element Audit

Audits all <video> elements on the page against video performance best practices — covering preload strategy, autoplay configuration, format modernisation, CLS prevention, and playback accessibility.

**Script:** `scripts/Video-Element-Audit.js`

**Further Reading:**

- [Video performance](https://web.dev/learn/performance/video-performance) | web.dev
- [Optimizing Largest Contentful Paint](https://web.dev/articles/optimize-lcp) | web.dev
- [The `preload` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video#preload) | MDN
- [Autoplay guide for media and Web Audio APIs](https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide) | MDN
- [AV1 codec](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Video_codecs#av1) | MDN
- [Video and source elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video) | MDN
