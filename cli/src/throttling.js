// CPU and network throttling through CDP, as the Performance panel of DevTools applies it. The
// network presets copy the values of DevTools, so a measurement of the CLI compares with one made
// there. Throughputs are in bytes per second and latencies in milliseconds.
//
// A network can also be given by its own values, for the ones DevTools has no preset for, such as
// 5G or fibre: { downloadKbps, uploadKbps, latencyMs }, in kilobits per second and milliseconds.
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

const NETWORK_VALUES = ["downloadKbps", "uploadKbps", "latencyMs"];

// The throughputs and latency of a preset name or of a network given by its values
export function resolveNetwork(network) {
  if (typeof network === "string") {
    const preset = NETWORK_PRESETS[network];
    if (!preset) throw new Error(`Unknown network preset: "${network}". Choose from: ${Object.keys(NETWORK_PRESETS).join(", ")}`);
    return preset;
  }
  for (const key of NETWORK_VALUES) {
    const value = network?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid network: ${key} must be a number of at least 0, such as { "downloadKbps": 50000, "uploadKbps": 10000, "latencyMs": 20 }`);
    }
  }
  return {
    download: (network.downloadKbps * 1000) / 8,
    upload: (network.uploadKbps * 1000) / 8,
    latency: network.latencyMs,
  };
}

// 400 kbps, 1.44 Mbps, 50 Mbps
function formatKbps(kbps) {
  return kbps < 1000 ? `${kbps} kbps` : `${Number((kbps / 1000).toFixed(2))} Mbps`;
}

function describeNetwork(network) {
  if (typeof network === "string") return NETWORK_PRESETS[network]?.title ?? network;
  return `${formatKbps(network.downloadKbps)}, ${network.latencyMs} ms`;
}

// The conditions of a run, as the payload reports them, or undefined without throttling
export function throttlingOf({ cpu, network }) {
  if (cpu == null && network == null) return undefined;
  return { ...(cpu != null ? { cpu } : {}), ...(network != null ? { network } : {}) };
}

// "CPU 4x, Slow 4G" or "CPU 1x, 50 Mbps, 20 ms", for the header of the reports
export function describeThrottling({ cpu, network }) {
  return [cpu != null ? `CPU ${cpu}x` : null, network != null ? describeNetwork(network) : null]
    .filter(Boolean)
    .join(", ");
}

export async function applyThrottling(context, page, { cpu, network }) {
  if (cpu == null && network == null) return;
  // An invalid network fails before anything is applied to the page
  const conditions = network != null ? resolveNetwork(network) : null;
  const cdp = await context.newCDPSession(page);
  if (cpu != null) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  if (conditions) {
    const { download, upload, latency } = conditions;
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency,
      downloadThroughput: download,
      uploadThroughput: upload,
    });
  }
}
