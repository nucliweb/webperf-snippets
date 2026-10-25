import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const SCHEMA_PATH = join(ROOT, "snippets/SCHEMA.md");

// The code of an issue: kebab-case, unique within its snippet (see "Issue codes" in snippets/SCHEMA.md)
export const ISSUE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The codes a snippet emits, read from its source: the literals of `code: "..."`, or in single quotes,
// in an object. A copy of a code already set (`code: issue.code`) is fine; `nonLiteral` counts the codes
// built at run time, which the catalog cannot check.
export function codesInSource(source) {
  const codes = new Set();
  let nonLiteral = 0;
  for (const [, value] of source.matchAll(/(?<=[{,]\s*)code:\s*([^,}\n]+)/g)) {
    const literal = value.match(/^(["'])([^"']*)\1\s*$/);
    if (literal) codes.add(literal[2]);
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
