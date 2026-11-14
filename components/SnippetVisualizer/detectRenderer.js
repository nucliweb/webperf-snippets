export function detectRenderer(result) {
  if (result.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") return "fonts";
  // A metric has a value to rate; an audit such as Script-Loading has a rating and no value
  if (result.rating != null && typeof result.value === "number") return "cwv";
  if (Array.isArray(result.issues) || Array.isArray(result.items)) return "audit";
  return "raw";
}
