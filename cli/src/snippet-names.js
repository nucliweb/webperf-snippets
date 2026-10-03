import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SNIPPET_DIRS } from "./load-snippet.js";

// The categories whose snippets run headlessly. DevTools-Overrides pairs are pasted by hand.
const CATEGORIES = ["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"];

// Short names for the snippets people run most. Any snippet also answers to its own name.
const SNIPPET_ALIASES = {
  LCP: "CoreWebVitals/LCP",
  CLS: "CoreWebVitals/CLS",
  INP: "CoreWebVitals/INP",
  "LCP-Subparts": "CoreWebVitals/LCP-Subparts",
  fonts: "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
  "Fonts-Preloaded-Loaded-and-used-above-the-fold":
    "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
  // Tier 1 — Loading
  "render-blocking": "Loading/Find-render-blocking-resources",
  "Find-render-blocking-resources": "Loading/Find-render-blocking-resources",
  "resource-hints": "Loading/Resource-Hints-Validation",
  "Resource-Hints-Validation": "Loading/Resource-Hints-Validation",
  "preload-scripts": "Loading/Validate-Preload-Async-Defer-Scripts",
  "Validate-Preload-Async-Defer-Scripts": "Loading/Validate-Preload-Async-Defer-Scripts",
  "priority-hints": "Loading/Priority-Hints-Audit",
  "Priority-Hints-Audit": "Loading/Priority-Hints-Audit",
  "critical-css": "Loading/Critical-CSS-Detection",
  "Critical-CSS-Detection": "Loading/Critical-CSS-Detection",
  ttfb: "Loading/TTFB-Sub-Parts",
  "TTFB-Sub-Parts": "Loading/TTFB-Sub-Parts",
  "script-parties": "Loading/First-And-Third-Party-Script-Info",
  "First-And-Third-Party-Script-Info": "Loading/First-And-Third-Party-Script-Info",
  "script-loading": "Loading/Script-Loading",
  "Script-Loading": "Loading/Script-Loading",
  // Tier 2 — Media
  "lazy-atf": "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "Find-Above-The-Fold-Lazy-Loaded-Images": "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "lazy-conflict": "Loading/Find-Images-With-Lazy-and-Fetchpriority",
  "Find-Images-With-Lazy-and-Fetchpriority": "Loading/Find-Images-With-Lazy-and-Fetchpriority",
  "eager-below-fold": "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
  "Find-non-Lazy-Loaded-Images-outside-of-the-viewport":
    "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
};
let cache = null;

// Every runnable snippet as "Category/Name", read from the bundled copy or the workspace.
export function listSnippets() {
  if (cache) return cache;
  const dir = SNIPPET_DIRS.find((d) => existsSync(join(d, CATEGORIES[0])));
  cache = dir
    ? CATEGORIES.flatMap((category) =>
        readdirSync(join(dir, category))
          .filter((file) => file.endsWith(".js"))
          .map((file) => `${category}/${file.slice(0, -3)}`)
      ).sort()
    : [];
  return cache;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

// Turns an alias, a bare snippet name or a Category/Name path into a Category/Name path.
// Only a listed snippet resolves, so a name can never point at a file outside the snippets.
export function resolveSnippetName(name) {
  if (Object.hasOwn(SNIPPET_ALIASES, name)) return SNIPPET_ALIASES[name];
  const all = listSnippets();
  const wanted = name.toLowerCase();
  const found = all.find((path) => path.toLowerCase() === wanted || path.split("/")[1].toLowerCase() === wanted);
  if (found) return found;

  const bare = wanted.split("/").pop();
  const closest = all
    .map((path) => ({ path, score: distance(bare, path.split("/")[1].toLowerCase()) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((c) => c.path);
  throw new Error(`Unknown snippet "${name}". Closest: ${closest.join(", ")}. Run with a snippet name such as Compression-Audit, or a Category/Name path.`);
}
