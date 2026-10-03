import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");

// Resolution order: bundled (published package) → workspace root (dev).
export const SNIPPET_DIRS = [
  join(PKG_ROOT, "snippets"),
  resolve(PKG_ROOT, "..", "snippets"),
];

export function loadSnippet(relativePath) {
  for (const dir of SNIPPET_DIRS) {
    try {
      return readFileSync(join(dir, `${relativePath}.js`), "utf8");
    } catch {
      // try next directory
    }
  }
  throw new Error(`Snippet not found: ${relativePath}`);
}
