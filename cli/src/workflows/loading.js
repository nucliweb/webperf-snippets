// Loading performance workflow — timing-sensitive measurements requiring a real page load.
// Complements the audit workflow (deterministic structural checks) with live metrics.
//
// Every step runs on the same page, one after the other. The step that makes requests of its own
// (the HEAD requests that read the cache headers) goes last, because those requests add Resource
// Timing entries that the steps before it would read.
export const loadingWorkflow = {
  id: "loading",
  title: "Loading Performance",
  steps: [
    { id: "TTFB", path: "Loading/TTFB" },
    { id: "FCP", path: "Loading/FCP" },
    { id: "render-blocking", path: "Loading/Find-render-blocking-resources" },
    { id: "resource-hints", path: "Loading/Resource-Hints-Validation" },
    { id: "scripts", path: "Loading/Script-Loading" },
    { id: "script-timings", path: "Loading/First-And-Third-Party-Script-Timings" },
    { id: "ttfb-resources", path: "Loading/TTFB-Resources" },
    { id: "js-execution", path: "Loading/JS-Execution-Time-Breakdown" },
    { id: "third-party-impact", path: "Loading/Third-Party-Impact-by-Domain" },
    { id: "fonts", path: "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold" },
    { id: "cache-strategy", path: "Loading/Cache-Strategy-Analysis" },
  ],
};
