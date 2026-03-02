import cls from '../snippets/CoreWebVitals/CLS.js?raw'
import inp from '../snippets/CoreWebVitals/INP.js?raw'
import lcp from '../snippets/CoreWebVitals/LCP.js?raw'
import lcpImageEntropy from '../snippets/CoreWebVitals/LCP-Image-Entropy.js?raw'
import lcpSubParts from '../snippets/CoreWebVitals/LCP-Sub-Parts.js?raw'
import lcpTrail from '../snippets/CoreWebVitals/LCP-Trail.js?raw'
import lcpVideoCandidate from '../snippets/CoreWebVitals/LCP-Video-Candidate.js?raw'

import ttfb from '../snippets/Loading/TTFB.js?raw'
import jsExecutionTimeBreakdown from '../snippets/Loading/JS-Execution-Time-Breakdown.js?raw'
import fcp from '../snippets/Loading/FCP.js?raw'
import backForwardCache from '../snippets/Loading/Back-Forward-Cache.js?raw'
import cssMediaQueriesAnalysis from '../snippets/Loading/CSS-Media-Queries-Analysis.js?raw'
import criticalCSSDetection from '../snippets/Loading/Critical-CSS-Detection.js?raw'
import ssrHydrationDataAnalysis from '../snippets/Loading/SSR-Hydration-Data-Analysis.js?raw'
import validatePreloadAsyncDeferScripts from '../snippets/Loading/Validate-Preload-Async-Defer-Scripts.js?raw'
import resourceHintsValidation from '../snippets/Loading/Resource-Hints-Validation.js?raw'
import prefetchResourceValidation from '../snippets/Loading/Prefetch-Resource-Validation.js?raw'
import priorityHintsAudit from '../snippets/Loading/Priority-Hints-Audit.js?raw'
import serviceWorkerAnalysis from '../snippets/Loading/Service-Worker-Analysis.js?raw'

import interactions from '../snippets/Interaction/Interactions.js?raw'
import inputLatencyBreakdown from '../snippets/Interaction/Input-Latency-Breakdown.js?raw'
import layoutShiftLoadingAndInteraction from '../snippets/Interaction/Layout-Shift-Loading-and-Interaction.js?raw'
import longAnimationFrames from '../snippets/Interaction/Long-Animation-Frames.js?raw'
import longAnimationFramesScriptAttribution from '../snippets/Interaction/Long-Animation-Frames-Script-Attribution.js?raw'
import longAnimationFramesHelpers from '../snippets/Interaction/Long-Animation-Frames-Helpers.js?raw'
import longTask from '../snippets/Interaction/LongTask.js?raw'
import scrollPerformance from '../snippets/Interaction/Scroll-Performance.js?raw'

import imageElementAudit from '../snippets/Media/Image-Element-Audit.js?raw'
import videoElementAudit from '../snippets/Media/Video-Element-Audit.js?raw'
import svgEmbeddedBitmapAnalysis from '../snippets/Media/SVG-Embedded-Bitmap-Analysis.js?raw'

import networkBandwidthConnectionQuality from '../snippets/Resources/Network-Bandwidth-Connection-Quality.js?raw'

