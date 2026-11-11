import { describe, it, expect } from "vitest";
import { pathsOfRun, reportOf } from "../../src/overview.js";
import { auditWorkflow } from "../../src/workflows/audit.js";
import { cwvWorkflow } from "../../src/workflows/cwv.js";
import { RULES } from "../../src/decision-tree.js";

// The overview and the issues the JSON of the CLI adds to its results, as the export of the extension
describe("pathsOfRun", () => {
  it("maps each step of a workflow to the path of its snippet", () => {
    const pathOf = pathsOfRun({ workflow: auditWorkflow, rules: RULES });
    for (const step of auditWorkflow.steps) expect(pathOf({ id: step.id })).toBe(step.path);
  });

  it("maps a follow-up of the decision tree to its path", () => {
    const pathOf = pathsOfRun({ workflow: cwvWorkflow, rules: RULES });
    expect(pathOf({ id: "LCP-Subparts", reason: "LCP is over 2.5 s" })).toBe("CoreWebVitals/LCP-Subparts");
    expect(pathOf({ id: "layout-shifts" })).toBe("Interaction/Layout-Shift-Loading-and-Interaction");
  });

  it("maps the result of --snippet, named as it was given, to the path it resolves to", () => {
    const pathOf = pathsOfRun({ items: [{ id: "render-blocking", path: "Loading/Find-render-blocking-resources" }] });
    expect(pathOf({ id: "render-blocking" })).toBe("Loading/Find-render-blocking-resources");
    expect(pathOf({ id: "unknown" })).toBeUndefined();
  });
});

describe("reportOf", () => {
  const results = [
    { id: "ttfb", script: "TTFB-Sub-Parts", status: "ok", issues: [] },
    { id: "render-blocking", script: "Find-render-blocking-resources", status: "ok", issues: [{ code: "render-blocking", severity: "error", message: "2 render-blocking resources", target: "https://example.com/a.css" }] },
    { id: "webfonts", script: "Webfont-Usage-Analyzer", status: "ok", issues: [{ severity: "info", message: "An info" }, { severity: "warning", message: "A font for nothing" }] },
    { id: "dom-size", script: "DOM-Size-and-Depth", status: "error", error: "It failed" },
  ];
  const pathOf = pathsOfRun({ workflow: auditWorkflow, rules: RULES });

  it("counts the results with errors, with warnings and with nothing to fix", () => {
    expect(reportOf(results, pathOf).overview).toEqual({ snippets: 4, withErrors: 2, withWarnings: 1, withNothingToFix: 1 });
  });

  it("lists every issue by severity, with its code, the id and path of its step, and its target", () => {
    expect(reportOf(results, pathOf).issues).toEqual([
      { code: "render-blocking", severity: "error", id: "render-blocking", path: "Loading/Find-render-blocking-resources", message: "2 render-blocking resources", target: "https://example.com/a.css" },
      { severity: "error", id: "dom-size", path: "Interaction/DOM-Size-and-Depth", message: "It failed" },
      { severity: "warning", id: "webfonts", path: "Loading/Webfont-Usage-Analyzer", message: "A font for nothing" },
      { severity: "info", id: "webfonts", path: "Loading/Webfont-Usage-Analyzer", message: "An info" },
    ]);
  });

  it("gives an empty list and an overview with nothing to fix for results without issues", () => {
    expect(reportOf([{ id: "LCP", script: "LCP", status: "ok", value: 900, rating: "good" }], pathOf)).toEqual({
      overview: { snippets: 1, withErrors: 0, withWarnings: 0, withNothingToFix: 1 },
      issues: [],
    });
  });
});
