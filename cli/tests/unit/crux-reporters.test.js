import { describe, it, expect } from "vitest";
import { reportHuman } from "../../src/reporters/human.js";
import { reportMarkdown } from "../../src/reporters/markdown.js";

const base = {
  url: "https://web.dev",
  navMs: 850,
  results: [
    { id: "LCP", status: "ok", metric: "LCP", value: 2100, unit: "ms", rating: "good" },
    { id: "CLS", status: "ok", metric: "CLS", value: 0.05, unit: "score", rating: "good" },
  ],
  pageErrors: [],
};

const crux = {
  scope: "url",
  formFactor: "PHONE",
  metrics: {
    LCP: { p75: 2800, rating: "needs-improvement", unit: "ms" },
    CLS: { p75: 0.08, rating: "good", unit: "score" },
    INP: { p75: 220, rating: "needs-improvement", unit: "ms" },
  },
};

describe("reportHuman with field data", () => {
  it("adds a section with each p75 and the synthetic value next to it", () => {
    const out = reportHuman({ ...base, crux });
    expect(out).toContain("Field data (CrUX p75, mobile)");
    expect(out).toMatch(/LCP\s+2\.80s.*needs-improvement.*synthetic: 2\.10s/);
    expect(out).toMatch(/CLS\s+0\.0800.*synthetic: 0\.0500/);
  });

  it("shows n/a when the metric was not measured synthetically", () => {
    const out = reportHuman({ ...base, crux });
    expect(out).toMatch(/INP\s+220ms.*synthetic: n\/a/);
  });

  it("labels origin-level data and the form factor", () => {
    const out = reportHuman({ ...base, crux: { ...crux, scope: "origin", formFactor: "DESKTOP" } });
    expect(out).toContain("Field data (CrUX p75, desktop, origin-level)");
  });

  it("explains when there is no field data", () => {
    const out = reportHuman({ ...base, crux: { unavailable: "not in the CrUX dataset" } });
    expect(out).toContain("Field data: not available (not in the CrUX dataset)");
  });

  it("is unchanged without field data", () => {
    expect(reportHuman(base)).not.toContain("Field data");
  });
});

describe("reportMarkdown with field data", () => {
  it("adds a table with the p75 and the synthetic value", () => {
    const out = reportMarkdown({ ...base, crux });
    expect(out).toContain("### Field data (CrUX p75, mobile)");
    expect(out).toContain("| Metric | Field p75 | Status | Synthetic |");
    expect(out).toContain("| LCP | 2.80s | ⚠️ needs-improvement | 2.10s |");
    expect(out).toContain("| INP | 220ms | ⚠️ needs-improvement | n/a |");
  });

  it("labels origin-level data", () => {
    const out = reportMarkdown({ ...base, crux: { ...crux, scope: "origin" } });
    expect(out).toContain("### Field data (CrUX p75, mobile, origin-level)");
  });

  it("explains when there is no field data", () => {
    const out = reportMarkdown({ ...base, crux: { unavailable: "not in the CrUX dataset" } });
    expect(out).toContain("> Field data: not available (not in the CrUX dataset)");
  });

  it("is unchanged without field data", () => {
    expect(reportMarkdown(base)).not.toContain("Field data");
  });
});
