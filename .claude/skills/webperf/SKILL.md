---
name: webperf
description: Web performance measurement and debugging toolkit. Use when the user asks about web performance, wants to audit a page, or says "analyze performance", "debug lcp", "check ttfb", "measure core web vitals", "audit images", or similar.
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 2.4.1
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf Snippets Toolkit

A collection of 56 JavaScript snippets for measuring and debugging web performance in Chrome DevTools. Each snippet runs in the page and returns a structured result object.

## Quick Reference

| Skill | Snippets | Trigger phrases |
|-------|----------|-----------------|
| webperf-core-web-vitals | 7 | "debug LCP", "slow LCP", "CLS", "layout shifts", "INP", "interaction latency", "responsiveness" |
| webperf-loading | 34 | "TTFB", "slow server", "FCP", "render blocking", "font loading", "script loading", "resource hints", "service worker" |
| webperf-interaction | 10 | "jank", "scroll performance", "long tasks", "animation frames", "INP debug" |
| webperf-media | 4 | "image audit", "lazy loading", "image optimization", "video audit" |
| webperf-resources | 1 | "network quality", "bandwidth", "connection type", "save-data" |

## Workflow

1. Identify the relevant skill based on the user's question (see Quick Reference above)
2. Load the skill's SKILL.md to see available snippets and thresholds
3. Execute with Chrome DevTools MCP:
   - `mcp__chrome-devtools__navigate_page` → navigate to target URL
   - `mcp__chrome-devtools__evaluate_script` → run the snippet and read the returned object, which is the result (the scripts have no console output)
   - `status: "tracking"` → call the function named in `getDataFn` with another `mcp__chrome-devtools__evaluate_script` call after the interactions
   - Without Chrome DevTools MCP, run the snippet with the CLI: `npx webperf-snippets <url> --snippet <Name> --json`
4. Interpret results using the thresholds defined in the skill
5. Provide actionable recommendations based on findings
