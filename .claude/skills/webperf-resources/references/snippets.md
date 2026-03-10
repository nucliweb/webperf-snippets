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
