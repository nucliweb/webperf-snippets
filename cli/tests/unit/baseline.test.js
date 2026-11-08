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
    const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
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

  it("never suggests writing over the file it could not read: it may be anything, and an agent may follow the message", () => {
    const messageOf = (text) => {
      try {
        readBaseline(text, ".env");
      } catch (err) {
        return err.message;
      }
    };
    for (const text of ["TOKEN=secret", '{"token":"secret"}']) {
      expect(messageOf(text)).not.toContain("> .env");
      expect(messageOf(text)).not.toContain("secret");
      expect(messageOf(text)).toContain("webperf-snippets <url> --json");
    }
  });

  it("fails on a file that is not JSON", () => {
    expect(() => readBaseline("LCP 2100", "base.json")).toThrow(/base\.json is not JSON/);
  });

  it("fails on JSON that is not an output of the CLI, and says how to make one", () => {
    expect(() => readBaseline(JSON.stringify({ lcp: 2100 }), "base.json")).toThrow(/base\.json is not an output of webperf-snippets --json.*a file saved with webperf-snippets <url> --json/);
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

  // The same words for the CLI and the MCP server, whose agent has no --threshold to use
  it.each(["LCP=200", "CLS=10%", "LCP=fast", "SI=10%"])("says what is wrong with %s without naming a flag", (raw) => {
    expect(() => parseThreshold(raw)).toThrow(/threshold/);
    expect(() => parseThreshold(raw)).not.toThrow(/--/);
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

  // The CLI names the result of --snippet as it was typed, and the MCP server by its path
  it("are the same error for one snippet asked by an alias on one side and by its path on the other", () => {
    const snippet = { viewport: "mobile", snippet: "Loading/Find-render-blocking-resources", waitMs: 3000, cliVersion };
    const error = (id) => withIssue(id, "error", "1 blocking script(s) in <head>", { code: "blocking-in-head", target: "/app.js" });
    const { errors } = compare(
      page({ conditions: snippet, results: [error("render-blocking")] }),
      page({ conditions: snippet, results: [error("Loading/Find-render-blocking-resources")] })
    );
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
    const base = page({ runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) });
    const current = page({ url: "https://pr-123.example.net/", runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) });
    expect(warningsOf(base, current)).toEqual([]);
  });

  // A benchmark index moves by 40 % on the same machine, with its load or with the cores the system
  // picks (performance or efficiency), so the machine is told apart by what the system reports of it
  it("say when the baseline was measured on another CPU or with other cores, never for a different benchmark index", () => {
    const m4 = { cpu: "Apple M4", cores: 10, arch: "arm64", memoryGB: 16, benchmarkIndex: 2300 };
    const epyc = { cpu: "AMD EPYC 7763 64-Core Processor", cores: 4, arch: "x64", memoryGB: 16, benchmarkIndex: 980 };
    const on = (machine) => page({ conditions: { ...CONDITIONS, machine }, runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) });
    expect(warningsOf(on(epyc), on(m4))).toContain(
      "the baseline was measured on another machine (AMD EPYC 7763 64-Core Processor, 4 cores) than this run (Apple M4, 10 cores); timings can differ for that alone"
    );
    expect(warningsOf(on(m4), on({ ...m4, cores: 8 }))).toContain(
      "the baseline was measured on another machine (Apple M4, 10 cores) than this run (Apple M4, 8 cores); timings can differ for that alone"
    );
    expect(warningsOf(on(m4), on({ ...m4, benchmarkIndex: 1100 }))).toEqual([]);
    // A baseline from a CLI without the machine says nothing of it
    expect(warningsOf(page({ runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) }), on(m4))).toEqual([]);
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

  // Pages that name their throttling in their conditions too, as the CLI and the MCP server write them:
  // one warning for it, and none when both ran under the same one
  it("name a different throttling once when the conditions name it too", () => {
    const throttled = (cpu, network) => page({ throttling: { cpu, ...(network ? { network } : {}) }, conditions: { ...CONDITIONS, cpu, ...(network ? { network } : {}) } });
    const warnings = warningsOf(throttled(4), throttled(2, "slow-4g"));
    expect(warnings.filter((w) => /throttling|CPU/.test(w))).toEqual(["the baseline was measured with CPU 4x, and this run with CPU 2x, Slow 4G"]);
    expect(warningsOf(throttled(4), throttled(4)).filter((w) => /throttling|CPU/.test(w))).toEqual([]);
  });

  it("say that a baseline of one run has no range, and name a different number of runs", () => {
    expect(warningsOf(page(), page())).toContain("the baseline has 1 run, so only the thresholds apply; measure both with 5 runs or more");
    expect(warningsOf(page({ runs: runsOf({ LCP: [1, 2, 3, 4, 5] }) }), page({ runs: runsOf({ LCP: [1, 2, 3] }) }))).toContain(
      "the baseline has 5 runs, and this run 3"
    );
  });

  describe("say which metrics have no statistics", () => {
    const FIVE = [2100, 2120, 2150, 2180, 2700];
    const NEEDED = "they need 5 a side, so measure both with 5 runs or more";
    const withFailed = (values, failed) => ({ ...runsOf(values), failed });

    it("when a failed run leaves the baseline or this run with four values", () => {
      const five = page({ runs: runsOf({ LCP: FIVE }) });
      const fourOfFive = page({ runs: withFailed({ LCP: [2600, null, 2620, 2650, 2720] }, 1) });
      expect(compare(fourOfFive, five).metrics.LCP.stats).toBeUndefined();
      expect(warningsOf(fourOfFive, five)).toEqual([`no statistics for LCP: the baseline has 4 values after 1 failed run, and this run 5; ${NEEDED}`]);
      expect(warningsOf(five, fourOfFive)).toEqual([`no statistics for LCP: the baseline has 5 values, and this run 4 after 1 failed run; ${NEEDED}`]);
    });

    it("name the failed runs of both sides", () => {
      const base = page({ runs: withFailed({ LCP: [2600, null, 2620, 2650, null] }, 2) });
      const current = page({ runs: withFailed({ LCP: [2600, null, 2620, 2650, 2720] }, 1) });
      expect(warningsOf(base, current)).toEqual([`no statistics for LCP: the baseline has 3 values after 2 failed runs, and this run 4 after 1 failed run; ${NEEDED}`]);
    });

    it("with three runs a side, in one line for the metrics that share their numbers", () => {
      const runs = () => runsOf({ LCP: [2000, 2100, 2200], TTFB: [100, 110, 120], CLS: [0, 0, 0] });
      expect(warningsOf(page({ runs: runs() }), page({ runs: runs() }))).toEqual([`no statistics for LCP, TTFB, CLS: the baseline has 3 values, and this run 3; ${NEEDED}`]);
    });

    it("in a line for each set of numbers", () => {
      const base = page({ runs: withFailed({ LCP: [1, 2, 3, null], TTFB: [1, 2, 3, null], INP: [1, 2, null, null] }, 1) });
      const current = page({ runs: runsOf({ LCP: [1, 2, 3, 4], TTFB: [1, 2, 3, 4], INP: [1, 2, 3, 4] }) });
      expect(warningsOf(base, current)).toEqual([
        `no statistics for LCP, TTFB: the baseline has 3 values after 1 failed run, and this run 4; ${NEEDED}`,
        `no statistics for INP: the baseline has 2 values after 1 failed run, and this run 4; ${NEEDED}`,
      ]);
    });

    it("never when a metric has its statistics, also after a failed run", () => {
      const base = page({ runs: withFailed({ LCP: [...FIVE, null] }, 1) });
      const current = page({ runs: withFailed({ LCP: [null, ...FIVE] }, 1) });
      expect(compare(base, current).metrics.LCP.stats).toBeDefined();
      expect(warningsOf(base, current)).toEqual([]);
    });

    // The runs of a page without interactions measure no INP, and some runs of a page may miss a metric
    it("for the metric that some runs did not measure, with no failed run to blame", () => {
      const base = page({ runs: runsOf({ LCP: FIVE, INP: [80, null, 90, null, 100] }) });
      const current = page({ runs: runsOf({ LCP: FIVE, INP: [80, 85, 90, 95, 100] }) });
      const { metrics, warnings } = compare(base, current);
      expect(metrics.LCP.stats).toBeDefined();
      expect(metrics.INP.stats).toBeUndefined();
      expect(warnings).toEqual([`no statistics for INP: the baseline has 3 values, and this run 5; ${NEEDED}`]);
    });

    it("with 1 value in the singular", () => {
      const base = page({ runs: runsOf({ LCP: FIVE, INP: [null, 90, null, null, null] }) });
      const current = page({ runs: runsOf({ LCP: FIVE, INP: [80, 85, 90, 95, 100] }) });
      expect(warningsOf(base, current)).toEqual([`no statistics for INP: the baseline has 1 value, and this run 5; ${NEEDED}`]);
    });

    // There is no comparison to back: its verdict is "not measured", and the reports show it
    it("never for a metric that one side lacks", () => {
      const base = page({ runs: runsOf({ LCP: FIVE, INP: FIVE }) });
      const current = page({ runs: runsOf({ LCP: FIVE }) });
      expect(compare(base, current).metrics.INP.verdict).toBe("not measured");
      expect(warningsOf(base, current)).toEqual([]);
      expect(warningsOf(current, base)).toEqual([]);
    });

    it("leaves a baseline of one run to its own warning", () => {
      const one = "the baseline has 1 run, so only the thresholds apply; measure both with 5 runs or more";
      expect(warningsOf(page({ metrics: { LCP: 2100 } }), page({ metrics: { LCP: 2100 } }))).toEqual([one]);
      expect(warningsOf(page({ metrics: { LCP: 2100 } }), page({ runs: runsOf({ LCP: FIVE }) }))).toEqual([one]);
    });

    it("next to the warning of a different number of runs, which does not say what it cost", () => {
      const base = page({ runs: runsOf({ LCP: FIVE }) });
      expect(warningsOf(base, page({ runs: runsOf({ LCP: [2100, 2200, 2300] }) }))).toEqual([
        "the baseline has 5 runs, and this run 3",
        `no statistics for LCP: the baseline has 5 values, and this run 3; ${NEEDED}`,
      ]);
    });

    it("counts one run without a runs field as one value", () => {
      const base = page({ runs: runsOf({ LCP: FIVE }) });
      expect(warningsOf(base, page({ metrics: { LCP: 2100 } }))).toContain(`no statistics for LCP: the baseline has 5 values, and this run 1; ${NEEDED}`);
    });

    it("in words for both interfaces, with no flag of the CLI", () => {
      const three = () => page({ runs: runsOf({ LCP: [1, 2, 3] }) });
      const [warning] = warningsOf(three(), three());
      expect(warning).toContain("measure both with 5 runs or more");
      expect(warning).not.toContain("--");
    });
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
