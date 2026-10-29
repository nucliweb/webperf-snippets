import { describe, it, expect } from "vitest";
import { summarize, createRuns, RunError } from "../../src/mcp/summary.js";

describe("summarize", () => {
  it("keeps the status, the metric and the issues of a result, and leaves out its details and items", () => {
    const result = {
      id: "CoreWebVitals/LCP",
      script: "LCP",
      status: "ok",
      metric: "LCP",
      value: 3120,
      unit: "ms",
      rating: "poor",
      thresholds: { good: 2500, needsImprovement: 4000 },
      details: { element: "img.hero", url: "https://example.test/hero.png" },
      items: [{ selector: "img.hero" }],
      issues: [{ code: "lcp-image-lazy", severity: "error", message: "The LCP image is lazy loaded", target: "img.hero", value: 1 }],
    };
    expect(summarize(result)).toEqual({
      id: "CoreWebVitals/LCP",
      script: "LCP",
      status: "ok",
      metric: "LCP",
      value: 3120,
      unit: "ms",
      rating: "poor",
      issues: [{ code: "lcp-image-lazy", severity: "error", message: "The LCP image is lazy loaded", target: "img.hero" }],
    });
  });

  it("keeps the error of a failed snippet, the message of a tracking one and the reason of a follow-up", () => {
    expect(summarize({ script: "LCP", status: "error", error: "No LCP entries yet" })).toEqual({ script: "LCP", status: "error", error: "No LCP entries yet" });
    expect(summarize({ script: "INP", status: "tracking", message: "No interactions yet", getDataFn: "getINP" })).toEqual({
      script: "INP",
      status: "tracking",
      message: "No interactions yet",
    });
    expect(summarize({ id: "CoreWebVitals/LCP-Subparts", script: "LCP-Subparts", status: "ok", reason: "LCP is over 2.5 s", details: {} })).toEqual({
      id: "CoreWebVitals/LCP-Subparts",
      script: "LCP-Subparts",
      status: "ok",
      reason: "LCP is over 2.5 s",
    });
  });

  it("leaves out an empty list of issues, and an issue without a code or a target has none", () => {
    expect(summarize({ script: "TTFB", status: "ok", issues: [] })).toEqual({ script: "TTFB", status: "ok" });
    expect(summarize({ script: "TTFB", status: "ok", issues: [{ severity: "warning", message: "Slow" }] }).issues).toEqual([{ severity: "warning", message: "Slow" }]);
  });
});

describe("the runs of a connection", () => {
  it("gives the full result of a snippet of a run by its id", () => {
    const runs = createRuns();
    const runId = runs.keep([
      { id: "CoreWebVitals/LCP", script: "LCP", status: "ok", details: { element: "img" } },
      { id: "CoreWebVitals/CLS", script: "CLS", status: "ok", details: { shifts: 2 } },
    ]);
    expect(runs.get(runId, "CoreWebVitals/CLS")).toEqual({ id: "CoreWebVitals/CLS", script: "CLS", status: "ok", details: { shifts: 2 } });
  });

  it("keeps the last runs only, and answers an old or unknown run with an error that says to run again", () => {
    const runs = createRuns({ max: 2 });
    const first = runs.keep([{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok" }]);
    runs.keep([{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok" }]);
    const last = runs.keep([{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok" }]);
    expect(() => runs.get(first, "CoreWebVitals/LCP")).toThrow(RunError);
    expect(() => runs.get(first, "CoreWebVitals/LCP")).toThrow(/last 2 runs/);
    expect(() => runs.get("nope", "CoreWebVitals/LCP")).toThrow(/run the tool again/i);
    expect(runs.get(last, "CoreWebVitals/LCP").script).toBe("LCP");
  });

  it("finds a result by the id the summary shows or by the name of its script", () => {
    const runs = createRuns();
    const runId = runs.keep([{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", value: 1 }]);
    expect(runs.get(runId, "LCP").value).toBe(1);
  });

  it("answers a snippet that is not in the run with an error that lists the ones that are", () => {
    const runs = createRuns();
    const runId = runs.keep([{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok" }]);
    expect(() => runs.get(runId, "CoreWebVitals/CLS")).toThrow(/CoreWebVitals\/LCP/);
  });
});