export const snippets = [
  {
    id: 'CLS',
    category: 'CoreWebVitals',
    title: 'Cumulative Layout Shift (CLS)',
    description: 'Measures visual stability by tracking unexpected layout shifts during page load',
    url: '/CoreWebVitals/CLS',
    code: cls,
  },
  {
    id: 'INP',
    category: 'CoreWebVitals',
    title: 'Interaction to Next Paint (INP)',
    description: 'Measures responsiveness by tracking the latency of all user interactions',
    url: '/CoreWebVitals/INP',
    code: inp,
  },
  {
    id: 'LCP',
    category: 'CoreWebVitals',
    title: 'Largest Contentful Paint (LCP)',
    description: 'Measures loading performance by timing when the largest visible content element renders',
    url: '/CoreWebVitals/LCP',
    code: lcp,
  },
  {
    id: 'LCP-Image-Entropy',
    category: 'CoreWebVitals',
    title: 'LCP Image Entropy',
    description: 'Analyzes the visual complexity of LCP images to identify optimization opportunities',
    url: '/CoreWebVitals/LCP-Image-Entropy',
    code: lcpImageEntropy,
  },
  {
    id: 'LCP-Sub-Parts',
    category: 'CoreWebVitals',
    title: 'LCP Sub-Parts',
    description: 'Breaks down LCP into TTFB, load delay, load time, and render delay phases',
    url: '/CoreWebVitals/LCP-Sub-Parts',
    code: lcpSubParts,
  },
  {
    id: 'LCP-Trail',
    category: 'CoreWebVitals',
    title: 'LCP Trail',
    description: 'Traces the chain of LCP candidates over time to identify the final LCP element',
    url: '/CoreWebVitals/LCP-Trail',
    code: lcpTrail,
  },
  {
    id: 'LCP-Video-Candidate',
    category: 'CoreWebVitals',
    title: 'LCP Video Candidate',
    description: 'Detects when a video element is the LCP candidate and analyzes its loading',
    url: '/CoreWebVitals/LCP-Video-Candidate',
    code: lcpVideoCandidate,
  },
  {
    id: 'TTFB',
    category: 'Loading',
    title: 'Time to First Byte (TTFB)',
    description: 'Measures server response time and network latency for the initial HTML document',
    url: '/Loading/TTFB',
    code: ttfb,
  },
  {
    id: 'JS-Execution-Time-Breakdown',
    category: 'Loading',
    title: 'JS Execution Time Breakdown',
    description: 'Profiles JavaScript execution time per script to identify slow-parsing or long-running scripts',
    url: '/Loading/JS-Execution-Time-Breakdown',
    code: jsExecutionTimeBreakdown,
  },
  {
    id: 'FCP',
    category: 'Loading',
    title: 'First Contentful Paint (FCP)',
    description: 'Measures when the browser renders the first piece of content from the DOM',
    url: '/Loading/FCP',
    code: fcp,
  },
  {
    id: 'Back-Forward-Cache',
    category: 'Loading',
    title: 'Back/Forward Cache (bfcache)',
    description: 'Checks bfcache eligibility and identifies reasons that prevent pages from being cached',
    url: '/Loading/Back-Forward-Cache',
    code: backForwardCache,
  },
  {
    id: 'CSS-Media-Queries-Analysis',
    category: 'Loading',
    title: 'CSS Media Queries Analysis',
    description: 'Audits CSS stylesheets for media query usage and render-blocking impact',
    url: '/Loading/CSS-Media-Queries-Analysis',
    code: cssMediaQueriesAnalysis,
  },
  {
    id: 'Critical-CSS-Detection',
    category: 'Loading',
    title: 'Critical CSS Detection',
    description: 'Identifies above-the-fold CSS rules to help inline critical styles and defer the rest',
    url: '/Loading/Critical-CSS-Detection',
    code: criticalCSSDetection,
  },
  {
    id: 'SSR-Hydration-Data-Analysis',
    category: 'Loading',
    title: 'SSR Framework Hydration Data Analysis',
    description: 'Analyzes server-side rendering hydration payloads (Next.js __NEXT_DATA__, etc.) for size and content',
    url: '/Loading/SSR-Hydration-Data-Analysis',
    code: ssrHydrationDataAnalysis,
  },
  {
    id: 'Validate-Preload-Async-Defer-Scripts',
    category: 'Loading',
    title: 'Validate Preload on Async/Defer Scripts',
    description: 'Detects anti-patterns where scripts use both preload and async/defer, causing redundant requests',
    url: '/Loading/Validate-Preload-Async-Defer-Scripts',
    code: validatePreloadAsyncDeferScripts,
  },
  {
    id: 'Resource-Hints-Validation',
    category: 'Loading',
    title: 'Resource Hints Validation',
    description: 'Audits dns-prefetch, preconnect, prefetch, and preload hints for correctness and effectiveness',
    url: '/Loading/Resource-Hints-Validation',
    code: resourceHintsValidation,
  },
  {
    id: 'Prefetch-Resource-Validation',
    category: 'Loading',
    title: 'Prefetch Resource Validation',
    description: 'Verifies that prefetched resources are actually used and identifies unused prefetches',
    url: '/Loading/Prefetch-Resource-Validation',
    code: prefetchResourceValidation,
  },
  {
    id: 'Priority-Hints-Audit',
    category: 'Loading',
    title: 'Priority Hints Audit',
    description: 'Checks fetchpriority attributes on resources to ensure critical assets load first',
    url: '/Loading/Priority-Hints-Audit',
    code: priorityHintsAudit,
  },
  {
    id: 'Service-Worker-Analysis',
    category: 'Loading',
    title: 'Service Worker Analysis',
    description: 'Inspects registered service workers, their scope, state, and caching strategies',
    url: '/Loading/Service-Worker-Analysis',
    code: serviceWorkerAnalysis,
  },
  {
    id: 'Interactions',
    category: 'Interaction',
    title: 'Interactions',
    description: 'Tracks all user interactions (clicks, key presses, pointer events) with their durations',
    url: '/Interaction/Interactions',
    code: interactions,
  },
  {
    id: 'Input-Latency-Breakdown',
    category: 'Interaction',
    title: 'Input Latency Breakdown',
    description: 'Decomposes input delay into processing time and presentation delay for INP debugging',
    url: '/Interaction/Input-Latency-Breakdown',
    code: inputLatencyBreakdown,
  },
  {
    id: 'Layout-Shift-Loading-and-Interaction',
    category: 'Interaction',
    title: 'Layout Shift Loading and Interaction',
    description: 'Separates CLS into shifts caused by page loading versus user interactions',
    url: '/Interaction/Layout-Shift-Loading-and-Interaction',
    code: layoutShiftLoadingAndInteraction,
  },
  {
    id: 'Long-Animation-Frames',
    category: 'Interaction',
    title: 'Long Animation Frames',
    description: 'Identifies frames that take longer than 50ms to render, causing jank and poor responsiveness',
    url: '/Interaction/Long-Animation-Frames',
    code: longAnimationFrames,
  },
  {
    id: 'Long-Animation-Frames-Script-Attribution',
    category: 'Interaction',
    title: 'Long Animation Frames Script Attribution',
    description: 'Attributes long animation frames to specific scripts to identify the root cause of jank',
    url: '/Interaction/Long-Animation-Frames-Script-Attribution',
    code: longAnimationFramesScriptAttribution,
  },
  {
    id: 'Long-Animation-Frames-Helpers',
    category: 'Interaction',
    title: 'Long Animation Frames Helpers',
    description: 'Utility functions for filtering and analyzing long animation frame data',
    url: '/Interaction/Long-Animation-Frames-Helpers',
    code: longAnimationFramesHelpers,
  },
  {
    id: 'LongTask',
    category: 'Interaction',
    title: 'Long Task',
    description: 'Detects JavaScript tasks that block the main thread for more than 50ms',
    url: '/Interaction/LongTask',
    code: longTask,
  },
  {
    id: 'Scroll-Performance',
    category: 'Interaction',
    title: 'Scroll Performance',
    description: 'Measures scroll jank and frame rate during scrolling to diagnose smooth scrolling issues',
    url: '/Interaction/Scroll-Performance',
    code: scrollPerformance,
  },
  {
    id: 'Image-Element-Audit',
    category: 'Media',
    title: 'Image Element Audit',
    description: 'Audits all images for format, dimensions, lazy loading, fetchpriority, and sizing issues',
    url: '/Media/Image-Element-Audit',
    code: imageElementAudit,
  },
  {
    id: 'Video-Element-Audit',
    category: 'Media',
    title: 'Video Element Audit',
    description: 'Inspects video elements for autoplay, preload strategy, poster images, and performance impact',
    url: '/Media/Video-Element-Audit',
    code: videoElementAudit,
  },
  {
    id: 'SVG-Embedded-Bitmap-Analysis',
    category: 'Media',
    title: 'SVG Embedded Bitmap Analysis',
    description: 'Detects SVGs that embed raster images (base64 or URL), defeating SVG size benefits',
    url: '/Media/SVG-Embedded-Bitmap-Analysis',
    code: svgEmbeddedBitmapAnalysis,
  },
  {
    id: 'Network-Bandwidth-Connection-Quality',
    category: 'Resources',
    title: 'Network Bandwidth & Connection Quality',
    description: 'Reads Network Information API to detect connection type, bandwidth, RTT, and save-data mode',
    url: '/Resources/Network-Bandwidth-Connection-Quality',
    code: networkBandwidthConnectionQuality,
  },
]
