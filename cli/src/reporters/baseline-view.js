// The comparison with a baseline as the human and markdown reports draw it: one row per metric with
// its two values, the change and the verdict, and why an unchanged one did not count. The values stay
// numbers with their unit, for each report to format.

const MINUS = "−";
const signed = (n, text) => (n > 0 ? `+${text}` : n < 0 ? `${MINUS}${text}` : text);
const arrow = (delta) => (delta > 0 ? "▲" : delta < 0 ? "▼" : "=");
const unitOf = (metric) => (metric === "CLS" ? "score" : "ms");

// "▲ +380ms (+18%)", "▼ −90ms (−15%)", "▼ −0.0020"
function describeChange(metric, { delta, deltaPercent }) {
  if (metric === "CLS") return `${arrow(delta)} ${signed(delta, Math.abs(delta).toFixed(4))}`;
  const ms = signed(delta, `${Math.abs(Math.round(delta))}ms`);
  const percent = deltaPercent == null ? "" : ` (${signed(deltaPercent, `${Math.abs(Math.round(deltaPercent))}%`)})`;
  return `${arrow(delta)} ${ms}${percent}`;
}

// An unchanged metric that moved stayed under its threshold, or beat it inside the range of the runs
// of the baseline: noise the baseline already had
function noteOf(metric, m) {
  if (m.verdict !== "unchanged" || m.delta === 0) return null;
  if (Math.abs(m.delta) > m.threshold) return "inside the range of the baseline";
  return `under ${metric === "CLS" ? m.threshold : `${Math.round(m.threshold)}ms`}`;
}

export function baselineView({ file, url, runs, metrics, errors, warnings }) {
  const summary = `${url}, ${runs.count === 1 ? "1 run" : `${runs.count} runs, median by ${runs.medianBy}`}`;
  const rows = Object.entries(metrics).map(([metric, m]) => ({
    metric,
    unit: unitOf(metric),
    baseline: m.baseline,
    current: m.current,
    change: m.verdict === "not measured" ? null : describeChange(metric, m),
    verdict: m.verdict,
    note: m.verdict === "not measured" ? null : noteOf(metric, m),
  }));
  return { file, summary, rows, newErrors: errors.new, fixedErrors: errors.fixed, warnings };
}

// What got worse, one line each, for --fail-on-regression: the metrics that regressed and the errors
// that only this run has
export function describeRegressions({ metrics, errors }) {
  return [
    ...Object.entries(metrics)
      .filter(([, m]) => m.verdict === "regressed")
      .map(([metric, m]) => `${metric} ${describeChange(metric, m)}`),
    ...errors.new.map((e) => `new error ${e.id}: ${e.message}`),
  ];
}
