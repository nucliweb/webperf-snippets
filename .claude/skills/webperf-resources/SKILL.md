---
name: webperf-resources
description: Intelligent network quality analysis with adaptive loading strategies. Detects connection type (2g/3g/4g), bandwidth, RTT, and save-data mode, then automatically triggers appropriate optimization workflows. Includes decision trees that recommend image compression for slow connections, critical CSS inlining for high RTT, and save-data optimizations (disable autoplay, reduce quality). Features connection-aware performance budgets (500KB for 2g, 1.5MB for 3g, 3MB for 4g+) and adaptive loading implementation guides. Cross-skill integration with Loading (TTFB impact), Media (responsive images), and Core Web Vitals (connection impact on LCP/INP). Use when the user asks about slow connections, mobile optimization, save-data support, or adaptive loading strategies. Compatible with Chrome DevTools MCP.
context: fork
license: MIT
metadata:
  author: Joan Leon | @nucliweb
  version: 1.1.0
  mcp-server: chrome-devtools
  category: web-performance
  repository: https://github.com/nucliweb/webperf-snippets
---

# WebPerf: Resources & Network

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `mcp__chrome-devtools__evaluate_script`, capture output with `mcp__chrome-devtools__get_console_message`.

## Scripts

- `scripts/Network-Bandwidth-Connection-Quality.js` — Network Bandwidth & Connection Quality

Descriptions and thresholds: `references/snippets.md`

## Common Workflows

### Network Quality Assessment

When the user asks about network performance, connection quality, or adaptive loading:

1. **Network-Bandwidth-Connection-Quality.js** - Analyze network bandwidth, effective connection type, RTT, downlink, save-data mode

### Adaptive Loading Strategy

When implementing adaptive loading or the user asks "how to optimize for slow connections":

1. **Network-Bandwidth-Connection-Quality.js** - Detect connection quality
2. Cross-reference with **webperf-loading** skill:
   - TTFB.js (measure server response on slow connections)
   - Find-render-blocking-resources.js (identify heavy resources to defer)
   - Resource-Hints-Validation.js (optimize preconnect for slow networks)
3. Cross-reference with **webperf-media** skill:
   - Image-Element-Audit.js (implement responsive images based on connection)
   - Video-Element-Audit.js (adjust video quality based on connection)

### Save-Data Mode Detection

When the user asks about save-data or data-saving features:

1. **Network-Bandwidth-Connection-Quality.js** - Check if save-data is enabled
2. If save-data is enabled, recommend:
   - Reducing image quality
   - Disabling autoplay videos
   - Deferring non-critical resources
   - Using low-res thumbnails

### Mobile/Slow Connection Optimization

When the user asks "optimize for mobile" or "slow connection users":

1. **Network-Bandwidth-Connection-Quality.js** - Assess connection type
2. Cross-reference with **webperf-loading** skill:
   - TTFB.js (critical for slow connections)
   - Find-render-blocking-resources.js (minimize blocking on slow networks)
   - Critical-CSS-Detection.js (inline critical CSS to reduce RTT)
   - Prefetch-Resource-Validation.js (avoid excessive prefetch on slow connections)

## Decision Tree

Use this decision tree to automatically run follow-up snippets based on results:

### After Network-Bandwidth-Connection-Quality.js

- **If effectiveType is "slow-2g" or "2g"** → Very slow connection, recommend:
  1. Run **webperf-loading:Critical-CSS-Detection.js** (inline critical CSS)
  2. Run **webperf-media:Image-Element-Audit.js** (implement aggressive lazy loading)
  3. Run **webperf-loading:Prefetch-Resource-Validation.js** (remove prefetch to save bandwidth)
  4. Recommend minimal resource strategy

