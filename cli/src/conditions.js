import { cliVersion } from "./report-to.js";

// How a measurement was taken, kept in its JSON so that a later run compared with it can tell whether
// both were measured the same way. A snippet is named by its path, so an alias and its path match. The
// CPU factor and the network go in only when the run was throttled, so a run without throttling keeps
// the conditions of earlier versions. The browser is the one the run launched (browser.js, launchedBrowser).
export function measurementConditions({ viewport, workflow, snippet, waitMs, cpu, network, browser, machine }) {
  return {
    viewport,
    ...(snippet ? { snippet } : { workflow }),
    waitMs,
    ...(cpu != null ? { cpu } : {}),
    ...(network != null ? { network } : {}),
    ...(browser ? { browser } : {}),
    cliVersion,
    ...(machine ? { machine } : {}),
  };
}
