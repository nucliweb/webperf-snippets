import { describe, it, expect } from "vitest";
import { isLiveBaseline, parseLiveBaseline, measureLiveBaseline } from "../../src/live-baseline.js";
import { compareRun } from "../../src/baseline.js";

// A run as the runner returns it, with its LCP
const run = (url, LCP) => ({ url, navMs: 900, pageErrors: [], results: [{ id: "LCP", status: "ok", metric: "LCP", value: LCP, unit: "ms" }] });

// A measure function that answers each side with the next LCP of its list, and records every call
function pages({ baseline, current, fail = {} }) {
  const calls = [];
  const measure = async (side, i) => {
    calls.push(`${side} ${i}`);
    if (fail[side]?.includes(i)) throw new Error(`page.goto: ${side} ${i} failed`);
    return run(side === "baseline" ? "https://example.com/" : "https://pr-1.example.net/", (side === "baseline" ? baseline : current)[i - 1]);
  };
  return { measure, calls };
}

// The comparison of the CLI over both summaries, counting its calls: each call is a decision
function comparing() {
  const decisions = [];
  const compare = (baseline, current) => {
    decisions.push({ baseline: baseline.runs.count, current: current.runs.count });
    return compareRun({ ...baseline.payload, runs: baseline.runs }, { ...current.payload, runs: current.runs }, { live: true });
  };
  return { compare, decisions };
}

const FAST = [2000, 2010, 2020, 2030, 2040, 2050, 2060, 2070, 2080];
const SLOW = [3000, 3010, 3020, 3030, 3040, 3050, 3060, 3070, 3080];
// One slow run of the baseline, the fifth: with five runs a side, p = 0.0754 and a +50 % LCP is inconclusive
const FAST_WITH_ONE_SLOW = [2000, 2010, 2020, 2030, 3600, 2050, 2060, 2070, 2080];

describe("a live baseline", () => {
  it("is a value of --baseline that starts with http:// or https://; anything else is a file", () => {
    expect(isLiveBaseline("https://example.com/")).toBe(true);
    expect(isLiveBaseline("http://localhost:3000")).toBe(true);
    expect(isLiveBaseline("HTTPS://example.com")).toBe(true);
    expect(isLiveBaseline("baseline.json")).toBe(false);
    expect(isLiveBaseline("./https/baseline.json")).toBe(false);
    expect(isLiveBaseline(undefined)).toBe(false);
  });
});

