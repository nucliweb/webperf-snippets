import { describe, it, expect } from "vitest";
import { rate } from "../../src/ratings.js";

describe("rate", () => {
  it("rates a value with the thresholds of web.dev, inclusive of the upper bound of each rating", () => {
    expect([rate("LCP", 2500), rate("LCP", 2501), rate("LCP", 4000), rate("LCP", 4001)]).toEqual(["good", "needs-improvement", "needs-improvement", "poor"]);
    expect([rate("FCP", 1800), rate("FCP", 3000), rate("FCP", 3001)]).toEqual(["good", "needs-improvement", "poor"]);
    expect([rate("TTFB", 800), rate("TTFB", 1800), rate("TTFB", 1801)]).toEqual(["good", "needs-improvement", "poor"]);
    expect([rate("CLS", 0.1), rate("CLS", 0.25), rate("CLS", 0.26)]).toEqual(["good", "needs-improvement", "poor"]);
    expect([rate("INP", 200), rate("INP", 500), rate("INP", 501)]).toEqual(["good", "needs-improvement", "poor"]);
  });

  it("has no rating for a value without thresholds", () => {
    expect(rate("navMs", 1200)).toBeUndefined();
  });
});
