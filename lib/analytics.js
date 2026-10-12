// Sends a Google Analytics event. The gtag function comes from the script of components/Analytics.jsx,
// so on the server, or with an ad blocker, there is none and nothing is sent.
export function trackEvent(name, params) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
