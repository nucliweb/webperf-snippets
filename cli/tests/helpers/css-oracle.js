import { analyze } from "@projectwallace/css-analyzer";

// The counts of @projectwallace/css-analyzer for the CSS of a page, with the names of the result of
// CSS-Complexity. The snippet reads the CSSOM and css-analyzer the text, so the tests only compare
// what the CSSOM does not rewrite, on fixtures without hacks or invalid declarations.
export function cssOracle(texts) {
  const r = analyze(texts.join("\n"));
  const types = r.stylesheet.embeddedContent.types.unique;
  return {
    ruleCount: r.rules.total,
    selectorCount: r.selectors.total,
    declarationCount: r.declarations.total,
    embeddedBytes: r.stylesheet.embeddedContent.size.total,
    embeddedCount: r.stylesheet.embeddedContent.types.total,
    embeddedTypes: Object.entries(types)
      .map(([type, { count, size }]) => ({ type, count, bytes: size }))
      .sort((a, b) => b.bytes - a.bytes || a.type.localeCompare(b.type)),
    importCount: r.atrules.import.total,
    emptyRuleCount: r.rules.empty.total,
    selectorUniqueness: r.selectors.total ? Math.round(r.selectors.uniquenessRatio * 1000) / 1000 : 1,
    importantCount: r.declarations.importants.total,
    importantPercent: Math.round(r.declarations.importants.ratio * 1000) / 10,
    fontFaceCount: r.atrules.fontface.total,
    keyframesCount: r.atrules.keyframes.total,
    unusedKeyframes: [...r.atrules.keyframes.unused].sort(),
  };
}
