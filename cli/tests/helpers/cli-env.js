// Environment for a test that spawns the CLI. The variables below make the CLI
// call an external service (CrUX, a report endpoint) when they are set, so a
// developer's shell must not leak into a test. A test that wants one of them
// passes it explicitly.
const EXTERNAL_SERVICE_VARIABLES = ["CRUX_API_KEY", "PERF_REVIEWS_API_KEY", "WEBPERF_CRUX_ENDPOINT"];

export function cliEnv(extra = {}) {
  return {
    ...process.env,
    ...Object.fromEntries(EXTERNAL_SERVICE_VARIABLES.map((name) => [name, ""])),
    ...extra,
  };
}