describe("measuring a live baseline", () => {
  it("alternates the runs of both pages, baseline first, --runs times each, and compares them once", async () => {
    const { measure, calls } = pages({ baseline: FAST, current: SLOW });
    const { compare, decisions } = comparing();
    const { baseline, current, comparison, extended } = await measureLiveBaseline(measure, { runs: 3, compare });
    expect(calls).toEqual(["baseline 1", "current 1", "baseline 2", "current 2", "baseline 3", "current 3"]);
    expect(decisions).toEqual([{ baseline: 3, current: 3 }]);
    expect(baseline.runs.summary.LCP.values).toEqual([2000, 2010, 2020]);
    expect(current.runs.summary.LCP.values).toEqual([3000, 3010, 3020]);
    expect(comparison.metrics.LCP.verdict).toBe("regressed");
    expect(extended).toBeUndefined();
  });

  it("measures each page once without --runs", async () => {
    const { measure, calls } = pages({ baseline: FAST, current: SLOW });
    const { compare } = comparing();
    const { baseline, current } = await measureLiveBaseline(measure, { runs: 1, compare });
    expect(calls).toEqual(["baseline 1", "current 1"]);
    expect([baseline.runs.count, current.runs.count]).toEqual([1, 1]);
  });

  it("names the side, the run and the place of each measurement, as it starts", async () => {
    const { measure } = pages({ baseline: FAST, current: SLOW });
    const { compare } = comparing();
    const progress = [];
    await measureLiveBaseline(measure, { runs: 2, compare, onRun: (step) => progress.push(step) });
    expect(progress).toEqual([
      { side: "baseline", run: 1, runs: 2, step: 1, steps: 4 },
      { side: "current", run: 1, runs: 2, step: 2, steps: 4 },
      { side: "baseline", run: 2, runs: 2, step: 3, steps: 4 },
      { side: "current", run: 2, runs: 2, step: 4, steps: 4 },
    ]);
  });

  it("keeps a run that fails on one side out of that side only, and goes on alternating", async () => {
    const { measure, calls } = pages({ baseline: FAST, current: SLOW, fail: { current: [2] } });
    const { compare } = comparing();
    const { baseline, current } = await measureLiveBaseline(measure, { runs: 3, compare });
    expect(calls).toHaveLength(6);
    expect(baseline.runs).toMatchObject({ count: 3, failed: 0 });
    expect(current.runs).toMatchObject({ count: 3, failed: 1 });
    expect(current.runs.summary.LCP.values).toEqual([3000, null, 3020]);
  });

  it("does not compare when every run of a side failed, and gives the errors of that side", async () => {
    const { measure } = pages({ baseline: FAST, current: SLOW, fail: { baseline: [1, 2] } });
    const { compare, decisions } = comparing();
    const { baseline, current, comparison } = await measureLiveBaseline(measure, { runs: 2, maxRuns: 4, compare });
    expect(decisions).toEqual([]);
    expect(comparison).toBeNull();
    expect(baseline.errors).toEqual(["page.goto: baseline 1 failed", "page.goto: baseline 2 failed"]);
    expect(current.payload).not.toBeNull();
  });

  it("stops at an error the next run would repeat, such as a browser that is not installed", async () => {
    const missing = new Error("Chromium for Playwright is not installed");
    let calls = 0;
    const measuring = measureLiveBaseline(
      async () => {
        calls++;
        throw missing;
      },
      { runs: 3, compare: () => ({}), isFatal: (err) => err === missing }
    );
    await expect(measuring).rejects.toBe(missing);
    expect(calls).toBe(1);
  });

  describe("with --max-runs", () => {
    it("measures more pairs up to --max-runs when a metric is inconclusive for the worse, and decides once more with every run", async () => {
      const { measure, calls } = pages({ baseline: FAST_WITH_ONE_SLOW, current: SLOW });
      const { compare, decisions } = comparing();
      const { comparison, extended, baseline, current } = await measureLiveBaseline(measure, { runs: 5, maxRuns: 7, compare });
      expect(calls).toEqual([1, 2, 3, 4, 5, 6, 7].flatMap((i) => [`baseline ${i}`, `current ${i}`]));
      expect(decisions).toEqual([
        { baseline: 5, current: 5 },
        { baseline: 7, current: 7 },
      ]);
      expect(extended).toEqual({ after: 5, metrics: ["LCP"] });
      expect([baseline.runs.count, current.runs.count]).toEqual([7, 7]);
      // Seven runs a side tolerate one slow run of the baseline: p = 0.0131
      expect(comparison.metrics.LCP).toMatchObject({ verdict: "regressed", stats: { p: 0.0131 } });
    });

    it("says where the added runs go in the progress", async () => {
      const { measure } = pages({ baseline: FAST_WITH_ONE_SLOW, current: SLOW });
      const { compare } = comparing();
      const progress = [];
      const added = [];
      await measureLiveBaseline(measure, { runs: 5, maxRuns: 6, compare, onRun: (step) => progress.push(step), onExtend: (why) => added.push(why) });
      expect(added).toEqual([{ after: 5, metrics: ["LCP"], maxRuns: 6 }]);
      expect(progress.slice(-2)).toEqual([
        { side: "baseline", run: 6, runs: 6, step: 11, steps: 12 },
        { side: "current", run: 6, runs: 6, step: 12, steps: 12 },
      ]);
    });

    it("decides exactly twice, even when the metric is still inconclusive after --max-runs", async () => {
      // Two slow runs of the baseline among nine: p = 0.0252 at nine, but over 0.05 at five and at seven
      const twoSlow = [2000, 2010, 3600, 2030, 3700, 2050, 2060, 2070, 2080];
      const { measure, calls } = pages({ baseline: twoSlow, current: SLOW });
      const { compare, decisions } = comparing();
      const { comparison } = await measureLiveBaseline(measure, { runs: 5, maxRuns: 7, compare });
      expect(decisions).toHaveLength(2);
      expect(calls).toHaveLength(14);
      expect(comparison.metrics.LCP.verdict).toBe("inconclusive");
    });

    it("measures nothing more when the first decision is clear", async () => {
      const { measure, calls } = pages({ baseline: FAST, current: SLOW });
      const { compare, decisions } = comparing();
      const { comparison, extended } = await measureLiveBaseline(measure, { runs: 5, maxRuns: 9, compare });
      expect(calls).toHaveLength(10);
      expect(decisions).toHaveLength(1);
      expect(comparison.metrics.LCP.verdict).toBe("regressed");
      expect(extended).toBeUndefined();
    });

    it("measures nothing more for a metric inconclusive for the better", async () => {
      const { measure, calls } = pages({ baseline: SLOW, current: FAST_WITH_ONE_SLOW.map((v) => (v === 3600 ? 3100 : v)) });
      const { compare } = comparing();
      const { comparison, extended } = await measureLiveBaseline(measure, { runs: 5, maxRuns: 7, compare });
      expect(comparison.metrics.LCP).toMatchObject({ verdict: "inconclusive", delta: expect.any(Number) });
      expect(comparison.metrics.LCP.delta).toBeLessThan(0);
      expect(calls).toHaveLength(10);
      expect(extended).toBeUndefined();
    });

    it("measures nothing more without --max-runs, even when a metric is inconclusive for the worse", async () => {
      const { measure, calls } = pages({ baseline: FAST_WITH_ONE_SLOW, current: SLOW });
      const { compare } = comparing();
      const { comparison } = await measureLiveBaseline(measure, { runs: 5, compare });
      expect(comparison.metrics.LCP.verdict).toBe("inconclusive");
      expect(calls).toHaveLength(10);
    });
  });
});

