import { describe, it, expect } from "vitest";
import { readBaseline, loadBaseline, parseThreshold, thresholdsWith, DEFAULT_THRESHOLDS, compareRun, compareMatrix } from "../../src/baseline.js";
import { cliVersion } from "../../src/report-to.js";

const CONDITIONS = { viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000, cliVersion };

// A page as the JSON of the CLI gives it: one run, or the median run of several with their summary
function page({ url = "https://example.com/", metrics = {}, results = [], runs, conditions = CONDITIONS, throttling } = {}) {
  const metricResults = Object.entries(metrics).map(([metric, value]) => ({ id: metric, status: "ok", metric, value, unit: metric === "CLS" ? "score" : "ms" }));
  return {
    url,
    navMs: 900,
    results: [...metricResults, ...results],
    pageErrors: [],
    ...(throttling ? { throttling } : {}),
    ...(runs ? { runs } : {}),
    ...(conditions ? { conditions } : {}),
  };
}

// The runs field of a page measured several times, with the values of each run of each metric
function runsOf(valuesByMetric) {
  const summary = {};
  let count = 0;
  for (const [metric, values] of Object.entries(valuesByMetric)) {
    const sorted = [...values].sort((a, b) => a - b);
    summary[metric] = { median: sorted[Math.floor((sorted.length - 1) / 2)], min: sorted[0], max: sorted.at(-1), values, unit: metric === "CLS" ? "score" : "ms" };
    count = values.length;
  }
  return { count, failed: 0, medianRun: 1, medianBy: "LCP", summary };
}

const withIssue = (id, severity, message, extra = {}) => ({ id, status: "ok", issues: [{ severity, message, ...extra }] });
const compare = (base, current, options = {}) => compareRun(base, current, { file: "baseline.json", thresholds: DEFAULT_THRESHOLDS, ...options });

describe("reading a baseline", () => {
  it("tells a page from a matrix", () => {
    expect(readBaseline(JSON.stringify(page()), "base.json").kind).toBe("page");
    expect(readBaseline(JSON.stringify({ matrix: "matrix.json", runs: 3, combinations: [] }), "base.json").kind).toBe("matrix");
  });

  it("keeps the data and the name of the file", () => {
    const baseline = readBaseline(JSON.stringify(page({ metrics: { LCP: 2100 } })), "base.json");
    expect(baseline.file).toBe("base.json");
    expect(baseline.data.results[0].value).toBe(2100);
  });

  it("fails on a file that is not JSON", () => {
    expect(() => readBaseline("LCP 2100", "base.json")).toThrow(/base\.json is not JSON/);
  });

  it("fails on JSON that is not an output of the CLI, and says how to make one", () => {
    expect(() => readBaseline(JSON.stringify({ lcp: 2100 }), "base.json")).toThrow(/base\.json is not an output of webperf-snippets --json.*--json > base\.json/);
  });

  it("fails on a file that does not exist", () => {
    expect(() => loadBaseline("/nonexistent/base.json")).toThrow(/Cannot read the baseline \/nonexistent\/base\.json/);
  });
});

describe("a threshold given with --threshold", () => {
  it("is relative with %, absolute with ms, and absolute without a unit for CLS", () => {
    expect(parseThreshold("LCP=15%")).toEqual({ metric: "LCP", relative: 0.15 });
    expect(parseThreshold("LCP=200ms")).toEqual({ metric: "LCP", absolute: 200 });
    expect(parseThreshold("CLS=0.1")).toEqual({ metric: "CLS", absolute: 0.1 });
  });

  it("takes the metric in any case", () => {
    expect(parseThreshold("inp=50ms")).toEqual({ metric: "INP", absolute: 50 });
  });

  it.each([
    ["LCP=200", /unit/],
    ["CLS=10%", /CLS/],
    ["CLS=0.1ms", /CLS/],
    ["LCP=fast", /LCP=fast/],
    ["LCP=-5%", /LCP=-5%/],
    ["SI=10%", /Unknown metric "SI"/],
    ["LCP", /LCP/],
  ])("rejects %s", (raw, message) => {
    expect(() => parseThreshold(raw)).toThrow(message);
  });

  it("changes one part of the default and keeps the other", () => {
    const thresholds = thresholdsWith([parseThreshold("LCP=15%"), parseThreshold("TTFB=200ms")]);
    expect(thresholds.LCP).toEqual({ relative: 0.15, absolute: 100 });
    expect(thresholds.TTFB).toEqual({ relative: 0.1, absolute: 200 });
    expect(thresholds.FCP).toEqual(DEFAULT_THRESHOLDS.FCP);
  });
});

