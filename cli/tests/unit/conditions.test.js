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

  it("name the CPU factor and the network of a throttled run", () => {
    expect(measurementConditions({ viewport: "mobile", workflow: "interaction", waitMs: 3000, cpu: 4, network: "slow-4g" })).toEqual({
      viewport: "mobile",
      workflow: "interaction",
      waitMs: 3000,
      cpu: 4,
      network: "slow-4g",
      cliVersion,
    });
  });

  // A run without throttling keeps the conditions of earlier versions, so the baselines they wrote compare
  // with it as before
  it("name only the throttling that was given, and none without it", () => {
    const cpuOnly = measurementConditions({ viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000, cpu: 2 });
    expect(cpuOnly).toMatchObject({ cpu: 2 });
    expect(cpuOnly).not.toHaveProperty("network");
    const plain = measurementConditions({ viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000, cpu: undefined, network: undefined });
    expect(Object.keys(plain)).toEqual(["viewport", "workflow", "waitMs", "cliVersion"]);
  });

  it("name the machine when it is given: its cores and its benchmark index", () => {
    const machine = { cores: 8, benchmarkIndex: 1234 };
    expect(measurementConditions({ viewport: "mobile", workflow: "core-web-vitals", waitMs: 3000, machine })).toMatchObject({ machine });
  });
});
