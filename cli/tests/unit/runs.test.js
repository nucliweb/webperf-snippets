import { describe, it, expect } from "vitest";
import { MAX_RUNS, MEDIAN_METRICS, measureRuns, summarizeRuns } from "../../src/runs.js";

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

  it("follows LCP, FCP, TTFB, INP and navMs, the first one the runs measured", () => {
    expect(summarizeRuns([run(1, { FCP: 300, TTFB: 50 }), run(1, { FCP: 100, TTFB: 90 }), run(1, { FCP: 200, TTFB: 70 })]).runs).toMatchObject({ medianBy: "FCP", medianRun: 3 });
    expect(summarizeRuns([run(1, { TTFB: 90 }), run(1, { TTFB: 50 }), run(1, { TTFB: 70 })]).runs).toMatchObject({ medianBy: "TTFB", medianRun: 3 });
    expect(summarizeRuns([run(700), run(300), run(500)]).runs).toMatchObject({ medianBy: "navMs", medianRun: 3 });
  });

  // A measurement of interactions has no LCP, FCP or TTFB: the run that answers is the one with the median
  // INP, so its INP and the details of its slowest interaction are the median ones, not those of the run
  // that loaded in the median time
  it("follows INP before navMs, so a measurement of interactions answers with its median INP", () => {
    const runs = [run(300, { INP: 320 }), run(500, { INP: 328 }), run(400, { INP: 324 })];
    const { payload, runs: field } = summarizeRuns(runs);
    expect(field).toMatchObject({ medianBy: "INP", medianRun: 3 });
    expect(payload).toBe(runs[2]);
    expect(summarizeRuns([run(1, { LCP: 300, INP: 90 }), run(1, { LCP: 100, INP: 50 }), run(1, { LCP: 200, INP: 70 })]).runs).toMatchObject({ medianBy: "LCP" });
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
    expect(summary.LCP).toEqual({ median: 2140, min: 1980, max: 2600, values: [2600, null, 1980, 2140], unit: "ms", cv: 14.4, agreement: "noisy" });
    expect(summary.CLS).toEqual({ median: 0.04, min: 0.02, max: 0.11, values: [0.11, null, 0.02, 0.04], unit: "score", cv: 83.4, agreement: "noisy" });
  });

  // The coefficient of variation of the runs, the sample standard deviation over the mean, in percent;
  // the values were computed apart with Python's statistics.stdev
  it("says how much the runs agree: consistent up to 5 %, variable up to 10 %, noisy above", () => {
    const of = (values) => summarizeRuns(values.map((LCP) => run(1, { LCP }))).runs.summary.LCP;
    expect(of([2000, 2100, 2200])).toMatchObject({ cv: 4.8, agreement: "consistent" });
    expect(of([1000, 1080, 1160])).toMatchObject({ cv: 7.4, agreement: "variable" });
    expect(of([1000, 1100, 1300])).toMatchObject({ cv: 13.5, agreement: "noisy" });
  });

  it("calls consistent the runs that vary by less than half of what --baseline counts as a change, whatever their CV", () => {
    // A local TTFB of 3 to 18 ms: a CV of 64 %, with a standard deviation of 5.8 ms
    const ttfb = summarizeRuns([18, 3, 9, 5, 10].map((TTFB) => run(1, { TTFB }))).runs.summary.TTFB;
    expect(ttfb).toMatchObject({ cv: 64.3, agreement: "consistent" });
  });

  it("says nothing of the agreement of one run, or of runs whose mean is 0, such as a CLS of 0 in every run", () => {
    expect(summarizeRuns([run(1, { LCP: 1200 })]).runs.summary.LCP.cv).toBeUndefined();
    const zero = summarizeRuns([run(1, { CLS: 0 }), run(1, { CLS: 0 }), run(1, { CLS: 0 })]).runs.summary.CLS;
    expect(zero.cv).toBeUndefined();
    expect(zero.agreement).toBeUndefined();
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

describe("measuring several runs", () => {
  it("measures one after the other, never in parallel, and reduces them to the median run", async () => {
    let running = 0;
    const seen = [];
    const values = [300, 100, 200];
    const { payload, runs } = await measureRuns(async (i) => {
      expect(++running).toBe(1);
      seen.push(i);
      await new Promise((resolve) => setTimeout(resolve));
      running--;
      return run(1, { LCP: values[i - 1] });
    }, 3);
    expect(seen).toEqual([1, 2, 3]);
    expect(runs).toMatchObject({ count: 3, failed: 0, medianRun: 3, medianBy: "LCP" });
    expect(payload.results[0].value).toBe(200);
  });

  it("follows the metric asked for", async () => {
    const values = [{ LCP: 100, FCP: 30 }, { LCP: 200, FCP: 10 }, { LCP: 300, FCP: 20 }];
    const { runs } = await measureRuns(async (i) => run(1, values[i - 1]), 3, { medianBy: "FCP" });
    expect(runs).toMatchObject({ medianBy: "FCP", medianRun: 3 });
  });

  it("keeps a run that fails out of the median, and gives the errors when every run failed", async () => {
    const { runs } = await measureRuns(async (i) => {
      if (i === 2) throw new Error("page.goto: timeout");
      return run(1, { LCP: i * 100 });
    }, 3);
    expect(runs).toMatchObject({ count: 3, failed: 1 });
    expect(runs.summary.LCP.values).toEqual([100, null, 300]);

    const none = await measureRuns(async () => {
      throw new Error("page.goto: refused");
    }, 2);
    expect(none).toEqual({ payload: null, runs: null, errors: ["page.goto: refused", "page.goto: refused"] });
  });

  it("stops at an error the next run would repeat, such as a browser that is not installed", async () => {
    const missing = new Error("Chromium for Playwright is not installed");
    let attempts = 0;
    const measuring = measureRuns(
      async () => {
        attempts++;
        throw missing;
      },
      3,
      { isFatal: (err) => err === missing }
    );
    await expect(measuring).rejects.toBe(missing);
    expect(attempts).toBe(1);
  });

  it("starts no more runs once the signal aborts, so a caller that left does not keep Chromium busy", async () => {
    const controller = new AbortController();
    let attempts = 0;
    const measuring = measureRuns(
      async () => {
        if (++attempts === 2) controller.abort(new Error("the client cancelled"));
        return run(1, { LCP: 100 });
      },
      5,
      { signal: controller.signal }
    );
    await expect(measuring).rejects.toThrow("the client cancelled");
    expect(attempts).toBe(2);
  });

  it("allows nine runs, the same for the CLI and the MCP server", () => {
    expect(MAX_RUNS).toBe(9);
  });
});
