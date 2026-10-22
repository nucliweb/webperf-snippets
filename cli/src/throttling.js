// CPU and network throttling through CDP, as the Performance panel of DevTools applies it. The
// network presets copy the values of DevTools, so a measurement of the CLI compares with one made
// there. Throughputs are in bytes per second and latencies in milliseconds.
export const NETWORK_PRESETS = {
  "fast-4g": { title: "Fast 4G", download: (9 * 1000 * 1000) / 8 * 0.9, upload: (1.5 * 1000 * 1000) / 8 * 0.9, latency: 60 * 2.75 },
  "slow-4g": { title: "Slow 4G", download: (1.6 * 1000 * 1000) / 8 * 0.9, upload: (750 * 1000) / 8 * 0.9, latency: 150 * 3.75 },
  "3g": { title: "3G", download: (500 * 1000) / 8 * 0.8, upload: (500 * 1000) / 8 * 0.8, latency: 400 * 5 },
};

// The factor given to --cpu, or null when it is not a number of at least 1
export function parseCpuFactor(raw) {
  const factor = Number(raw);
  return raw.trim() !== "" && Number.isFinite(factor) && factor >= 1 ? factor : null;
}

// The conditions of a run, as the payload reports them, or undefined without throttling
export function throttlingOf({ cpu, network }) {
  if (cpu == null && network == null) return undefined;
  return { ...(cpu != null ? { cpu } : {}), ...(network != null ? { network } : {}) };
}

// "CPU 4x, Slow 4G", for the header of the reports
export function describeThrottling({ cpu, network }) {
  return [cpu != null ? `CPU ${cpu}x` : null, network != null ? (NETWORK_PRESETS[network]?.title ?? network) : null]
    .filter(Boolean)
    .join(", ");
}

export async function applyThrottling(context, page, { cpu, network }) {
  if (cpu == null && network == null) return;
  const cdp = await context.newCDPSession(page);
  if (cpu != null) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  if (network != null) {
    const { download, upload, latency } = NETWORK_PRESETS[network];
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: download,
      uploadThroughput: upload,
    });
  }
}
