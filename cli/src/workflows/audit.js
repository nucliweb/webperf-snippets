// Structural audit workflow — deterministic checks suitable for CI.
// These snippets return binary pass/fail results with no timing noise.
//
// Every step runs on the same page, one after the other. The steps that make requests of their
// own (an image probe, a fetch to read a Content-Type) go last, because those requests add Resource
// Timing entries that the steps before them would count.
export const auditWorkflow = {
  id: "audit",
  title: "Structural Audit",
  steps: [
    // Tier 1 — Loading determinista
    { id: "render-blocking", path: "Loading/Find-render-blocking-resources" },
    { id: "resource-hints", path: "Loading/Resource-Hints-Validation" },
    { id: "preload-scripts", path: "Loading/Validate-Preload-Async-Defer-Scripts" },
    { id: "priority-hints", path: "Loading/Priority-Hints-Audit" },
    { id: "critical-css", path: "Loading/Critical-CSS-Detection" },
    { id: "ttfb", path: "Loading/TTFB-Sub-Parts" },
    { id: "script-parties", path: "Loading/First-And-Third-Party-Script-Info" },
    { id: "script-loading", path: "Loading/Script-Loading" },
    { id: "compression", path: "Loading/Compression-Audit" },
    { id: "inline-scripts", path: "Loading/Inline-Script-Info-and-Size" },
    { id: "inline-css", path: "Loading/Inline-CSS-Info-and-Size" },
    { id: "webfonts", path: "Loading/Webfont-Usage-Analyzer" },
    { id: "content-visibility", path: "Loading/Content-Visibility" },
    { id: "prefetch", path: "Loading/Prefetch-Resource-Validation" },
    // Tier 2 — Media determinista
    { id: "lazy-atf", path: "Loading/Find-Above-The-Fold-Lazy-Loaded-Images" },
    { id: "lazy-conflict", path: "Loading/Find-Images-With-Lazy-and-Fetchpriority" },
    { id: "eager-below-fold", path: "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport" },
    { id: "video", path: "Media/Video-Element-Audit" },
    // Tier 3 — DOM
    { id: "dom-size", path: "Interaction/DOM-Size-and-Depth" },
    // Steps that make their own requests, last
    { id: "oversized-images", path: "Media/Oversized-Images" },
    { id: "image-audit", path: "Media/Image-Element-Audit" },
    { id: "svg-bitmaps", path: "Media/SVG-Embedded-Bitmap-Analysis" },
  ],
};
