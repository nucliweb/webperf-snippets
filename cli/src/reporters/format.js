// A value of a metric as the human and markdown reports write it: milliseconds as seconds from one
// second on, a score with four decimals, anything else as it is
export function formatValue(value, unit) {
  if (unit === "ms") return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
  if (unit === "score") return value.toFixed(4);
  return String(value);
}