describe("the verdict of a metric", () => {
  it("is regressed when the change beats the threshold, which is the larger of its two parts", () => {
    const { metrics } = compare(page({ metrics: { LCP: 2100 } }), page({ metrics: { LCP: 2480 } }));
    expect(metrics.LCP).toEqual({ baseline: 2100, current: 2480, delta: 380, deltaPercent: 18.1, threshold: 210, verdict: "regressed" });
  });

  it("is unchanged under the absolute minimum, even when the relative change is large", () => {
    const { metrics } = compare(page({ metrics: { TTFB: 610 } }), page({ metrics: { TTFB: 520 } }));
    expect(metrics.TTFB).toMatchObject({ delta: -90, threshold: 100, verdict: "unchanged" });
  });

  it("is improved when it gets better by more than the threshold", () => {
    expect(compare(page({ metrics: { LCP: 2480 } }), page({ metrics: { LCP: 2100 } })).metrics.LCP.verdict).toBe("improved");
  });

  it("is unchanged when the change equals the threshold", () => {
    expect(compare(page({ metrics: { LCP: 2000 } }), page({ metrics: { LCP: 2200 } })).metrics.LCP).toMatchObject({ threshold: 200, verdict: "unchanged" });
  });

  it("uses the threshold given with --threshold", () => {
    const thresholds = thresholdsWith([parseThreshold("LCP=500ms")]);
    expect(compare(page({ metrics: { LCP: 2100 } }), page({ metrics: { LCP: 2480 } }), { thresholds }).metrics.LCP.verdict).toBe("unchanged");
  });

  it("compares CLS with its absolute threshold", () => {
    expect(compare(page({ metrics: { CLS: 0.04 } }), page({ metrics: { CLS: 0.12 } })).metrics.CLS).toMatchObject({ threshold: 0.05, verdict: "regressed" });
    expect(compare(page({ metrics: { CLS: 0.04 } }), page({ metrics: { CLS: 0.08 } })).metrics.CLS.verdict).toBe("unchanged");
  });

  it("compares the medians when there are runs", () => {
    const base = page({ metrics: { LCP: 9999 }, runs: runsOf({ LCP: [2000, 2100, 2200] }) });
    const current = page({ metrics: { LCP: 1 }, runs: runsOf({ LCP: [2400, 2500, 2600] }) });
    expect(compare(base, current).metrics.LCP).toMatchObject({ baseline: 2100, current: 2500, verdict: "regressed" });
  });

  it("is unchanged when the median of now stays inside the range of a baseline with several runs", () => {
    const base = page({ runs: runsOf({ LCP: [1700, 2100, 2600] }) });
    expect(compare(base, page({ metrics: { LCP: 2400 } })).metrics.LCP.verdict).toBe("unchanged");
    expect(compare(base, page({ metrics: { LCP: 2700 } })).metrics.LCP.verdict).toBe("regressed");
    expect(compare(base, page({ metrics: { LCP: 1800 } })).metrics.LCP.verdict).toBe("unchanged");
    expect(compare(base, page({ metrics: { LCP: 1500 } })).metrics.LCP.verdict).toBe("improved");
  });

  // With five runs or more a side, a change must also be unlikely to come from the noise of the runs:
  // Mann-Whitney U, one-sided, p < 0.05. The p-values come from scipy (see tests/unit/stats.test.js).
  it("is regressed with five runs a side when the change beats the threshold and p < 0.05, even inside the range of the baseline", () => {
    const base = page({ runs: runsOf({ LCP: [2100, 2120, 2150, 2180, 2700] }) });
    const current = page({ runs: runsOf({ LCP: [2600, 2620, 2650, 2720, 2750] }) });
    const lcp = compare(base, current).metrics.LCP;
    expect(lcp).toMatchObject({ baseline: 2150, current: 2650, verdict: "regressed" });
    expect(lcp.stats).toEqual({ p: 0.0278, shift: 500, ci: [20, 600], method: "exact" });
  });

  it("is unchanged with five runs a side when the change beats the threshold but the runs give no evidence", () => {
    // Three runs much slower and two faster: the median moved, the runs do not say the page did
    const base = page({ runs: runsOf({ LCP: [2100, 2140, 2175, 2210, 2250] }) });
    const current = page({ runs: runsOf({ LCP: [2000, 2050, 2900, 2950, 3000] }) });
    const lcp = compare(base, current).metrics.LCP;
    expect(lcp).toMatchObject({ baseline: 2175, current: 2900, verdict: "unchanged" });
    expect(lcp.stats.p).toBe(0.3452);
  });

  it("is improved with five runs a side when it gets better beyond the threshold and p < 0.05", () => {
    const base = page({ runs: runsOf({ LCP: [2600, 2620, 2650, 2720, 2750] }) });
    const current = page({ runs: runsOf({ LCP: [2100, 2120, 2150, 2180, 2700] }) });
    const lcp = compare(base, current).metrics.LCP;
    expect(lcp.verdict).toBe("improved");
    expect(lcp.stats).toEqual({ p: 0.0278, shift: -500, ci: [-600, -20], method: "exact" });
  });

  it("keeps the rule of the range, with no statistics, under five runs a side", () => {
    const base = page({ runs: runsOf({ LCP: [2100, 2120, 2700] }) });
    const current = page({ runs: runsOf({ LCP: [2600, 2650, 2750] }) });
    const lcp = compare(base, current).metrics.LCP;
    expect(lcp.verdict).toBe("unchanged");
    expect(lcp.stats).toBeUndefined();
  });

  it("leaves out the runs that failed from the statistics", () => {
    const base = page({ runs: runsOf({ LCP: [2100, 2120, 2150, 2180, 2700, null] }) });
    const current = page({ runs: runsOf({ LCP: [2600, 2620, 2650, 2720, 2750] }) });
    expect(compare(base, current).metrics.LCP.stats.p).toBe(0.0278);
  });

  it("is not measured when one side lacks the metric, never a regression", () => {
    const { metrics } = compare(page({ metrics: { LCP: 2100, INP: 120 } }), page({ metrics: { LCP: 2100 } }));
    expect(metrics.INP).toEqual({ baseline: 120, verdict: "not measured" });
    expect(Object.keys(metrics)).toEqual(["LCP", "INP"]);
  });
});

