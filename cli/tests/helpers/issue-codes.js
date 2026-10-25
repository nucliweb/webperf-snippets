import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const SCHEMA_PATH = join(ROOT, "snippets/SCHEMA.md");

// The code of an issue: kebab-case, unique within its snippet (see "Issue codes" in snippets/SCHEMA.md)
export const ISSUE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The snippets that emit issues without a code yet. It can only shrink: a snippet that gets its codes
// leaves the list, and the contract and the catalog then hold it to them.
export const PENDING_ISSUE_CODES = [
  "Loading/Back-Forward-Cache",
  "Loading/CSS-Media-Queries-Analysis",
  "Loading/Cache-Strategy-Analysis",
  "Loading/Client-Side-Redirect-Detection",
  "Loading/Compression-Audit",
  "Loading/Content-Visibility",
  "Loading/Critical-CSS-Detection",
  "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "Loading/Find-Images-With-Lazy-and-Fetchpriority",
  "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
  "Loading/Find-render-blocking-resources",
  "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
  "Loading/Inline-CSS-Info-and-Size",
  "Loading/Prefetch-Resource-Validation",
  "Loading/Priority-Hints-Audit",
  "Loading/Resource-Hints",
  "Loading/Resource-Hints-Validation",
  "Loading/Server-Timing-Early-Hints",
  "Loading/Service-Worker-Analysis",
  "Loading/Speculation-Rules-Inspector",
  "Loading/TTFB-Resources",
  "Loading/TTFB-Sub-Parts",
  "Loading/Webfont-Usage-Analyzer",
];

// The codes a snippet emits, read from its source: the literals of `code: "..."` in an object. A copy
// of a code already set (`code: issue.code`) is fine; `nonLiteral` counts the codes built at run time,
// which the catalog cannot check.
export function codesInSource(source) {
  const codes = new Set();
  let nonLiteral = 0;
  for (const [, value] of source.matchAll(/(?<=[{,]\s*)code:\s*([^,}\n]+)/g)) {
    const literal = value.match(/^"([^"]*)"\s*$/);
    if (literal) codes.add(literal[1]);
    else if (!/^[\w$]+(?:\?)?\.code\s*$/.test(value)) nonLiteral++;
  }
  return { codes, nonLiteral };
}

// The codes documented for each snippet in the "Issue codes" section of SCHEMA.md: one `### Name`
// per snippet, and a table whose first column is the code.
export function catalogOf(markdown) {
  const start = markdown.indexOf("\n## Issue codes\n");
  if (start === -1) return new Map();
  const next = markdown.indexOf("\n## ", start + 1);
  const section = markdown.slice(start, next === -1 ? undefined : next);
  const catalog = new Map();
  let current = null;
  for (const line of section.split("\n")) {
    const heading = line.match(/^### (\S+)\s*$/);
    if (heading) {
      current = new Set();
      catalog.set(heading[1], current);
      continue;
    }
    const row = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (row && current) current.add(row[1]);
  }
  return catalog;
}

export const readCatalog = () => catalogOf(readFileSync(SCHEMA_PATH, "utf8"));
