import { describe, it, expect } from "vitest";
import { cliVersion, reportBody, reportLines } from "../../src/report-to.js";

const page = { navMs: 850, overview: { snippets: 1 }, issues: [], results: [{ id: "LCP" }], pageErrors: [], conditions: {} };

describe("reportBody", () => {
  it("is one page: its URL, what it ran, when, what it found and how it was measured", () => {
    const body = reportBody({ url: "http://localhost:3000/", values: {}, page, meta: { viewport: "mobile", waitMs: 3000 } });
    expect(Object.keys(body)).toEqual(["url", "workflow", "timestamp", "navMs", "overview", "issues", "results", "meta"]);
    expect(body).toEqual(expect.objectContaining({ url: "http://localhost:3000/", workflow: "core-web-vitals", navMs: 850, overview: { snippets: 1 }, issues: [], results: [{ id: "LCP" }] }));
    expect(body.meta).toEqual({ viewport: "mobile", waitMs: 3000, cli_version: cliVersion });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("names the workflow that ran, or the snippet with no workflow", () => {
    expect(reportBody({ url: "u", values: { workflow: "audit" }, page, meta: {} }).workflow).toBe("audit");
    expect(reportBody({ url: "u", values: { snippet: "LCP", workflow: "audit" }, page, meta: {} })).toEqual(expect.objectContaining({ workflow: null, snippet: "LCP" }));
  });

  it("carries the budgets when the run had some, and nothing else of the page", () => {
    const body = reportBody({ url: "u", values: {}, page: { ...page, budgets: [{ metric: "LCP" }] }, meta: {} });
    expect(body.budgets).toEqual([{ metric: "LCP" }]);
    expect(body).not.toHaveProperty("pageErrors");
    expect(body).not.toHaveProperty("conditions");
  });
});

describe("reportLines", () => {
  const to = "https://reports.example.com/api/runs?token=secret";

  it("says nothing when the report arrived and found no regression", () => {
    expect(reportLines({ ok: true, regressions: [] }, { url: to })).toEqual([]);
  });

  it("warns with the origin of the endpoint, never its path or its query", () => {
    expect(reportLines({ ok: false, warning: "the endpoint answered 500" }, { url: to })).toEqual(["Warning: could not report results to https://reports.example.com (the endpoint answered 500)"]);
    expect(reportLines({ ok: false, warning: "no answer within 5000ms" }, { url: to, name: "home-mobile" })).toEqual(["Warning: could not report home-mobile to https://reports.example.com (no answer within 5000ms)"]);
  });

  it("lists the regressions the endpoint found, of the page or of a combination", () => {
    expect(reportLines({ ok: true, regressions: ["LCP got slower", { metric: "CLS" }] }, { url: to })).toEqual(['Regressions detected:\n  - LCP got slower\n  - {"metric":"CLS"}']);
    expect(reportLines({ ok: true, regressions: ["LCP got slower"] }, { url: to, name: "home-mobile" })).toEqual(["Regressions detected in home-mobile:\n  - LCP got slower"]);
  });
});