- **If effectiveType is "3g"** → Moderate connection, recommend:
  1. Run **webperf-loading:Find-render-blocking-resources.js** (minimize blocking)
  2. Run **webperf-media:Image-Element-Audit.js** (responsive images)
  3. Run **webperf-loading:Resource-Hints-Validation.js** (optimize preconnect)
  4. Implement adaptive image quality

- **If effectiveType is "4g" or better** → Good connection, recommend:
  1. Standard optimization practices
  2. Consider strategic prefetch for navigation
  3. Higher quality media is acceptable

- **If save-data is enabled** → User explicitly wants to save data, recommend:
  1. Reduce image quality aggressively
  2. Disable autoplay videos
  3. Defer non-critical resources
  4. Remove prefetch/preload hints
  5. Show "high quality" toggle option

- **If RTT > 300ms** → High latency, recommend:
  1. Run **webperf-loading:TTFB.js** (latency impacts TTFB)
  2. Run **webperf-loading:Resource-Hints-Validation.js** (preconnect critical for high RTT)
  3. Minimize number of origins
  4. Use HTTP/2 or HTTP/3 for multiplexing

- **If downlink < 1 Mbps** → Very limited bandwidth, recommend:
  1. Run **webperf-media:Image-Element-Audit.js** (aggressive compression)
  2. Run **webperf-media:Video-Element-Audit.js** (disable autoplay)
  3. Run **webperf-loading:Prefetch-Resource-Validation.js** (remove prefetch)
  4. Implement bandwidth-aware loading

- **If downlink > 10 Mbps** → Good bandwidth, consider:
  - Higher quality media
  - Strategic prefetch
  - Preloading next-page resources

### Cross-Skill Triggers

These triggers recommend using snippets from other skills:

#### From Resources to Loading Skill

- **If slow connection detected (2g/3g)** → Use **webperf-loading** skill:
  - TTFB.js (latency is amplified on slow connections)
  - Critical-CSS-Detection.js (reduce RTT by inlining critical CSS)
  - Find-render-blocking-resources.js (minimize blocking resources)
  - Resource-Hints-Validation.js (preconnect is critical for high RTT)
  - Prefetch-Resource-Validation.js (avoid prefetch on slow connections)

- **If high RTT detected (>200ms)** → Use **webperf-loading** skill:
  - TTFB-Sub-Parts.js (break down latency components)
  - Resource-Hints-Validation.js (preconnect to reduce RTT impact)
  - Service-Worker-Analysis.js (caching is critical for high latency)

#### From Resources to Media Skill

- **If slow connection or save-data detected** → Use **webperf-media** skill:
  - Image-Element-Audit.js (implement responsive images, aggressive compression)
  - Video-Element-Audit.js (disable autoplay, reduce quality)

#### From Resources to Core Web Vitals Skill

- **If slow connection detected** → Check Core Web Vitals impact:
  - Use **webperf-core-web-vitals:LCP.js** (LCP is heavily impacted by slow connections)
  - Use **webperf-core-web-vitals:INP.js** (high latency can impact interaction responsiveness)

### Adaptive Loading Implementation Guide

Based on Network Information API results, implement these strategies:

**For slow-2g / 2g (< 50 Kbps):**
```javascript
// Detected by effectiveType: "slow-2g" or "2g"
Strategies:
- Serve low-res images (quality: 30-40)
- Disable autoplay videos
- Remove all prefetch hints
- Inline all critical CSS
- Defer all non-critical JavaScript
- Use system fonts (no webfonts)
- Aggressive lazy loading (load on scroll + buffer)
```

**For 3g (50-700 Kbps):**
```javascript
// Detected by effectiveType: "3g"
Strategies:
- Serve medium-res images (quality: 60-70)
- Disable autoplay videos
- Limited prefetch (critical only)
- Inline critical CSS only
- Defer non-critical JavaScript
- Preload 1-2 critical fonts
- Standard lazy loading
```

