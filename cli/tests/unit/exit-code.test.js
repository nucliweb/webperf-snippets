import { describe, it, expect } from "vitest";
import { pageOutcome, matrixOutcome } from "../../src/exit-code.js";

const nothing = { budgetViolations: [], regressions: [], inconclusive: [], against: "base.json" };

describe("pageOutcome", () => {
  it("exits with 0 and says nothing when nothing failed", () => {
    expect(pageOutcome({ ...nothing, failing: false })).toEqual({ lines: [], code: 0 });
  });

  it("exits with 1 for issues that fail, without a line: the report has them", () => {
    expect(pageOutcome({ ...nothing, failing: true })).toEqual({ lines: [], code: 1 });
  });

  it("names each budget that failed, and stops there", () => {
    expect(pageOutcome({ ...nothing, budgetViolations: ["LCP 3000ms exceeds the budget of 2500ms"], regressions: ["LCP regressed"], failing: false })).toEqual({
      lines: ["Budget violation: LCP 3000ms exceeds the budget of 2500ms"],
      code: 1,
    });
  });

  it("names the regressions and the inconclusive metrics against the baseline", () => {
    expect(pageOutcome({ ...nothing, regressions: ["LCP regressed"], inconclusive: ["CLS is inconclusive"], failing: false })).toEqual({
      lines: ["Regression against base.json: LCP regressed", "Inconclusive against base.json: CLS is inconclusive"],
      code: 1,
    });
  });
});

describe("matrixOutcome", () => {
  it("exits with 0 when no combination failed", () => {
    expect(matrixOutcome({ ...nothing, failed: false })).toEqual({ lines: [], code: 0 });
  });

  it("exits with 1 when a combination failed or has issues that fail", () => {
    expect(matrixOutcome({ ...nothing, failed: true })).toEqual({ lines: [], code: 1 });
  });

  it("says everything that failed, the budgets and the comparison", () => {
    expect(matrixOutcome({ budgetViolations: ["LCP over (home-mobile)"], regressions: ["home-mobile: LCP"], inconclusive: ["home-desktop: CLS"], against: "base.json", failed: false })).toEqual({
      lines: ["Budget violation: LCP over (home-mobile)", "Regression against base.json in home-mobile: LCP", "Inconclusive against base.json in home-desktop: CLS"],
      code: 1,
    });
  });
});
