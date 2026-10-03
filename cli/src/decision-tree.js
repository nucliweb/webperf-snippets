// Declarative follow-ups: if a result matches the predicate, append the steps.
// Mirrors the WORKFLOWS.md decision trees from the snippet catalogue.
//
// A rule looks at the first results only. The results of a follow-up do not fire rules of their own.
const ok = (r, id) => r.id === id && r.status === "ok";

export const RULES = [
  {
    when: (r) => ok(r, "LCP") && r.value > 2500,
    append: { id: "LCP-Subparts", path: "CoreWebVitals/LCP-Subparts" },
    reason: "LCP > 2.5s — drilling into sub-parts",
  },
  {
    when: (r) => ok(r, "LCP") && r.value > 4000,
    append: { id: "LCP-Trail", path: "CoreWebVitals/LCP-Trail" },
    reason: "LCP > 4s — listing the LCP candidates",
  },
  {
    when: (r) => ok(r, "LCP") && r.details?.elementType === "Image",
    append: [
      { id: "LCP-Image-Entropy", path: "CoreWebVitals/LCP-Image-Entropy" },
      { id: "image-audit", path: "Media/Image-Element-Audit" },
    ],
    reason: "LCP is an image — checking its entropy and its attributes",
  },
  {
    when: (r) => ok(r, "LCP") && r.details?.elementType === "Video poster",
    append: [
      { id: "LCP-Video-Candidate", path: "CoreWebVitals/LCP-Video-Candidate" },
      { id: "video-audit", path: "Media/Video-Element-Audit" },
    ],
    reason: "LCP is a video — checking its candidate and its loading",
  },
  {
    when: (r) => ok(r, "CLS") && r.value > 0.1,
    append: { id: "layout-shifts", path: "Interaction/Layout-Shift-Loading-and-Interaction" },
    reason: "CLS > 0.1 — separating the shifts of the load from those of the interactions",
  },
  {
    when: (r) => ok(r, "CLS") && r.value > 0.25,
    append: [
      { id: "lazy-atf", path: "Loading/Find-Above-The-Fold-Lazy-Loaded-Images" },
      { id: "fonts", path: "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold" },
      { id: "critical-css", path: "Loading/Critical-CSS-Detection" },
      { id: "image-audit", path: "Media/Image-Element-Audit" },
    ],
    reason: "CLS > 0.25 — looking for the usual causes: lazy images, font swaps, late CSS and images without dimensions",
  },
  {
    when: (r) => ok(r, "TTFB") && r.value > 600,
    append: { id: "ttfb-subparts", path: "Loading/TTFB-Sub-Parts" },
    reason: "TTFB > 600ms — drilling into sub-parts",
  },
  {
    when: (r) => ok(r, "FCP") && r.value > 1800,
    append: { id: "render-blocking", path: "Loading/Find-render-blocking-resources" },
    reason: "FCP > 1.8s — checking render-blocking resources",
  },
];

// The follow-up steps the results call for, each snippet once: a path two rules ask for is added by
// the first, and a path in `skipPaths` (a step the workflow already ran) is left out.
export function nextSteps(results, rules = RULES, skipPaths = []) {
  const seen = new Set(skipPaths);
  const followUps = [];
  for (const result of results) {
    for (const rule of rules) {
      if (!rule.when(result)) continue;
      for (const step of [rule.append].flat()) {
        if (seen.has(step.path)) continue;
        seen.add(step.path);
        followUps.push({ ...step, reason: rule.reason });
      }
    }
  }
  return followUps;
}
