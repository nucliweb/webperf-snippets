import { describe, it, expect } from "vitest";
import { parseHistory, trendOf, sparkline, historyView } from "../../src/crux.js";

// A record of the CrUX History API as it answers: one entry per weekly collection period, oldest first,
// each period the 28 days before its last date; p75s are numbers, CLS as strings, null where the
// period had too little data
const RECORD = {
  key: { formFactor: "PHONE", origin: "https://example.com" },
  collectionPeriods: [
    { firstDate: { year: 2026, month: 9, day: 13 }, lastDate: { year: 2026, month: 10, day: 10 } },
    { firstDate: { year: 2026, month: 9, day: 20 }, lastDate: { year: 2026, month: 10, day: 17 } },
    { firstDate: { year: 2026, month: 9, day: 27 }, lastDate: { year: 2026, month: 10, day: 24 } },
  ],
  metrics: {
    largest_contentful_paint: { percentilesTimeseries: { p75s: [2875, 2990, 3097] } },
    cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.26", "0.24", "0.21"] } },
    interaction_to_next_paint: { percentilesTimeseries: { p75s: [null, 249, 251] } },
    round_trip_time: { percentilesTimeseries: { p75s: [213, 216, 217] } },
  },
};

describe("parseHistory", () => {
  it("gives the periods as dates and the p75s of LCP, CLS and INP, CLS as numbers", () => {
    expect(parseHistory(RECORD)).toEqual({
      periods: [
        { start: "2026-09-13", end: "2026-10-10" },
        { start: "2026-09-20", end: "2026-10-17" },
        { start: "2026-09-27", end: "2026-10-24" },
      ],
      metrics: {
        LCP: { unit: "ms", p75s: [2875, 2990, 3097], first: 2875, last: 3097, change: 7.7, trend: "worsening" },
        CLS: { unit: "score", p75s: [0.26, 0.24, 0.21], first: 0.26, last: 0.21, change: -19.2, trend: "improving" },
        INP: { unit: "ms", p75s: [null, 249, 251], first: 249, last: 251, change: 0.8, trend: "stable" },
      },
    });
  });

  it("leaves out a metric with no p75 in any period", () => {
    const record = { ...RECORD, metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [null, null, null] } } } };
    expect(parseHistory(record).metrics).toEqual({});
  });
});

describe("trendOf", () => {
  it("is stable within 5 % of the first period, improving below it and worsening above it, lower being better", () => {
    expect(trendOf([1000, 1050])).toEqual({ first: 1000, last: 1050, change: 5, trend: "stable" });
    expect(trendOf([1000, 1051])).toMatchObject({ trend: "worsening" });
    expect(trendOf([1000, 949])).toMatchObject({ change: -5.1, trend: "improving" });
  });

  it("compares the first and the last periods with data", () => {
    expect(trendOf([null, 1000, 1200, null])).toEqual({ first: 1000, last: 1200, change: 20, trend: "worsening" });
  });

  it("has no trend with fewer than two periods with data", () => {
    expect(trendOf([null, 1000])).toEqual({ first: 1000, last: 1000, change: null, trend: null });
  });
});

describe("sparkline", () => {
  it("draws the series between its lowest and highest values, with a gap for a period without data", () => {
    expect(sparkline([2000, 2500, 3000, null, 2000])).toBe("▁▅█ ▁");
  });

  it("draws a flat series in the middle", () => {
    expect(sparkline([0.1, 0.1, 0.1])).toBe("▅▅▅");
  });

  // A CLS of 0.20 to 0.21 drawn from its lowest to its highest value looked like a big swing
  it("draws a series narrower than the minimum range of its metric near the middle", () => {
    expect(sparkline([0.2, 0.21, 0.21, 0.2], 0.05)).toBe("▄▅▅▄");
    expect(sparkline([3070, 3100, 3085], 100)).toBe("▃▆▅");
    // A series wider than the minimum range uses its own
    expect(sparkline([2000, 2500, 3000], 100)).toBe("▁▅█");
  });

  it("gives each metric the minimum change of --baseline as its range in the trend", () => {
    const history = {
      formFactor: "PHONE",
      scope: "origin",
      weeks: 8,
      periods: [],
      metrics: {
        LCP: { unit: "ms", p75s: [3070, 3100, 3085, 3090], first: 3070, last: 3090, change: 0.7, trend: "stable" },
        CLS: { unit: "score", p75s: [0.21, 0.2, 0.2, 0.21], first: 0.21, last: 0.21, change: 0, trend: "stable" },
        INP: { unit: "ms", p75s: [242, 251, 246, 251], first: 242, last: 251, change: 3.7, trend: "stable" },
      },
    };
    expect(historyView(history).rows.map((r) => r.sparkline)).toEqual(["▃▆▅▅", "▅▄▄▅", "▄▅▄▅"]);
  });
});