describe("the options of a live baseline", () => {
  const parse = (options) => parseLiveBaseline({ baseline: "https://example.com/", ...options });

  it("tell a live baseline from a file and give --max-runs as a number", () => {
    expect(parse({ runs: 5, maxRuns: "7" })).toEqual({ live: true, maxRuns: 7 });
    expect(parse({})).toEqual({ live: true, maxRuns: undefined });
    expect(parseLiveBaseline({ baseline: "baseline.json" })).toEqual({ live: false, maxRuns: undefined });
    expect(parseLiveBaseline({})).toEqual({ live: false, maxRuns: undefined });
  });

  it.each([
    ["a live baseline with --matrix", { matrix: "matrix.json" }, /^A live baseline \(--baseline with a URL\) compares one page, so it does not take --matrix: give --matrix the --json output of an earlier matrix$/],
    ["a URL that is not one", { baseline: "https://" }, /^Invalid --baseline "https:\/\/": a live baseline is an http or https URL, such as https:\/\/example\.com or http:\/\/localhost:3000$/],
    ["--max-runs without a live baseline", { baseline: "baseline.json", runs: 5, maxRuns: "7" }, /^--max-runs needs a live baseline: --baseline with the URL of the page to compare with, such as --baseline https:\/\/example\.com$/],
    ["--max-runs without --baseline", { baseline: undefined, runs: 5, maxRuns: "7" }, /^--max-runs needs a live baseline/],
    ["--max-runs without --runs", { maxRuns: "7" }, /^--max-runs needs --runs, the runs of each page before it decides whether to measure more, such as --runs 5 --max-runs 7$/],
    ["--max-runs with fewer --runs than the statistics need", { runs: 3, maxRuns: "7" }, /^--max-runs needs --runs 5 or more: with fewer runs a side there are no statistics, so no metric is inconclusive and nothing more would be measured$/],
    ["--max-runs equal to --runs", { runs: 5, maxRuns: "5" }, /^Invalid --max-runs "5": use a whole number greater than --runs \(5\) and at most 9, such as 7$/],
    ["--max-runs under --runs", { runs: 5, maxRuns: "3" }, /^Invalid --max-runs "3"/],
    ["--max-runs over the most runs", { runs: 5, maxRuns: "10" }, /^Invalid --max-runs "10"/],
    ["--max-runs that is not a whole number", { runs: 5, maxRuns: "7.5" }, /^Invalid --max-runs "7\.5"/],
  ])("refuse %s with a message that says what to give", (_, options, message) => {
    expect(() => parse(options)).toThrow(message);
  });

  it("suggest a --max-runs that fits when --runs is 8", () => {
    expect(() => parse({ runs: 8, maxRuns: "8" })).toThrow('Invalid --max-runs "8": use a whole number greater than --runs (8) and at most 9, such as 9');
  });
});
