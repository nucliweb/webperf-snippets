import { describe, it, expect } from "vitest";
import { benchmarkIndex, machineOf } from "../../src/machine.js";

describe("the machine of a measurement", () => {
  it("names the machine as the operating system reports it, with a benchmark index that only informs", () => {
    const cpus = () => Array.from({ length: 4 }, () => ({ model: "AMD EPYC 7763 64-Core Processor" }));
    expect(machineOf({ cpus, arch: "x64", totalmem: () => 16.4 * 2 ** 30, benchmark: () => 1234 })).toEqual({
      cpu: "AMD EPYC 7763 64-Core Processor",
      cores: 4,
      arch: "x64",
      memoryGB: 16,
      benchmarkIndex: 1234,
    });
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
