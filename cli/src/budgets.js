// The performance budgets of the command line (--budget-lcp, --budget-fcp, --budget-ttfb,
// --budget-cls and --budget-inp): reading them, telling whether the run can measure their metric,
// and the verdict of each one against what a page measured.

// The metrics that take a budget, with their unit
export const BUDGET_METRICS = { LCP: "ms", FCP: "ms", TTFB: "ms", CLS: "score", INP: "ms" };

// The snippets whose result carries each metric, by path
export const MEASURED_BY = {
  LCP: ["CoreWebVitals/LCP", "CoreWebVitals/LCP-Subparts"],
  FCP: ["Loading/FCP"],
  TTFB: ["Loading/TTFB", "Loading/TTFB-Sub-Parts"],
  CLS: ["CoreWebVitals/CLS"],
  INP: ["CoreWebVitals/INP"],
};

const optionOf = (metric) => `--budget-${metric.toLowerCase()}`;

// The budgets given on the command line, by metric. A value that is not a number of 0 or more throws,
// so the command can exit with 2 before the browser opens.
export function parseBudgets(values) {
  const budgets = {};
  for (const metric of Object.keys(BUDGET_METRICS)) {
    const raw = values[optionOf(metric).slice(2)];
    if (raw === undefined) continue;
    if (!/^\d+(?:\.\d+)?$/.test(raw.trim())) {
      throw new Error(`Invalid ${optionOf(metric)} "${raw}". Use a number of 0 or more, such as ${metric === "CLS" ? "0.1" : "2500"}`);
    }
    budgets[metric] = Number(raw);
  }
  return budgets;
}

// The metrics with a budget that no snippet of the run measures, such as LCP in the audit workflow
export const unmeasuredMetrics = (budgets, paths) =>
  Object.keys(budgets).filter((metric) => !MEASURED_BY[metric].some((path) => paths.includes(path)));

const nameOf = (path) => path.split("/").pop().toLowerCase();

// The result of the snippet that measures a metric, a step of the run before a follow-up
function resultFor(results, metric) {
  const names = MEASURED_BY[metric].map(nameOf);
  const ofMetric = results.filter((r) => r.metric === metric || names.includes(String(r.script ?? r.id).toLowerCase()));
  return ofMetric.find((r) => !r.reason || r.status === "skipped") ?? ofMetric[0];
}

// The verdict of each budget: passed when the value is at most the budget, exceeded above it, and not
// measured when the run has no value, with the reason its snippet gave. With several runs, the median.
export function checkBudgets({ results = [], runs }, budgets) {
  return Object.entries(budgets).map(([metric, budget]) => {
    const unit = BUDGET_METRICS[metric];
    const result = resultFor(results, metric);
    const measured = result?.status === "ok" && typeof result.value === "number" ? result.value : null;
    const value = runs ? (runs.summary?.[metric]?.median ?? null) : measured;
    if (value === null) {
      const note = result?.error ?? result?.message ?? (result?.status === "skipped" ? result.reason : undefined);
      return { metric, budget, value: null, unit, verdict: "not measured", ...(note ? { note } : {}) };
    }
    return { metric, budget, value, unit, verdict: value > budget ? "exceeded" : "passed" };
  });
}

const amount = (value, unit) => (unit === "ms" ? `${value}ms` : String(value));

// The budgets that failed, in the words of stderr
export const violationsOf = (checked) =>
  checked
    .filter((b) => b.verdict !== "passed")
    .map((b) =>
      b.verdict === "exceeded"
        ? `${b.metric} ${amount(b.value, b.unit)} exceeds budget ${amount(b.budget, b.unit)}`
        : `${b.metric} was not measured (budget ${amount(b.budget, b.unit)})${b.note ? `: ${b.note}` : ""}`
    );
