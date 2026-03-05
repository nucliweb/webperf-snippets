// Network Bandwidth & Connection Quality Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  if (!connection) {
    console.warn(
      "%c⚠️ Network Information API not supported in this browser",
      "color: #f59e0b; font-weight: bold;"
    );
    console.log("Available in Chrome and Android browsers.");
    return { script: "Network-Bandwidth-Connection-Quality", status: "unsupported", error: "Network Information API not supported" };
  }

  const effectiveTypeRating = {
    "slow-2g": { label: "Slow 2G", color: "#ef4444" },
    "2g": { label: "2G", color: "#f97316" },
    "3g": { label: "3G", color: "#f59e0b" },
    "4g": { label: "4G", color: "#22c55e" },
  };

  const effectiveType = connection.effectiveType || "unknown";
  const rating = effectiveTypeRating[effectiveType] || {
    label: effectiveType,
    color: "#6b7280",
  };

  console.group(
    `%c📡 Network Quality: ${rating.label}`,
    `color: ${rating.color}; font-weight: bold; font-size: 14px;`
  );

  console.log("");
  console.log("%cConnection details:", "font-weight: bold;");
  console.table({
    "Connection Type": connection.type || "unknown",
    "Effective Type": effectiveType,
    "Downlink (Mbps)":
      connection.downlink !== undefined ? connection.downlink : "N/A",
    "RTT (ms)": connection.rtt !== undefined ? connection.rtt : "N/A",
    "Save-Data": connection.saveData ? "Enabled" : "Disabled",
  });

  // Recommendations
  console.log("");
  if (connection.saveData) {
    console.log(
      "%c💡 Save-Data is enabled — consider serving reduced assets:",
      "color: #3b82f6; font-weight: bold;"
    );
    console.log("   - Omit non-essential images and videos");
    console.log("   - Disable autoplay and animations");
    console.log("   - Defer non-critical resources");
  }

  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    console.log(
      "%c💡 Slow connection detected — performance tips:",
      "color: #3b82f6; font-weight: bold;"
    );
    console.log("   - Prioritize critical resources with fetchpriority=high");
    console.log("   - Minimize render-blocking scripts and stylesheets");
    console.log("   - Consider skeleton screens over layout shifts");
  }

  // Monitor connection changes
  const onChange = () => {
    const updated = connection.effectiveType || "unknown";
    const updatedRating = effectiveTypeRating[updated] || {
      label: updated,
      color: "#6b7280",
    };
    console.log(
      `%c🔄 Connection changed → ${updatedRating.label} (${updated})`,
      `color: ${updatedRating.color}; font-weight: bold;`
    );
  };

  connection.addEventListener("change", onChange);
  console.log("");
  console.log(
    "%c👂 Listening for connection changes... (navigate to trigger)",
    "color: #6b7280;"
  );

  console.groupEnd();

  return {
    script: "Network-Bandwidth-Connection-Quality",
    status: "ok",
    details: {
      effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
      type: connection.type || "unknown",
    },
  };
})();
