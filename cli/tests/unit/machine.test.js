import { describe, it, expect } from "vitest";
import { benchmarkIndex, machineOf } from "../../src/machine.js";

describe("the machine of a measurement", () => {
  it("gives the number of cores and a benchmark index", () => {
    expect(machineOf({ cores: 8, benchmark: () => 1234 })).toEqual({ cores: 8, benchmarkIndex: 1234 });
  });

  // How much it repeats depends on what else the machine runs, such as the other files of this suite,
  // so it is measured apart: alone, ten in a row vary by about 6 %
  it("measures the CPU in a fraction of a second, as a positive whole number", () => {
    const start = performance.now();
    const index = benchmarkIndex();
    expect(performance.now() - start).toBeLessThan(400);
    expect(Number.isInteger(index)).toBe(true);
    expect(index).toBeGreaterThan(0);
  });
});
