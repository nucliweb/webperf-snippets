import { describe, it, expect } from "vitest";
import { NETWORK_PRESETS, resolveNetwork, describeThrottling, throttlingOf } from "../../src/throttling.js";

// Slow 4G of DevTools, written as a network of its own: 1.6 Mbps and 750 kbps at 90 %, 562.5 ms
const SLOW_4G_AS_VALUES = { downloadKbps: 1440, uploadKbps: 675, latencyMs: 562.5 };

describe("resolveNetwork", () => {
  it("returns the values of a preset", () => {
    expect(resolveNetwork("slow-4g")).toEqual(NETWORK_PRESETS["slow-4g"]);
  });

  it("converts a network of its own from kilobits to bytes per second", () => {
    const { download, upload, latency } = resolveNetwork(SLOW_4G_AS_VALUES);
    const preset = NETWORK_PRESETS["slow-4g"];
    expect(download).toBeCloseTo(preset.download);
    expect(upload).toBeCloseTo(preset.upload);
    expect(latency).toBe(preset.latency);
  });

  it("fails with what is wrong for an unknown preset or an incomplete network", () => {
    expect(() => resolveNetwork("5g")).toThrow('Unknown network preset: "5g". Choose from: fast-4g, slow-4g, 3g');
    expect(() => resolveNetwork({ downloadKbps: 50000, latencyMs: 20 })).toThrow("uploadKbps");
    expect(() => resolveNetwork({ downloadKbps: -1, uploadKbps: 1000, latencyMs: 20 })).toThrow("downloadKbps");
    expect(() => resolveNetwork({ downloadKbps: 50000, uploadKbps: 10000, latencyMs: "20" })).toThrow("latencyMs");
  });
});

describe("a network of its own in the reports", () => {
  const fiveG = { downloadKbps: 50000, uploadKbps: 10000, latencyMs: 20 };

  it("is described by its download and latency", () => {
    expect(describeThrottling({ network: fiveG })).toBe("50 Mbps, 20 ms");
    expect(describeThrottling({ cpu: 1, network: fiveG })).toBe("CPU 1x, 50 Mbps, 20 ms");
    expect(describeThrottling({ network: { downloadKbps: 400, uploadKbps: 400, latencyMs: 2000 } })).toBe("400 kbps, 2000 ms");
    expect(describeThrottling({ network: SLOW_4G_AS_VALUES })).toBe("1.44 Mbps, 562.5 ms");
  });

  it("is reported as given in the payload", () => {
    expect(throttlingOf({ network: fiveG })).toEqual({ network: fiveG });
  });

  it("leaves the presets as they were", () => {
    expect(describeThrottling({ cpu: 4, network: "slow-4g" })).toBe("CPU 4x, Slow 4G");
  });
});
