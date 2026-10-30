import { cliVersion } from "./report-to.js";

// How a measurement was taken, kept in its JSON so that a later run compared with it can tell whether
// both were measured the same way. A snippet is named by its path, so an alias and its path match.
export function measurementConditions({ viewport, workflow, snippet, waitMs, machine }) {
  return { viewport, ...(snippet ? { snippet } : { workflow }), waitMs, cliVersion, ...(machine ? { machine } : {}) };
}
