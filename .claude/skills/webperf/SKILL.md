---
name: webperf
description: Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.
context: fork
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 1.1.0
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf Snippets Toolkit

A collection of 47 JavaScript snippets for measuring and debugging web performance in Chrome DevTools. Each snippet runs in the browser console and outputs structured, color-coded results.

## Quick Reference

| Skill | Snippets | Trigger phrases |
|-------|----------|-----------------|
| webperf-core-web-vitals | 7 | "debug LCP", "slow LCP", "CLS", "layout shifts", "INP", "interaction latency", "responsiveness" |
| webperf-loading | 28 | "TTFB", "slow server", "FCP", "render blocking", "font loading", "script loading", "resource hints", "service worker" |
| webperf-interaction | 8 | "jank", "scroll performance", "long tasks", "animation frames", "INP debug" |
| webperf-media | 3 | "image audit", "lazy loading", "image optimization", "video audit" |
| webperf-resources | 1 | "network quality", "bandwidth", "connection type", "save-data" |

## Workflow

1. Identify the relevant skill based on the user's question (see Quick Reference above)
2. Load the skill's skill.md to see available snippets and thresholds
3. Execute with Chrome DevTools MCP:
   - `mcp__chrome-devtools__navigate_page` → navigate to target URL
   - `mcp__chrome-devtools__evaluate_script` → run the snippet
   - `mcp__chrome-devtools__get_console_message` → read results
4. Interpret results using the thresholds defined in the skill
5. Provide actionable recommendations based on findings
