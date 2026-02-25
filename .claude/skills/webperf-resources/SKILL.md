---
name: webperf-resources
description: Analyze network and resource performance (bandwidth, connection quality, effective connection type). Use when the user asks about network performance, bandwidth, connection quality, or adaptive loading. Compatible with Chrome DevTools MCP.
---

# WebPerf: Resources & Network

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Available Snippets

| Snippet | Description | File |
|---------|-------------|------|
| Network Bandwidth & Connection Quality | Network quality directly affects web performance | scripts/Network-Bandwidth-Connection-Quality.js |

## Execution with Chrome DevTools MCP

```
1. mcp__chrome-devtools__navigate_page  → navigate to target URL
2. mcp__chrome-devtools__evaluate_script → run snippet code (read from scripts/ file)
3. mcp__chrome-devtools__get_console_message → capture console output
4. Interpret results using thresholds below, provide recommendations
```

---

## Network Bandwidth & Connection Quality

Network quality directly affects web performance. Segmenting metrics by connection type helps identify whether performance issues are infrastructure-related or affect only users on slower connections.

**Script:** `scripts/Network-Bandwidth-Connection-Quality.js`

**Thresholds:**

| Effective Type | Max RTT | Min Downlink |
|---------------|---------|-------------|
| `slow-2g` | 2000ms | 50 kbps |
| `2g` | 1400ms | 70 kbps |
| `3g` | 270ms | 700 kbps |
| `4g` | < 270ms | > 700 kbps |