**For 4g+ (> 700 Kbps):**
```javascript
// Detected by effectiveType: "4g"
Strategies:
- Serve high-res images (quality: 80-90)
- Allow autoplay videos (muted)
- Strategic prefetch for navigation
- Standard CSS loading
- Standard JavaScript loading
- Preload critical fonts
- Standard lazy loading
```

**For save-data mode:**
```javascript
// Detected by navigator.connection.saveData === true
Strategies:
- Override connection type, treat as worse than actual
- Show "Load high quality" toggle
- Disable autoplay entirely
- Minimal images, minimal quality
- No prefetch, no preload (except critical)
```

### Performance Budget by Connection Type

Adjust performance budgets based on connection quality:

**slow-2g / 2g:**
- Total page weight: < 500KB
- Images: < 200KB total
- JavaScript: < 100KB total
- No videos

**3g:**
- Total page weight: < 1.5MB
- Images: < 800KB total
- JavaScript: < 300KB total
- Videos: < 3MB (only if critical)

**4g+:**
- Total page weight: < 3MB
- Images: < 2MB total
- JavaScript: < 1MB total
- Videos: < 10MB

### Real-World Scenarios

**Scenario: User on 3G reports slow page load**
1. Run Network-Bandwidth-Connection-Quality.js → confirms 3g
2. Run webperf-loading:TTFB.js → high TTFB due to latency
3. Run webperf-loading:Critical-CSS-Detection.js → CSS not inlined
4. Recommendation: Inline critical CSS, implement adaptive loading

**Scenario: User with save-data enabled complains about data usage**
1. Run Network-Bandwidth-Connection-Quality.js → saveData: true
2. Run webperf-media:Image-Element-Audit.js → high-res images served
3. Run webperf-media:Video-Element-Audit.js → autoplay enabled
4. Recommendation: Respect save-data, reduce quality, disable autoplay

**Scenario: International users report slow LCP**
1. Run Network-Bandwidth-Connection-Quality.js → high RTT (300ms+)
2. Run webperf-core-web-vitals:LCP.js → LCP 4s+
3. Run webperf-loading:TTFB-Sub-Parts.js → DNS + connection = 500ms
4. Recommendation: Use CDN, implement preconnect, optimize for latency

**Scenario: Mobile users in rural areas**
1. Run Network-Bandwidth-Connection-Quality.js → 2g, high RTT, low downlink
2. Run webperf-loading:Find-render-blocking-resources.js → many blocking
3. Run webperf-media:Image-Element-Audit.js → all images eager-loaded
4. Recommendation: Aggressive adaptive loading, inline critical CSS, lazy load all images

### Network Information API Limitations

Be aware of API limitations and fallbacks:

**API not available:**
- Safari does not support Network Information API
- Fallback: Use TTFB as proxy for connection quality
- Fallback: Device detection (mobile = assume slow)
- Fallback: User preference toggle

**API values are estimates:**
- effectiveType is based on recent observations
- Values can change during session
- Re-check periodically for long sessions

**Privacy considerations:**
- Some browsers limit precision for privacy
- Values may be rounded or capped
- Consider user privacy when making decisions

### Testing Adaptive Loading

To test adaptive loading implementations:

1. Use Chrome DevTools Network Throttling
2. Run Network-Bandwidth-Connection-Quality.js at each throttling level
3. Verify adaptive strategies activate correctly
4. Measure Core Web Vitals at each connection speed
5. Adjust breakpoints and strategies based on results

**Test matrix:**
- Offline
- slow-2g (50 Kbps, RTT 2000ms)
- 2g (250 Kbps, RTT 300ms)
- 3g (750 Kbps, RTT 100ms)
- 4g (4 Mbps, RTT 20ms)
- save-data enabled at each level

## References

- `references/snippets.md` — Descriptions and thresholds for each script
- `references/schema.md` — Return value schema for interpreting script output

> Execute via `mcp__chrome-devtools__evaluate_script` → read with `mcp__chrome-devtools__get_console_message`.