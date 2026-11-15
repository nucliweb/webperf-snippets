import { inconclusiveForTheWorse } from "../baseline.js";

// The comparison with a baseline as the human and markdown reports draw it: one row per metric with
// its two values, the change and the verdict, why an unchanged one did not count and what to do with an
// inconclusive one. The values stay numbers with their unit, for each report to format.

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
// Three decimals up to 0.1, so a p-value next to the 0.05 it is compared with is not rounded away from it
const pValue = (p) => (p < 0.001 ? "< 0.001" : p < 0.1 ? p.toFixed(3) : p.toFixed(2));
const amountOf = (metric, n) => (metric === "CLS" ? signed(n, Math.abs(n).toFixed(4)) : signed(n, `${Math.abs(Math.round(n))}ms`));

// What a person does with an inconclusive metric: the runs can tell neither a change nor its absence
const MEASURE_AGAIN = "measure again, or with more runs";

// The evidence of a change measured with five runs a side: its p-value, its shift and the 95 % interval
// of the shift; for a change over the threshold that is inconclusive, that the runs gave no evidence and
// what to do about it
function evidenceOf(metric, m) {
  const { p, shift, ci } = m.stats;
  if (m.verdict === "inconclusive") return `no evidence: p = ${pValue(p)}; ${MEASURE_AGAIN}`;
  if (m.verdict === "unchanged") return null;
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

// "LCP, FCP inconclusive for the worse after 5 runs a side: both pages measured 2 more, up to 7"
const describeExtended = ({ after, metrics }, runs) =>
  `${metrics.join(", ")} inconclusive for the worse after ${after} runs a side: both pages measured ${runs.count - after} more, up to ${runs.count}`;

// A baseline from a file is named by its file, with the URL it measured; a live one, measured in this
// run, by its URL, with the runs it took and, when it measured more, why
export function baselineView({ file, live, url, runs, metrics, errors, warnings, extended }) {
  const runsText = runs.count === 1 ? "1 run" : `${runs.count} runs, median by ${runs.medianBy}`;
  const [source, summary] = live ? [url, `measured in this run, ${runsText}`] : [file, `${url}, ${runsText}`];
  const rows = Object.entries(metrics).map(([metric, m]) => ({
    metric,
    unit: unitOf(metric),
    baseline: m.baseline,
    current: m.current,
    change: m.verdict === "not measured" ? null : describeChange(metric, m),
    verdict: m.verdict,
    note: m.verdict === "not measured" ? null : noteOf(metric, m),
  }));
  return { source, summary, ...(extended ? { extended: describeExtended(extended, runs) } : {}), rows, newErrors: errors.new, fixedErrors: errors.fixed, warnings };
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

// The metrics inconclusive for the worse, one line each, for --fail-on-inconclusive: their change, their
// p-value and what to do. An inconclusive improvement never fails.
export function describeInconclusive(comparison) {
  return inconclusiveForTheWorse(comparison).map((metric) => {
    const m = comparison.metrics[metric];
    return `${metric} ${describeChange(metric, m)}, p = ${pValue(m.stats.p)}; ${MEASURE_AGAIN}`;
  });
}

// The change of a metric in a cell of the matrix table: the figure only when it counts, so the table
// reads at a glance. "▲ +380ms", "▼ −400ms", "=" for unchanged, "·" when one side did not measure it.
export function changeCell(metric, m) {
  if (m.verdict === "not measured") return { text: "·", verdict: m.verdict };
  if (m.verdict === "unchanged") return { text: "=", verdict: m.verdict };
  const amount = metric === "CLS" ? Math.abs(m.delta).toFixed(4) : `${Math.abs(Math.round(m.delta))}ms`;
  // An inconclusive change counts for nothing yet: a question mark keeps it apart from a regression
  return { text: `${arrow(m.delta)} ${signed(m.delta, amount)}${m.verdict === "inconclusive" ? "?" : ""}`, verdict: m.verdict };
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

// The inconclusive metrics for the worse of every combination, each named by its combination
export function describeMatrixInconclusive(combinations) {
  return combinations.filter((c) => c.baseline).flatMap((c) => describeInconclusive(c.baseline).map((line) => `${c.id}: ${line}`));
}
