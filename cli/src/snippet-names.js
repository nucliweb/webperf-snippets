import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SNIPPET_DIRS } from "./load-snippet.js";

// The categories whose snippets run headlessly. DevTools-Overrides pairs are pasted by hand.
export const CATEGORIES = ["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"];

// Short names for the snippets people run most. Any snippet also answers to its own name.
const SNIPPET_ALIASES = {
  LCP: "CoreWebVitals/LCP",
  CLS: "CoreWebVitals/CLS",
  INP: "CoreWebVitals/INP",
  "LCP-Subparts": "CoreWebVitals/LCP-Subparts",
  // The full names of the metrics, in any case: the words someone types who does not know the acronym
  "Largest-Contentful-Paint": "CoreWebVitals/LCP",
  "Cumulative-Layout-Shift": "CoreWebVitals/CLS",
  "Interaction-to-Next-Paint": "CoreWebVitals/INP",
  "First-Contentful-Paint": "Loading/FCP",
  "Time-to-First-Byte": "Loading/TTFB",
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

// The short names of a snippet, such as "render-blocking" for Loading/Find-render-blocking-resources.
// Its own name always works too, so it is not listed.
export function aliasesOf(path) {
  const own = path.split("/")[1];
  return Object.entries(SNIPPET_ALIASES)
    .filter(([alias, target]) => target === path && alias !== own)
    .map(([alias]) => alias);
}

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

// The edits between two strings. Swapping two neighbours counts as one: LPC is one edit from LCP.
function distance(a, b) {
  let twoBack = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], twoBack[j - 2] + 1);
    }
    twoBack = previous;
    previous = row;
  }
  return previous[b.length];
}

// The words of a name, without their endings: LongTask and long-tasks give the same two.
function wordsOf(name) {
  return name
    .replace(/([a-z])([A-Z])|([A-Z])([A-Z][a-z])/g, "$1$3-$2$4")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.length > 4 ? word.replace(/(ing|ed)?s?$/, "") : word));
}

// The words of a guess that say nothing of what a snippet looks at. They rank, but do not make a match.
const GENERIC_WORDS = new Set(wordsOf("and the of with by find audit analysis analyzer info detection validation performance"));

// Equal, inside a longer word of the name (font in webfont), or a typo apart. Words of three letters only
// count when equal, and a typo needs five letters: size and side are one edit apart.
function isSameWord(guessed, word) {
  if (guessed === word) return true;
  if (Math.min(guessed.length, word.length) < 4) return false;
  return word.includes(guessed) || (Math.max(guessed.length, word.length) > 4 && distance(guessed, word) === 1);
}

// How close a guess is to a name or an alias of a snippet, from 0 to 1: the share of its words the name
// has, or how alike they are spelled, which catches what splits into other words, such as LCP-Sub-Parts.
// Under MIN_SPELLING the likeness is chance: any two short names share letters.
const MIN_SPELLING = 0.65;
const MIN_SCORE = 0.5;
const NEAR_THE_FIRST = 0.75;
const MAX_SUGGESTIONS = 5;

function closeness(guess, name) {
  const [a, b] = [guess.toLowerCase(), name.toLowerCase()];
  const spelling = 1 - distance(a, b) / Math.max(a.length, b.length);
  const words = wordsOf(name);
  const guessed = wordsOf(guess);
  const found = guessed.filter((word) => words.some((other) => isSameWord(word, other)));
  const shared = found.some((word) => !GENERIC_WORDS.has(word)) ? found.length / guessed.length : 0;
  return Math.max(spelling >= MIN_SPELLING ? spelling : 0, shared);
}

// The snippets a guess may have meant, the closest first, and on a tie the shortest name, which says the
// least else: Script-Loading before Inline-Script-Info-and-Size.
function suggestionsFor(guess) {
  const ranked = listSnippets()
    .map((path) => {
      const name = path.split("/")[1];
      const score = Math.max(...[name, ...aliasesOf(path)].map((n) => closeness(guess, n)));
      return { path, score, length: wordsOf(name).length };
    })
    .filter((snippet) => snippet.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.length - b.length);
  return ranked
    .filter((snippet) => snippet.score >= ranked[0].score * NEAR_THE_FIRST)
    .slice(0, MAX_SUGGESTIONS)
    .map((snippet) => snippet.path);
}

// An alias as written, then a snippet name in any case, then an alias in any case: TTFB is the snippet,
// and ttfb the alias of its sub-parts.
function findSnippet(name) {
  if (Object.hasOwn(SNIPPET_ALIASES, name)) return SNIPPET_ALIASES[name];
  const wanted = name.toLowerCase();
  const snippet = listSnippets().find((path) => path.toLowerCase() === wanted || path.split("/")[1].toLowerCase() === wanted);
  if (snippet) return snippet;
  const alias = Object.keys(SNIPPET_ALIASES).find((key) => key.toLowerCase() === wanted);
  return alias && SNIPPET_ALIASES[alias];
}

// Turns an alias, a bare snippet name or a Category/Name path into a Category/Name path. The name decides
// and not the category: no two snippets share a name, so a wrong category can only mean that snippet.
// Only a listed snippet resolves, so a name can never point at a file outside the snippets.
export function resolveSnippetName(name) {
  const [category, bare, ...rest] = name.split("/");
  const inCategory = bare && rest.length === 0 && CATEGORIES.some((c) => c.toLowerCase() === category.toLowerCase());
  const found = findSnippet(name) ?? (inCategory ? findSnippet(bare) : undefined);
  if (found) return found;

  const suggestions = suggestionsFor(name.split("/").pop());
  const answer = suggestions.length > 0 ? `Closest: ${suggestions.join(", ")}.` : "No snippet has a close name.";
  throw new Error(`Unknown snippet "${name}". ${answer} Every name is in the list_snippets tool of the MCP server and in https://webperf-snippets.net/llms.txt.`);
}
