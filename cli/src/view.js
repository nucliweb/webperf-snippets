import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SNIPPET_DIRS } from "./load-snippet.js";

// The view of a result (snippets/_view/): the labels, formats and order the extension shows, so the
// reports say the same. It comes with the snippets, in the package or at the root of the repository.
const dir = SNIPPET_DIRS.find((d) => existsSync(join(d, "_view", "index.js")));
if (!dir) throw new Error("The view of the results is missing: snippets/_view/index.js");

export const { describeResult } = await import(pathToFileURL(join(dir, "_view", "index.js")).href);
