---
name: webperf
description: Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.
---

# WebPerf Snippets Toolkit

A collection of 47 JavaScript snippets for measuring and debugging web performance in Chrome DevTools. Each snippet runs in the browser console and outputs structured, color-coded results.

## Skills by Category

| Skill | Snippets | Use when |
|-------|----------|----------|
| webperf-core-web-vitals | 7 | Intelligent Core Web Vitals analysis with automated workflows and decision trees |
| webperf-loading | 28 | Intelligent loading performance analysis with automated workflows for TTFB investigation (DNS/connection/server breakdown), render-blocking detection, script performance deep dive (first vs third-party attribution), font optimization, and resource hints validation |
| webperf-interaction | 8 | Intelligent interaction performance analysis with automated workflows for INP debugging, scroll jank investigation, and main thread blocking |
| webperf-media | 3 | Intelligent media optimization with automated workflows for images, videos, and SVGs |
| webperf-resources | 1 | Intelligent network quality analysis with adaptive loading strategies |

## Quick Reference

| User says | Skill to use |
|-----------|--------------|
| "debug LCP", "slow LCP", "largest contentful paint" | webperf-core-web-vitals |
| "check CLS", "layout shifts", "visual stability" | webperf-core-web-vitals |
| "INP", "interaction latency", "responsiveness" | webperf-core-web-vitals |
| "TTFB", "slow server", "time to first byte" | webperf-loading |
| "FCP", "first contentful paint", "render blocking" | webperf-loading |
| "font loading", "script loading", "resource hints", "service worker" | webperf-loading |
| "jank", "scroll performance", "long tasks", "animation frames", "INP debug" | webperf-interaction |
| "image audit", "lazy loading", "image optimization", "video audit" | webperf-media |
| "network quality", "bandwidth", "connection type", "save-data" | webperf-resources |

## Workflow

1. Identify the relevant skill based on the user's question (use Quick Reference above)
2. Load the skill's skill.md to see available snippets and thresholds
3. Execute with Chrome DevTools MCP:
   - `mcp__chrome-devtools__navigate_page` → navigate to target URL
   - `mcp__chrome-devtools__evaluate_script` → run the snippet
   - `mcp__chrome-devtools__get_console_message` → read results
4. Interpret results using the thresholds defined in the skill
5. Provide actionable recommendations based on findings
