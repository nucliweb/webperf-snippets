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

// Three decimals where the verdict is decided, two above it: "0.028", "0.35"
const pValue = (p) => (p < 0.001 ? "< 0.001" : p < 0.05 ? p.toFixed(3) : p.toFixed(2));
const amountOf = (metric, n) => (metric === "CLS" ? signed(n, Math.abs(n).toFixed(4)) : signed(n, `${Math.abs(Math.round(n))}ms`));

// The evidence of a change measured with five runs a side: its p-value, its shift and the 95 % interval
// of the shift; for a change over the threshold that stayed unchanged, that the runs gave no evidence
function evidenceOf(metric, m) {
  const { p, shift, ci } = m.stats;
  if (m.verdict === "unchanged") return Math.abs(m.delta) > m.threshold ? `no evidence: p = ${pValue(p)}` : null;
  return `p = ${pValue(p)}, ${amountOf(metric, shift)}, 95% CI ${amountOf(metric, ci[0])} to ${amountOf(metric, ci[1])}`;
}

// An unchanged metric that moved stayed under its threshold, or beat it inside the range of the runs
// of the baseline: noise the baseline already had
function noteOf(metric, m) {
  if (m.stats) return evidenceOf(metric, m) ?? (m.verdict === "unchanged" && m.delta !== 0 ? `under ${metric === "CLS" ? m.threshold : `${Math.round(m.threshold)}ms`}` : null);
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

// The change of a metric in a cell of the matrix table: the figure only when it counts, so the table
// reads at a glance. "▲ +380ms", "▼ −400ms", "=" for unchanged, "·" when one side did not measure it.
export function changeCell(metric, m) {
  if (m.verdict === "not measured") return { text: "·", verdict: m.verdict };
  if (m.verdict === "unchanged") return { text: "=", verdict: m.verdict };
  const amount = metric === "CLS" ? Math.abs(m.delta).toFixed(4) : `${Math.abs(Math.round(m.delta))}ms`;
  return { text: `${arrow(m.delta)} ${signed(m.delta, amount)}`, verdict: m.verdict };
}

// The comparison of a matrix below its table. A warning that every compared combination has, such as
// a baseline of one run, shows once; the others name their combinations.
export function matrixComparisonView(root, combinations) {
  const compared = combinations.filter((c) => c.baseline);
  const idsByWarning = new Map();
  for (const c of compared) {
    for (const warning of c.baseline.warnings) idsByWarning.set(warning, [...(idsByWarning.get(warning) ?? []), c.id]);
  }
  const warnings = [...idsByWarning].map(([warning, ids]) => (ids.length === compared.length ? warning : `${ids.join(", ")}: ${warning}`));
  const errorsOf = (kind) => compared.flatMap((c) => c.baseline.errors[kind].map((e) => `${c.id}: ${e.id}: ${e.message}`));
  return {
    file: root.file,
    warnings: [...root.warnings, ...warnings],
    newErrors: errorsOf("new"),
    fixedErrors: errorsOf("fixed"),
    added: root.added,
    missing: root.missing,
  };
}

// The regressions of every combination, each named by its combination
export function describeMatrixRegressions(combinations) {
  return combinations.filter((c) => c.baseline).flatMap((c) => describeRegressions(c.baseline).map((r) => `${c.id}: ${r}`));
}
