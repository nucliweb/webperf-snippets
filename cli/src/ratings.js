// Good / needs-improvement upper bounds from web.dev/articles/vitals, and the ones web.dev gives for
// FCP and TTFB, the same the snippets rate with.
export const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
};

// "good", "needs-improvement" or "poor", or undefined for a value without thresholds
export function rate(metric, value) {
  const thresholds = THRESHOLDS[metric];
  if (!thresholds) return undefined;
  return value <= thresholds.good ? "good" : value <= thresholds.poor ? "needs-improvement" : "poor";
}
