// Fetch & XHR Timeline — Inject via DevTools Overrides
// https://webperf-snippets.net
(() => {
  const calls = [];

  // Intercept fetch
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    const start = performance.now();
    return origFetch.apply(this, args).then((r) => {
      const end = performance.now();
      calls.push({
        type: "fetch",
        url,
        start: Math.round(start),
        end: Math.round(end),
        duration: Math.round(end - start),
        status: r.status,
      });
      return r;
    }).catch((err) => {
      const end = performance.now();
      calls.push({
        type: "fetch",
        url,
        start: Math.round(start),
        end: Math.round(end),
        duration: Math.round(end - start),
        status: "ERROR",
        error: err.message,
      });
      throw err;
    });
  };

  // Intercept XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__url = url;
    this.__method = method;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const start = performance.now();
    this.addEventListener("loadend", () => {
      const end = performance.now();
      calls.push({
        type: "xhr",
        url: this.__url,
        start: Math.round(start),
        end: Math.round(end),
        duration: Math.round(end - start),
        status: this.status || "ERROR",
      });
    });
    return origSend.apply(this, arguments);
  };

  window.__perfCalls = calls;

  // Capture LCP for correlation in the read snippet
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      window.__lcpTime = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
})();
