import { describe, it, expect } from "vitest";
import { MEDIAN_METRICS, summarizeRuns } from "../../src/runs.js";

// A run as the runner returns it, with the metrics given
const run = (navMs, metrics = {}) => ({
  url: "https://example.com/",
  navMs,
  pageErrors: [],
  results: Object.entries(metrics).map(([metric, value]) => ({
    id: metric,
    status: "ok",
    metric,
    value,
    unit: metric === "CLS" ? "score" : "ms",
  })),
});
const failed = (message) => ({ error: message });

describe("the median run", () => {
  it("is the middle run by LCP, numbered from 1", () => {
    const runs = [run(900, { LCP: 2600 }), run(800, { LCP: 1900 }), run(850, { LCP: 2100 })];
    const { payload, runs: field } = summarizeRuns(runs);
    expect(field.medianRun).toBe(3);
    expect(field.medianBy).toBe("LCP");
    expect(payload).toBe(runs[2]);
  });

  it("is the lower of the two middle runs with an even count, so it is always a run that happened", () => {
    const runs = [run(1, { LCP: 400 }), run(1, { LCP: 100 }), run(1, { LCP: 300 }), run(1, { LCP: 200 })];
    expect(summarizeRuns(runs).runs.medianRun).toBe(4);
  });

  it("follows LCP, FCP, TTFB and navMs, the first one the runs measured", () => {
    expect(summarizeRuns([run(1, { FCP: 300, TTFB: 50 }), run(1, { FCP: 100, TTFB: 90 }), run(1, { FCP: 200, TTFB: 70 })]).runs).toMatchObject({ medianBy: "FCP", medianRun: 3 });
    expect(summarizeRuns([run(1, { TTFB: 90 }), run(1, { TTFB: 50 }), run(1, { TTFB: 70 })]).runs).toMatchObject({ medianBy: "TTFB", medianRun: 3 });
    expect(summarizeRuns([run(700), run(300), run(500)]).runs).toMatchObject({ medianBy: "navMs", medianRun: 3 });
  });

  it("follows the metric asked for", () => {
    const runs = [run(1, { LCP: 100, CLS: 0.3 }), run(1, { LCP: 200, CLS: 0.1 }), run(1, { LCP: 300, CLS: 0.2 })];
    expect(summarizeRuns(runs, { medianBy: "CLS" }).runs).toMatchObject({ medianBy: "CLS", medianRun: 3 });
  });

  it("falls back to the default order when no run measured the metric asked for, and says so", () => {
    const runs = [run(1, { LCP: 300 }), run(1, { LCP: 100 }), run(1, { LCP: 200 })];
    expect(summarizeRuns(runs, { medianBy: "INP" }).runs).toMatchObject({ medianBy: "LCP", medianByRequested: "INP", medianRun: 3 });
    expect(summarizeRuns(runs, { medianBy: "LCP" }).runs).not.toHaveProperty("medianByRequested");
  });

  it("leaves out the runs that failed, and counts them", () => {
    const runs = [run(1, { LCP: 300 }), failed("net::ERR_EMPTY_RESPONSE"), run(1, { LCP: 100 })];
    const { runs: field } = summarizeRuns(runs);
    expect(field).toMatchObject({ count: 3, failed: 1, medianRun: 3 });
  });

  it("is null when every run failed", () => {
    expect(summarizeRuns([failed("a"), failed("b")])).toEqual({ payload: null, runs: null, errors: ["a", "b"] });
  });
});

describe("the summary of the metrics", () => {
  it("gives the median, min and max of each metric, and its values in the order of the runs", () => {
    const runs = [run(1, { LCP: 2600, CLS: 0.11 }), failed("x"), run(1, { LCP: 1980, CLS: 0.02 }), run(1, { LCP: 2140, CLS: 0.04 })];
    const { summary } = summarizeRuns(runs).runs;
    expect(summary.LCP).toEqual({ median: 2140, min: 1980, max: 2600, values: [2600, null, 1980, 2140], unit: "ms" });
    expect(summary.CLS).toEqual({ median: 0.04, min: 0.02, max: 0.11, values: [0.11, null, 0.02, 0.04], unit: "score" });
  });

  it("takes the first result of a metric in a run, as LCP before its follow-up LCP-Subparts", () => {
    const withFollowUp = run(1, { LCP: 1200 });
    withFollowUp.results.push({ id: "LCP-Subparts", status: "ok", metric: "LCP", value: 1210, unit: "ms" });
    expect(summarizeRuns([withFollowUp]).runs.summary.LCP.values).toEqual([1200]);
  });

  it("leaves out the results that are not ok and the metrics no run measured", () => {
    const errored = run(1);
    errored.results.push({ id: "LCP", status: "error", metric: "LCP", error: "No LCP entries buffered" });
    const { summary } = summarizeRuns([errored, run(1, { CLS: 0 })]).runs;
    expect(Object.keys(summary)).toEqual(["CLS"]);
    expect(summary.CLS.values).toEqual([null, 0]);
  });
});

it("the metrics the median can follow are the ones the snippets report, and navMs", () => {
  expect(MEDIAN_METRICS).toEqual(["LCP", "FCP", "TTFB", "CLS", "INP", "navMs"]);
});
