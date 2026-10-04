// A tracking snippet installs observers and answers later through a window function named in its
// result (getDataFn). The Interaction snippets work this way, and so does INP, whose value only
// comes out of getINP(). CLS also names a getDataFn but answers with its value in one go.
export function isTrackingSnippet(path, source) {
  return (path.startsWith("Interaction/") || path === "CoreWebVitals/INP") && source.includes("getDataFn");
}
