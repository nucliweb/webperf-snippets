import { DEFAULT_THRESHOLDS } from "./baseline.js";

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

// How much the runs of a metric agree: their coefficient of variation, the sample standard deviation
// over the mean, in percent, and its band. Up to 5 % the runs agree; above 10 % one median says little.
// None for one run, or for runs whose mean is 0, such as a CLS of 0 in every run. Runs that vary by
// less than half of the change --baseline counts agree whatever their CV: a local TTFB of 3 to 18 ms
// has a CV of 64 % and a standard deviation of 6 ms.
function agreementOf(values, metric) {
  if (values.length < 2) return {};
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return {};
  const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
  const cv = Math.round((sd / mean) * 1000) / 10;
  if (sd < DEFAULT_THRESHOLDS[metric].absolute / 2) return { cv, agreement: "consistent" };
  return { cv, agreement: cv <= 5 ? "consistent" : cv <= 10 ? "variable" : "noisy" };
}

// "noisy (CV 14.4%)", for the reports
export const describeAgreement = ({ cv, agreement }) => (cv === undefined ? "" : `${agreement} (CV ${cv}%)`);

// "3 runs, median by LCP: run 2 (1 failed)", for the header of the reports
export function describeRuns({ count, failed, medianRun, medianBy, medianByRequested }) {
  const by = medianByRequested ? `${medianBy} (no run measured ${medianByRequested})` : medianBy;
  return `${count} run${count === 1 ? "" : "s"}, median by ${by}: run ${medianRun}${failed ? ` (${failed} failed)` : ""}`;
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
    summary[metric] = { median: middle(sorted), min: sorted[0], max: sorted[sorted.length - 1], values, unit, ...agreementOf(sorted, metric) };
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
