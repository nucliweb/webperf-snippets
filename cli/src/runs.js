// Several runs of the same measurement, reduced to one: the median run, as WebPageTest reports it.
// Every result of the report comes from that run, so they agree with each other (the sub-parts of
// the LCP add up to its LCP), and a summary gives the median, min and max of each metric.

// The metrics the snippets report, and navMs, which every run has
export const MEDIAN_METRICS = ["LCP", "FCP", "TTFB", "CLS", "INP", "navMs"];

// Without --median-by, the median follows the first of these that the runs measured
const DEFAULT_ORDER = ["LCP", "FCP", "TTFB", "navMs"];

const SUMMARY_METRICS = MEDIAN_METRICS.filter((metric) => metric !== "navMs");

// The value of a metric in a run: its first result with that metric, as LCP comes before its
// follow-up LCP-Subparts, which reports the same metric
function valueOf(run, metric) {
  if (metric === "navMs") return run.navMs;
  const result = run.results.find((r) => r.metric === metric && r.status === "ok" && typeof r.value === "number");
  return result?.value;
}

const measures = (runs, metric) => runs.some((run) => typeof valueOf(run, metric) === "number");

// The middle element of numbers sorted from low to high. With an even count it takes the lower of
// the two middle ones, so the median is always a run that happened, never an average of two.
const middle = (sorted) => sorted[Math.floor((sorted.length - 1) / 2)];

// "3 runs, median by LCP: run 2 (1 failed)", for the header of the reports
export function describeRuns({ count, failed, medianRun, medianBy, medianByRequested }) {
  const by = medianByRequested ? `${medianBy} (no run measured ${medianByRequested})` : medianBy;
  return `${count} runs, median by ${by}: run ${medianRun}${failed ? ` (${failed} failed)` : ""}`;
}

// The runs as the CLI made them, in order, a run that failed being { error }. Returns the payload of
// the median run and the `runs` field of the report, or nulls and the errors when every run failed.
export function summarizeRuns(runs, { medianBy: requested } = {}) {
  const completed = runs.filter((run) => !run.error);
  if (completed.length === 0) return { payload: null, runs: null, errors: runs.map((run) => run.error) };

  const medianBy = requested && measures(completed, requested) ? requested : DEFAULT_ORDER.find((metric) => measures(completed, metric));
  const ranked = completed
    .filter((run) => typeof valueOf(run, medianBy) === "number")
    .sort((a, b) => valueOf(a, medianBy) - valueOf(b, medianBy));
  const payload = middle(ranked);

  const summary = {};
  for (const metric of SUMMARY_METRICS) {
    if (!measures(completed, metric)) continue;
    const values = runs.map((run) => (run.error ? null : (valueOf(run, metric) ?? null)));
    const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
    const unit = completed.flatMap((run) => run.results).find((r) => r.metric === metric && r.unit)?.unit;
    summary[metric] = { median: middle(sorted), min: sorted[0], max: sorted[sorted.length - 1], values, unit };
  }

  return {
    payload,
    runs: {
      count: runs.length,
      failed: runs.length - completed.length,
      medianRun: runs.indexOf(payload) + 1,
      medianBy,
      ...(requested && requested !== medianBy ? { medianByRequested: requested } : {}),
      summary,
    },
  };
}