describe("the errors", () => {
  const blocking = (message) => withIssue("render-blocking", "error", message);

  it("are new when only this run has them, and fixed when only the baseline had them", () => {
    const { errors } = compare(
      page({ results: [withIssue("image-audit", "error", "hero.png: Add fetchpriority")] }),
      page({ results: [blocking("3 render-blocking stylesheets delay rendering until 900ms")] })
    );
    expect(errors.new).toEqual([{ id: "render-blocking", message: "3 render-blocking stylesheets delay rendering until 900ms" }]);
    expect(errors.fixed).toEqual([{ id: "image-audit", message: "hero.png: Add fetchpriority" }]);
  });

  it("are the same error when only their figures change", () => {
    const { errors } = compare(
      page({ results: [blocking("Render-blocking CSS (69.21 KB) exceeds the 14 KB critical budget")] }),
      page({ results: [blocking("Render-blocking CSS (71.80 KB) exceeds the 14 KB critical budget")] })
    );
    expect(errors).toEqual({ new: [], fixed: [] });
  });

  it("are the same error when they share a code, whatever their messages say", () => {
    const { errors } = compare(
      page({ results: [withIssue("ttfb", "error", "TTFB is slow", { code: "ttfb-slow-server" })] }),
      page({ results: [withIssue("ttfb", "error", "The server takes too long to answer", { code: "ttfb-slow-server" })] })
    );
    expect(errors).toEqual({ new: [], fixed: [] });
  });

  it("are two errors when they share a code and name different resources", () => {
    const used = (target) => withIssue("prefetch", "error", `${target.split("/").pop()}: Resource used on current page`, { code: "used-on-current-page", target });
    const { errors } = compare(page({ results: [used("https://example.com/a.js")] }), page({ results: [used("https://example.com/b.js")] }));
    expect(errors.new).toEqual([{ id: "prefetch", message: "b.js: Resource used on current page", code: "used-on-current-page", target: "https://example.com/b.js" }]);
    expect(errors.fixed.map((e) => e.target)).toEqual(["https://example.com/a.js"]);
  });

  it("compare a resource of the page by its path and query, so a review app on another host matches main", () => {
    const used = (target) => withIssue("prefetch", "error", "Resource used on current page", { code: "used-on-current-page", target });
    const { errors } = compare(
      page({ url: "https://example.com/", results: [used("https://example.com/app.js?v=1"), used("https://cdn.example.org/lib.js")] }),
      page({ url: "https://pr-12.example.net/", results: [used("https://pr-12.example.net/app.js?v=1"), used("https://cdn2.example.org/lib.js")] })
    );
    expect(errors.new.map((e) => e.target)).toEqual(["https://cdn2.example.org/lib.js"]);
    expect(errors.fixed.map((e) => e.target)).toEqual(["https://cdn.example.org/lib.js"]);
  });

  it("pair by message a snippet whose errors have no code in the baseline, as one of 1.4.0", () => {
    const { errors } = compare(
      page({ results: [blocking("2 blocking script(s) in <head>")] }),
      page({ results: [withIssue("render-blocking", "error", "3 blocking script(s) in <head>", { code: "blocking-in-head" })] })
    );
    expect(errors).toEqual({ new: [], fixed: [] });
  });

  it("leave out warnings and information, which change too easily", () => {
    const { errors } = compare(page(), page({ results: [withIssue("fonts", "warning", "2 fonts are not preloaded"), withIssue("fonts", "info", "4 fonts")] }));
    expect(errors).toEqual({ new: [], fixed: [] });
  });

  it("follow the rule of the exit code: a snippet that failed counts, a follow-up does not", () => {
    const failedSnippet = { id: "lcp", status: "error", error: "No LCP entries buffered" };
    const followUp = { ...blocking("A follow-up error"), reason: "LCP is poor" };
    expect(compare(page(), page({ results: [failedSnippet, followUp] })).errors.new).toEqual([{ id: "lcp", message: "No LCP entries buffered" }]);
  });
});

