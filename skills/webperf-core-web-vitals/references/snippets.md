## Captured return values

Each object below is a real result captured by running the snippet against `cli/tests/fixtures/core-web-vitals.html` with the recorded interaction steps for INP.

---
## Cumulative layout shift (CLS)

Quick check for Cumulative Layout Shift, a Core Web Vital that measures visual stability. CLS tracks how much the page layout shifts unexpectedly during its lifetime, providing a single score that represents the largest burst of unexpected layout shifts.

**Script:** `scripts/CLS.js`

**Thresholds:**

| Rating | Score | Meaning |
|--------|-------|---------|
| 🟢 Good | ≤ 0.1 | Stable, minimal shifting |
| 🟡 Needs Improvement | ≤ 0.25 | Noticeable shifting |
| 🔴 Poor | > 0.25 | Significant layout instability |

**Captured return value:**

```json
{
  "script": "CLS",
  "status": "ok",
  "metric": "CLS",
  "value": 0,
  "unit": "score",
  "rating": "good",
  "thresholds": {
    "good": 0.1,
    "needsImprovement": 0.25
  },
  "message": "CLS tracking active. Call getCLS() for updated value after page interactions.",
  "getDataFn": "getCLS"
}
```
---
## Interaction to next paint (INP)

Tracks Interaction to Next Paint, a Core Web Vital that measures responsiveness. INP evaluates how quickly a page responds to user interactions throughout the entire page visit, replacing First Input Delay (FID) as a Core Web Vital in March 2024.

**Script:** `scripts/INP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 200ms | Responsive, feels instant |
| 🟡 Needs Improvement | ≤ 500ms | Noticeable delay |
| 🔴 Poor | > 500ms | Slow, frustrating experience |

**Captured return value:**

```json
{
  "script": "INP",
  "status": "ok",
  "metric": "INP",
  "value": 16,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 200,
    "needsImprovement": 500
  },
  "details": {
    "totalInteractions": 1,
    "worstEvent": "click → button#interaction-button",
    "phases": {
      "inputDelay": 0,
      "processingTime": 1,
      "presentationDelay": 15
    }
  }
}
```
---
## LCP image entropy

Checks if images qualify as LCP candidates based on their entropy (bits per pixel). Since Chrome 112, low-entropy images are ignored for LCP measurement.

**Script:** `scripts/LCP-Image-Entropy.js`

**Thresholds:**

| BPP | Entropy | LCP Eligible | Example |
|-----|---------|--------------|---------|
| < 0.05 | 🔴 Low | ❌ No | Solid colors, simple gradients, placeholders |
| ≥ 0.05 | 🟢 Normal | ✅ Yes | Photos, complex graphics |

**Captured return value:**

```json
{
  "script": "LCP-Image-Entropy",
  "status": "ok",
  "count": 1,
  "details": {
    "totalImages": 1,
    "lowEntropyCount": 0,
    "lcpElement": "h1",
    "lcpImageEligible": null,
    "lcpImage": null
  },
  "items": [
    {
      "url": "hero.png",
      "width": 100,
      "height": 100,
      "displayedWidth": 320,
      "displayedHeight": 320,
      "fileSizeBytes": 30173,
      "bpp": 24.1384,
      "isLowEntropy": false,
      "lcpEligible": true,
      "isLCP": false
    }
  ],
  "issues": [
    {
      "severity": "info",
      "message": "The LCP element is <h1>, text and not an image, so its entropy does not apply. Run the LCP snippet to measure it."
    }
  ]
}
```
---
## LCP subparts

Breaks down Largest Contentful Paint into its four phases to identify optimization opportunities. Understanding which phase is slowest helps you focus your optimization efforts where they'll have the most impact. Based on the Web Vitals Chrome Extension.

**Script:** `scripts/LCP-Subparts.js`

**Captured return value:**

```json
{
  "script": "LCP-Subparts",
  "status": "ok",
  "metric": "LCP",
  "value": 72,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "element": "#main-heading",
    "url": null,
    "subParts": {
      "ttfb": {
        "value": 7,
        "percent": 10,
        "overTarget": false
      },
      "resourceLoadDelay": {
        "value": 0,
        "percent": 0,
        "overTarget": false
      },
      "resourceLoadTime": {
        "value": 0,
        "percent": 0,
        "overTarget": false
      },
      "elementRenderDelay": {
        "value": 65,
        "percent": 90,
        "overTarget": true
      }
    },
    "slowestPhase": "elementRenderDelay"
  }
}
```
---
## LCP trail

Tracks every LCP candidate element during page load and highlights each one with a distinct pastel-colored dashed outline, so you can see the full trail from first candidate to final LCP.

**Script:** `scripts/LCP-Trail.js`

**Captured return value:**

```json
{
  "script": "LCP-Trail",
  "status": "ok",
  "metric": "LCP",
  "value": 72,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "candidateCount": 1,
    "finalElement": "#main-heading",
    "candidates": [
      {
        "index": 1,
        "selector": "#main-heading",
        "time": 72,
        "elementType": "Text block"
      }
    ]
  }
}
```
---
## LCP video candidate

Detects whether the LCP element is a <video> and audits the poster image configuration, the most common source of avoidable LCP delay when video is the hero element.

**Script:** `scripts/LCP-Video-Candidate.js`

**Captured return value:**

```json
{
  "script": "LCP-Video-Candidate",
  "status": "ok",
  "details": {
    "isVideo": false,
    "lcpElement": "h1",
    "lcpUrl": null
  },
  "issues": [
    {
      "severity": "info",
      "message": "The LCP element is <h1>, not a <video>. Run the LCP snippet to measure it, and LCP Subparts to see its phases."
    }
  ]
}
```
---
## Largest contentful paint (LCP)

Quick check for Largest Contentful Paint, a Core Web Vital that measures loading performance. LCP marks when the largest content element becomes visible in the viewport.

**Script:** `scripts/LCP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 2.5s | Fast, content appears quickly |
| 🟡 Needs Improvement | ≤ 4s | Moderate delay |
| 🔴 Poor | > 4s | Slow, users may abandon |

**Captured return value:**

```json
{
  "script": "LCP",
  "status": "ok",
  "metric": "LCP",
  "value": 72,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "element": "#main-heading",
    "elementType": "Text block",
    "url": null,
    "sizePixels": 24624
  }
}
```
