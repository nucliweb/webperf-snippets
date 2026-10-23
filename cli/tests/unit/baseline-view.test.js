import { describe, it, expect } from "vitest";
import { baselineView, describeRegressions } from "../../src/reporters/baseline-view.js";

// A comparison as compareRun gives it
const comparison = (metrics, { errors = { new: [], fixed: [] }, warnings = [], runs = { count: 5, medianBy: "LCP" } } = {}) => ({
  file: "baseline.json",
  url: "https://example.com/",
  runs,
  metrics,
  errors,
  warnings,
});

describe("the view of a comparison with a baseline", () => {
  it("names the baseline, its URL and its runs", () => {
    expect(baselineView(comparison({})).summary).toBe("https://example.com/, 5 runs, median by LCP");
    expect(baselineView(comparison({}, { runs: { count: 1 } })).summary).toBe("https://example.com/, 1 run");
  });

  it("draws the change with its direction, in milliseconds and percent, or as a score for CLS", () => {
    const { rows } = baselineView(
      comparison({
        LCP: { baseline: 2100, current: 2480, delta: 380, deltaPercent: 18.1, threshold: 210, verdict: "regressed" },
        TTFB: { baseline: 610, current: 520, delta: -90, deltaPercent: -14.8, threshold: 100, verdict: "unchanged" },
        CLS: { baseline: 0.04, current: 0.038, delta: -0.002, deltaPercent: -5, threshold: 0.05, verdict: "unchanged" },
        FCP: { baseline: 900, current: 900, delta: 0, deltaPercent: 0, threshold: 100, verdict: "unchanged" },
      })
    );
    expect(rows.map((r) => r.change)).toEqual(["▲ +380ms (+18%)", "▼ −90ms (−15%)", "▼ −0.0020", "= 0ms (0%)"]);
  });

  it("says why a change is unchanged: under the threshold, or inside the range of the baseline", () => {
    const { rows } = baselineView(
      comparison({
        TTFB: { baseline: 610, current: 520, delta: -90, deltaPercent: -14.8, threshold: 100, verdict: "unchanged" },
        LCP: { baseline: 2100, current: 2400, delta: 300, deltaPercent: 14.3, threshold: 210, verdict: "unchanged" },
        CLS: { baseline: 0.04, current: 0.06, delta: 0.02, deltaPercent: 50, threshold: 0.05, verdict: "unchanged" },
        FCP: { baseline: 900, current: 900, delta: 0, deltaPercent: 0, threshold: 100, verdict: "unchanged" },
      })
    );
    expect(rows.map((r) => r.note)).toEqual(["under 100ms", "inside the range of the baseline", "under 0.05", null]);
  });

  it("keeps a metric that one side did not measure, with no change", () => {
    const { rows } = baselineView(comparison({ INP: { baseline: 120, verdict: "not measured" } }));
    expect(rows).toEqual([{ metric: "INP", unit: "ms", baseline: 120, current: undefined, change: null, verdict: "not measured", note: null }]);
  });
});

describe("the regressions that decide the exit code", () => {
  it("are the metrics that regressed and the new errors, never the improvements or the fixed errors", () => {
    const regressions = describeRegressions(
      comparison(
        {
          LCP: { baseline: 2100, current: 2480, delta: 380, deltaPercent: 18.1, threshold: 210, verdict: "regressed" },
          TTFB: { baseline: 900, current: 500, delta: -400, deltaPercent: -44.4, threshold: 100, verdict: "improved" },
        },
        { errors: { new: [{ id: "render-blocking", message: "1 render-blocking resource(s) delay rendering until 25ms" }], fixed: [{ id: "fonts", message: "old" }] } }
      )
    );
    expect(regressions).toEqual(["LCP ▲ +380ms (+18%)", "new error render-blocking: 1 render-blocking resource(s) delay rendering until 25ms"]);
  });

  it("are none when nothing got worse", () => {
    expect(describeRegressions(comparison({ LCP: { baseline: 2100, current: 2150, delta: 50, deltaPercent: 2.4, threshold: 210, verdict: "unchanged" } }))).toEqual([]);
  });
});
