---
name: webperf
description: Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.
---

# WebPerf Snippets Toolkit

A collection of 46 JavaScript snippets for measuring and debugging web performance in Chrome DevTools. Each snippet runs in the browser console and outputs structured, color-coded results.

## Skills by Category

| Skill | Snippets | Use when |
|-------|----------|----------|
| webperf-core-web-vitals | 7 | Measure and debug Core Web Vitals (LCP, CLS, INP) |
| webperf-loading | 27 | Analyze loading performance (TTFB, FCP, render-blocking resources, scripts, fonts, resource hints, service workers) |
| webperf-interaction | 8 | Measure interaction and animation performance (Long Animation Frames, Long Tasks, scroll jank, layout shifts) |
| webperf-media | 3 | Audit images, videos, and SVGs for performance issues |
| webperf-resources | 1 | Analyze network and resource performance (bandwidth, connection quality, effective connection type) |

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
2. Load the skill's SKILL.md to see available snippets and thresholds
3. Execute with Chrome DevTools MCP:
   - `mcp__chrome-devtools__navigate_page` → navigate to target URL
   - `mcp__chrome-devtools__evaluate_script` → run the snippet
   - `mcp__chrome-devtools__get_console_message` → read results
4. Interpret results using the thresholds defined in the skill
5. Provide actionable recommendations based on findings
