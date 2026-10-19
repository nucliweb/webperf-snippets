## Captured return values

Each object below is a real result captured by running the snippet against the seeded test pages.

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
  "value": 0.0324,
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
  "value": 64,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 200,
    "needsImprovement": 500
  },
  "details": {
    "totalInteractions": 1,
    "worstEvent": "click → button#go",
    "phases": {
      "inputDelay": 1,
      "processingTime": 61,
      "presentationDelay": 3
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
  "count": 3,
  "details": {
    "totalImages": 3,
    "lowEntropyCount": 0,
    "lcpElement": "img",
    "lcpImageEligible": true,
    "lcpImage": {
      "url": "hero.png",
      "bpp": 24.1384,
      "isLowEntropy": false
    }
  },
  "items": [
    {
      "url": "hero.png",
      "width": 100,
      "height": 100,
      "displayedWidth": 600,
      "displayedHeight": 400,
      "fileSizeBytes": 30173,
      "bpp": 24.1384,
      "isLowEntropy": false,
      "lcpEligible": true,
      "isLCP": true
    },
    {
      "url": "hero.png",
      "width": 100,
      "height": 100,
      "displayedWidth": 300,
      "displayedHeight": 200,
      "fileSizeBytes": 30173,
      "bpp": 24.1384,
      "isLowEntropy": false,
      "lcpEligible": true,
      "isLCP": false
    },
    {
      "url": "hero.png",
      "width": 100,
      "height": 100,
      "displayedWidth": 300,
      "displayedHeight": 200,
      "fileSizeBytes": 30173,
      "bpp": 24.1384,
      "isLowEntropy": false,
      "lcpEligible": true,
      "isLCP": false
    }
  ],
  "issues": []
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
  "value": 64,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "element": "#hero",
    "url": "hero.png",
    "subParts": {
      "ttfb": {
        "value": 9,
        "percent": 14,
        "overTarget": false
      },
      "resourceLoadDelay": {
        "value": 13,
        "percent": 20,
        "overTarget": true
      },
      "resourceLoadTime": {
        "value": 8,
        "percent": 13,
        "overTarget": false
      },
      "elementRenderDelay": {
        "value": 34,
        "percent": 53,
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
  "value": 64,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "candidateCount": 1,
    "finalElement": "#hero",
    "candidates": [
      {
        "index": 1,
        "selector": "#hero",
        "time": 64,
        "elementType": "Image",
        "url": "hero.png"
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
  "metric": "LCP",
  "value": 60,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "isVideo": true,
    "lcpSource": "poster",
    "posterUrl": "http://127.0.0.1:56834/hero.png",
    "videoUrl": null,
    "posterFormat": "png",
    "posterPreloaded": false,
    "fetchpriorityOnPreload": null,
    "isCrossOrigin": false,
    "videoAttributes": {
      "autoplay": false,
      "muted": false,
      "playsinline": false,
      "preload": "none"
    }
  },
  "issues": [
    {
      "severity": "warning",
      "message": "No <link rel=\"preload\" as=\"image\"> for the poster: the browser discovers it late"
    },
    {
      "severity": "info",
      "message": "Poster uses png; AVIF or WebP would reduce file size and LCP load time"
    },
    {
      "severity": "warning",
      "message": "preload=\"none\" on a non-autoplay video may delay poster image loading in some browsers"
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
  "value": 68,
  "unit": "ms",
  "rating": "good",
  "thresholds": {
    "good": 2500,
    "needsImprovement": 4000
  },
  "details": {
    "element": "#hero",
    "elementType": "Image",
    "url": "http://127.0.0.1:56834/hero.png",
    "sizePixels": 10000
  }
}
```