describe("the warnings of a comparison", () => {
  const warningsOf = (base, current) => compare(base, current).warnings;

  it("are none when both were measured the same way, also on another host", () => {
    const base = page({ runs: runsOf({ LCP: [1, 2, 3] }) });
    const current = page({ url: "https://pr-123.example.net/", runs: runsOf({ LCP: [1, 2, 3] }) });
    expect(warningsOf(base, current)).toEqual([]);
  });

  it("say when the machine of the baseline was more than 35 % faster or slower, or had other cores", () => {
    const on = (machine) => page({ conditions: { ...CONDITIONS, machine }, runs: runsOf({ LCP: [1, 2, 3] }) });
    expect(warningsOf(on({ cores: 8, benchmarkIndex: 1000 }), on({ cores: 8, benchmarkIndex: 600 }))).toContain(
      "the baseline was measured on a machine 67% faster than this one (benchmark index 1000 against 600, 8 cores both); timings can differ for that alone"
    );
    expect(warningsOf(on({ cores: 8, benchmarkIndex: 1000 }), on({ cores: 4, benchmarkIndex: 1400 }))).toContain(
      "the baseline was measured on a machine 29% slower than this one (benchmark index 1000 against 1400, 8 cores against 4); timings can differ for that alone"
    );
    expect(warningsOf(on({ cores: 8, benchmarkIndex: 1000 }), on({ cores: 8, benchmarkIndex: 1300 }))).toEqual([]);
    // A baseline from a CLI without the machine says nothing of it
    expect(warningsOf(page({ runs: runsOf({ LCP: [1, 2, 3] }) }), on({ cores: 8, benchmarkIndex: 600 }))).toEqual([]);
  });

  it("say when the baseline comes from a CLI without conditions", () => {
    expect(warningsOf(page({ conditions: null }), page())).toContain(
      "the baseline comes from a CLI without conditions (1.3.0 or earlier); it cannot say how it was measured"
    );
  });

  it("name a different workflow, snippet, viewport or wait", () => {
    expect(warningsOf(page({ conditions: { ...CONDITIONS, workflow: "loading" } }), page())).toContain(
      "the baseline was measured with workflow loading, and this run with workflow core-web-vitals"
    );
    const snippet = { viewport: "mobile", snippet: "CoreWebVitals/LCP", waitMs: 3000, cliVersion };
    expect(warningsOf(page({ conditions: snippet }), page())).toContain(
      "the baseline was measured with snippet CoreWebVitals/LCP, and this run with workflow core-web-vitals"
    );
    expect(warningsOf(page({ conditions: { ...CONDITIONS, viewport: "desktop" } }), page())).toContain(
      "the baseline was measured on desktop, and this run on mobile"
    );
    expect(warningsOf(page({ conditions: { ...CONDITIONS, waitMs: 1000 } }), page())).toContain(
      "the baseline waited 1000 ms after the load, and this run 3000 ms"
    );
  });

  it("name a different throttling", () => {
    expect(warningsOf(page(), page({ throttling: { cpu: 4, network: "slow-4g" } }))).toContain(
      "the baseline was measured without throttling, and this run with CPU 4x, Slow 4G"
    );
  });

  it("say that a baseline of one run has no range, and name a different number of runs", () => {
    expect(warningsOf(page(), page())).toContain("the baseline has 1 run, so only the thresholds apply; measure both with --runs");
    expect(warningsOf(page({ runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) }), page({ runs: runsOf({ LCP: [1, 2, 3] }) }))).toContain(
      "the baseline has 5 runs, and this run 3"
    );
  });

  it("name a different version of the CLI, whose snippets may have changed", () => {
    expect(warningsOf(page({ conditions: { ...CONDITIONS, cliVersion: "1.3.1" } }), page())).toContain(
      `the baseline was measured with CLI 1.3.1, and this run with ${cliVersion}; the snippets may have changed`
    );
  });

  it("name a different path or query, not a different host", () => {
    const base = page({ url: "https://example.com/news/" });
    expect(warningsOf(base, page({ url: "https://example.com/home" }))).toContain("the baseline measured /news/ and this run /home");
    expect(warningsOf(base, page({ url: "https://example.com/news/?ab=b" }))).toContain("the baseline measured /news/ and this run /news/?ab=b");
    expect(warningsOf(base, page({ url: "https://pr-9.example.net/news/" })).filter((w) => w.includes("measured /"))).toEqual([]);
  });

  it("go with the file, the URL and the runs of the baseline", () => {
    const comparison = compare(page({ url: "https://example.com/news/" }), page());
    expect(comparison).toMatchObject({ file: "baseline.json", url: "https://example.com/news/", runs: { count: 1 } });
    expect(compare(page({ runs: runsOf({ LCP: [1, 2, 3] }) }), page()).runs).toEqual({ count: 3, medianBy: "LCP" });
  });
});

