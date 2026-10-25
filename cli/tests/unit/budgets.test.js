import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGET_METRICS, MEASURED_BY, parseBudgets, unmeasuredMetrics, checkBudgets, violationsOf } from "../../src/budgets.js";
import { WORKFLOWS } from "../../src/workflows/index.js";

const SNIPPETS = join(dirname(fileURLToPath(import.meta.url)), "../../../snippets");

describe("parseBudgets", () => {
  it("reads a budget for each of the five metrics, and leaves out the ones not given", () => {
    expect(parseBudgets({ "budget-lcp": "2500", "budget-cls": "0.1", "budget-inp": "200", "budget-fcp": "1800", "budget-ttfb": "800" })).toEqual({
      LCP: 2500,
      CLS: 0.1,
      INP: 200,
      FCP: 1800,
      TTFB: 800,
    });
    expect(parseBudgets({ "budget-lcp": "2500" })).toEqual({ LCP: 2500 });
    expect(parseBudgets({})).toEqual({});
  });

  it("rejects a value that is not a number of 0 or more, naming the option", () => {
    for (const raw of ["abc", "-1", "", "2500ms", "1e"]) {
      expect(() => parseBudgets({ "budget-lcp": raw })).toThrow(/--budget-lcp/);
    }
    expect(parseBudgets({ "budget-cls": "0" })).toEqual({ CLS: 0 });
  });
});

describe("MEASURED_BY", () => {
  it("names, for each metric, the snippets whose result carries it", () => {
    expect(Object.keys(MEASURED_BY).sort()).toEqual(Object.keys(BUDGET_METRICS).sort());
    for (const [metric, paths] of Object.entries(MEASURED_BY)) {
      for (const path of paths) expect(readFileSync(join(SNIPPETS, `${path}.js`), "utf8")).toContain(`metric: "${metric}"`);
    }
  });

  it("makes the interaction workflow measure INP", () => {
    expect(WORKFLOWS.interaction.steps.map((s) => s.path)).toContain("CoreWebVitals/INP");
  });
});

describe("unmeasuredMetrics", () => {
  it("lists the budgets whose metric no snippet of the run measures", () => {
    const audit = WORKFLOWS.audit.steps.map((s) => s.path);
    expect(unmeasuredMetrics({ LCP: 2500, CLS: 0.1, TTFB: 800 }, audit)).toEqual(["LCP", "CLS"]);
    expect(unmeasuredMetrics({ LCP: 2500, CLS: 0.1 }, WORKFLOWS["core-web-vitals"].steps.map((s) => s.path))).toEqual([]);
    expect(unmeasuredMetrics({ INP: 200 }, ["CoreWebVitals/INP"])).toEqual([]);
  });
});

describe("checkBudgets", () => {
  const page = (results, runs) => ({ results, ...(runs ? { runs } : {}) });
  const metric = (name, value, unit = "ms", extra = {}) => ({ id: name, script: name, status: "ok", metric: name, value, unit, ...extra });

  it("passes a value equal to the budget, and exceeds one above it", () => {
    expect(checkBudgets(page([metric("LCP", 2500), metric("CLS", 0.12, "score")]), { LCP: 2500, CLS: 0.1 })).toEqual([
      { metric: "LCP", budget: 2500, value: 2500, unit: "ms", verdict: "passed" },
      { metric: "CLS", budget: 0.1, value: 0.12, unit: "score", verdict: "exceeded" },
    ]);
  });

  it("says why a metric was not measured, from the result of its snippet", () => {
    const inp = { id: "INP", script: "INP", status: "tracking", message: "No interactions yet: click, tap or type on the page" };
    const lcp = { id: "LCP", status: "error", error: "No LCP entries buffered" };
    expect(checkBudgets(page([inp, lcp]), { INP: 200, LCP: 2500 })).toEqual([
      { metric: "INP", budget: 200, value: null, unit: "ms", verdict: "not measured", note: "No interactions yet: click, tap or type on the page" },
      { metric: "LCP", budget: 2500, value: null, unit: "ms", verdict: "not measured", note: "No LCP entries buffered" },
    ]);
    const skipped = { id: "INP", status: "skipped", reason: "The interactions have no click or type step" };
    expect(checkBudgets(page([skipped]), { INP: 200 })[0]).toEqual(expect.objectContaining({ verdict: "not measured", note: "The interactions have no click or type step" }));
  });

  it("takes the value of the step before the one of a follow-up", () => {
    const followUp = metric("LCP", 900, "ms", { id: "lcp-subparts", script: "LCP-Subparts", reason: "LCP is poor" });
    expect(checkBudgets(page([followUp, metric("LCP", 3100)]), { LCP: 2500 })[0]).toEqual(expect.objectContaining({ value: 3100, verdict: "exceeded" }));
  });

  it("compares the median of the runs", () => {
    const runs = { count: 3, summary: { LCP: { median: 2400, min: 2100, max: 3000, unit: "ms" } } };
    expect(checkBudgets(page([metric("LCP", 3000)], runs), { LCP: 2500 })[0]).toEqual(expect.objectContaining({ value: 2400, verdict: "passed" }));
    expect(checkBudgets(page([], { count: 3, summary: {} }), { INP: 200 })[0]).toEqual(expect.objectContaining({ value: null, verdict: "not measured" }));
  });
});

describe("violationsOf", () => {
  it("words each budget that failed, as stderr says it", () => {
    const checked = [
      { metric: "LCP", budget: 2500, value: 3100, unit: "ms", verdict: "exceeded" },
      { metric: "CLS", budget: 0.1, value: 0.05, unit: "score", verdict: "passed" },
      { metric: "CLS", budget: 0.1, value: 0.3, unit: "score", verdict: "exceeded" },
      { metric: "INP", budget: 200, value: null, unit: "ms", verdict: "not measured", note: "No interactions yet" },
    ];
    expect(violationsOf(checked)).toEqual(["LCP 3100ms exceeds budget 2500ms", "CLS 0.3 exceeds budget 0.1", "INP was not measured (budget 200ms): No interactions yet"]);
  });
});
