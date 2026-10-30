import { describe, it, expect } from "vitest";
import { baselineView, describeRegressions, changeCell, matrixComparisonView, describeMatrixRegressions } from "../../src/reporters/baseline-view.js";

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

  it("gives the evidence of a change measured with five runs a side, and says when there is none", () => {
    const { rows } = baselineView(
      comparison({
        LCP: { baseline: 2150, current: 2650, delta: 500, deltaPercent: 23.3, threshold: 215, verdict: "regressed", stats: { p: 0.0278, shift: 500, ci: [20, 600], method: "exact" } },
        FCP: { baseline: 2175, current: 2900, delta: 725, deltaPercent: 33.3, threshold: 217.5, verdict: "unchanged", stats: { p: 0.3452, shift: 700, ci: [-175, 825], method: "exact" } },
        CLS: { baseline: 0.1, current: 0.02, delta: -0.08, deltaPercent: -80, threshold: 0.05, verdict: "improved", stats: { p: 0.004, shift: -0.08, ci: [-0.09, -0.07], method: "exact" } },
      })
    );
    expect(rows.map((r) => r.note)).toEqual([
      "p = 0.028, +500ms, 95% CI +20ms to +600ms",
      "no evidence: p = 0.35",
      "p = 0.004, −0.0800, 95% CI −0.0900 to −0.0700",
    ]);
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

describe("the change cell of a matrix", () => {
  it("shows the change only when it counts, so the table reads at a glance", () => {
    expect(changeCell("LCP", { delta: 380, deltaPercent: 18.1, threshold: 210, verdict: "regressed" })).toEqual({ text: "▲ +380ms", verdict: "regressed" });
    expect(changeCell("TTFB", { delta: -400, deltaPercent: -44, threshold: 100, verdict: "improved" })).toEqual({ text: "▼ −400ms", verdict: "improved" });
    expect(changeCell("CLS", { delta: 0.08, deltaPercent: 200, threshold: 0.05, verdict: "regressed" })).toEqual({ text: "▲ +0.0800", verdict: "regressed" });
    expect(changeCell("LCP", { delta: 40, deltaPercent: 2, threshold: 210, verdict: "unchanged" })).toEqual({ text: "=", verdict: "unchanged" });
    expect(changeCell("INP", { baseline: 120, verdict: "not measured" })).toEqual({ text: "·", verdict: "not measured" });
  });
});

describe("the comparison of a matrix", () => {
  const combo = (id, { warnings = [], errors = { new: [], fixed: [] }, metrics = {} } = {}) => ({ id, baseline: comparison(metrics, { warnings, errors }) });

  it("gives a warning that every combination has once, and names the combinations of the others", () => {
    const view = matrixComparisonView({ file: "last-week.json", added: [], missing: [], warnings: [] }, [
      combo("home · mobile", { warnings: ["the baseline has 1 run, so only the thresholds apply; measure both with --runs", "the baseline measured /a and this run /b"] }),
      combo("news · mobile", { warnings: ["the baseline has 1 run, so only the thresholds apply; measure both with --runs"] }),
      { id: "about · mobile" },
    ]);
    expect(view.warnings).toEqual(["the baseline has 1 run, so only the thresholds apply; measure both with --runs", "home · mobile: the baseline measured /a and this run /b"]);
  });

  it("lists the errors with their combination, and the combinations only one side has", () => {
    const view = matrixComparisonView({ file: "last-week.json", added: ["about · mobile"], missing: ["legacy · mobile"], warnings: [] }, [
      combo("home · mobile", { errors: { new: [{ id: "render-blocking", message: "1 render-blocking resource" }], fixed: [{ id: "fonts", message: "old" }] } }),
    ]);
    expect(view).toMatchObject({
      file: "last-week.json",
      newErrors: ["home · mobile: render-blocking: 1 render-blocking resource"],
      fixedErrors: ["home · mobile: fonts: old"],
      added: ["about · mobile"],
      missing: ["legacy · mobile"],
    });
  });

  it("names the combination of each regression", () => {
    const regressed = { LCP: { baseline: 2100, current: 2480, delta: 380, deltaPercent: 18.1, threshold: 210, verdict: "regressed" } };
    expect(describeMatrixRegressions([combo("product · mobile", { metrics: regressed }), combo("home · mobile"), { id: "about · mobile" }])).toEqual(["product · mobile: LCP ▲ +380ms (+18%)"]);
  });
});