describe("a matrix against a baseline matrix", () => {
  const combination = (id, lcp) => ({ id, name: id.split(" · ")[0], device: "mobile", ...page({ metrics: { LCP: lcp }, runs: runsOf({ LCP: [lcp, lcp, lcp] }) }) });
  const matrix = (...combinations) => ({ matrix: "matrix.json", runs: 3, combinations });

  it("compares each combination with the one of the same id", () => {
    const { combinations } = compareMatrix(matrix(combination("home · mobile", 2100), combination("news · mobile", 1800)), matrix(combination("news · mobile", 2400), combination("home · mobile", 2100)), {
      file: "last-week.json",
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(combinations["home · mobile"].metrics.LCP.verdict).toBe("unchanged");
    expect(combinations["news · mobile"].metrics.LCP).toMatchObject({ baseline: 1800, current: 2400, verdict: "regressed" });
  });

  it("lists the combinations that only one side has", () => {
    const { root, combinations } = compareMatrix(matrix(combination("home · mobile", 2100), combination("old · mobile", 1800)), matrix(combination("home · mobile", 2100), combination("new · mobile", 1500)), {
      file: "last-week.json",
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(root).toEqual({ file: "last-week.json", added: ["new · mobile"], missing: ["old · mobile"], warnings: [] });
    expect(Object.keys(combinations)).toEqual(["home · mobile"]);
  });
});
