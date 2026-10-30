import { describe, it, expect } from "vitest";
import { mannWhitneyGreater, hodgesLehmann } from "../../src/stats.js";

// Reference values computed apart from stats.js on 2026-10-30, with scipy 1.18.1:
//   mannwhitneyu(current, base, alternative="greater", method="exact")       for samples without ties
//   mannwhitneyu(current, base, alternative="greater", method="asymptotic")  for samples with ties or over 16
// and the Hodges-Lehmann intervals by brute force over every split of the pooled sample.
const A = { base: [2100, 2120, 2150, 2180, 2700], current: [2600, 2620, 2650, 2720, 2750] };
const B = { base: [2100, 2140, 2175, 2210, 2250], current: [2000, 2050, 2900, 2950, 3000] };

describe("mannWhitneyGreater", () => {
  it("gives the exact one-sided p-value of small samples without ties", () => {
    // A regression the range of the baseline hides: its worst run, 2700, is above most of the current ones
    expect(mannWhitneyGreater(A.current, A.base)).toEqual({ u: 22, p: expect.closeTo(0.027778, 6), method: "exact" });
    // Three runs much slower and two faster: no evidence that the current runs are slower
    expect(mannWhitneyGreater(B.current, B.base).p).toBeCloseTo(0.345238, 6);
  });

  it("answers the other direction by swapping the samples", () => {
    expect(mannWhitneyGreater(A.base, A.current).p).toBeCloseTo(0.984127, 6);
  });

  it("uses the normal approximation, with the tie and continuity corrections, for samples with ties", () => {
    const r = mannWhitneyGreater([110, 120, 140, 150, 150], [100, 100, 110, 120, 130]);
    expect(r).toEqual({ u: 21, p: expect.closeTo(0.045344, 6), method: "normal" });
  });

  it("uses the normal approximation for samples over 16", () => {
    const base = [1970, 2050, 1980, 1970, 1910, 1980, 2110, 2040, 2100, 2020, 2040, 2020, 1830, 2090, 2050, 2050, 1830, 1830, 1910, 1950];
    const current = [2110, 2080, 2130, 2020, 2110, 2120, 2010, 2250, 2140, 2200, 2020, 2010, 2050, 2070, 2140, 2100, 2040, 1980, 2030, 2200];
    const r = mannWhitneyGreater(current, base);
    expect(r.method).toBe("normal");
    expect(r.p).toBeCloseTo(0.00045, 5);
  });

  it("can never reach p < 0.05 with three runs a side, which is why the verdict needs five", () => {
    expect(mannWhitneyGreater([130, 140, 150], [100, 110, 120]).p).toBeCloseTo(0.05, 6);
  });
});

describe("hodgesLehmann", () => {
  it("gives the median of the pairwise differences and its exact 95 % interval", () => {
    expect(hodgesLehmann(A.base, A.current)).toEqual({ shift: 500, ci: [20, 600] });
    expect(hodgesLehmann(B.base, B.current)).toEqual({ shift: 700, ci: [-175, 825] });
  });

  it("widens the interval to every difference when the samples are too small for 95 %", () => {
    expect(hodgesLehmann([100, 110, 120], [130, 140, 150])).toEqual({ shift: 30, ci: [10, 50] });
  });

  it("gives an interval around the shift for large samples", () => {
    const base = [1970, 2050, 1980, 1970, 1910, 1980, 2110, 2040, 2100, 2020, 2040, 2020, 1830, 2090, 2050, 2050, 1830, 1830, 1910, 1950];
    const current = [2110, 2080, 2130, 2020, 2110, 2120, 2010, 2250, 2140, 2200, 2020, 2010, 2050, 2070, 2140, 2100, 2040, 1980, 2030, 2200];
    const { shift, ci } = hodgesLehmann(base, current);
    expect(shift).toBe(90);
    expect(ci[0]).toBeLessThan(shift);
    expect(ci[1]).toBeGreaterThan(shift);
    expect(ci[0]).toBeGreaterThan(0);
  });
});
