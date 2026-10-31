import { describe, it, expect } from "vitest";
import { measurementConditions } from "../../src/conditions.js";
import { cliVersion } from "../../src/report-to.js";

describe("the conditions of a measurement", () => {
  it("name the viewport, the workflow, the wait and the version of the CLI", () => {
    expect(measurementConditions({ viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000 })).toEqual({
      viewport: "mobile",
      workflow: "core-web-vitals",
      waitMs: 3000,
      cliVersion,
    });
  });

  it("name the snippet instead of a workflow when one snippet runs", () => {
    const conditions = measurementConditions({ viewport: "desktop", snippet: "CoreWebVitals/LCP", waitMs: 500 });
    expect(conditions).toEqual({ viewport: "desktop", snippet: "CoreWebVitals/LCP", waitMs: 500, cliVersion });
    expect(conditions).not.toHaveProperty("workflow");
  });

  it("name the machine when it is given: its cores and its benchmark index", () => {
    const machine = { cores: 8, benchmarkIndex: 1234 };
    expect(measurementConditions({ viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000, machine })).toMatchObject({ machine });
  });
});
