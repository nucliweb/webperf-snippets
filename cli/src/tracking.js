// A tracking snippet installs observers and answers later through a window function named in
// its result (getDataFn). The Interaction snippets work this way. CLS and INP also name a
// getDataFn but answer with their value in one go, so only the Interaction category counts.
export function isTrackingSnippet(path, source) {
  return path.startsWith("Interaction/") && source.includes("getDataFn");
}
