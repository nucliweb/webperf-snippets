import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSnippets, VIEWPORT_PRESETS } from "../cli/src/runner.js";
import { loadSnippet } from "../cli/src/load-snippet.js";
import { startContractServers } from "../cli/tests/helpers/contract.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORY = "CoreWebVitals";
const OUTPUT = join(ROOT, "snippets", CATEGORY, "examples.json");

const SCENARIOS = {
  INP: { page: "/seeded", interactions: [{ action: "click", selector: "#go" }] },
  "LCP-Video-Candidate": { page: "/video-poster.html" },
};
const DEFAULT_SCENARIO = { page: "/seeded" };

const servers = await startContractServers();

try {
  const names = readdirSync(join(ROOT, "snippets", CATEGORY))
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.slice(0, -3))
    .sort();
  const examples = {};

  for (const name of names) {
    const scenario = SCENARIOS[name] ?? DEFAULT_SCENARIO;
    const path = `${CATEGORY}/${name}`;
    const { results, pageErrors } = await runSnippets({
      url: `${servers.base}${scenario.page}`,
      items: [{ id: name, path, source: loadSnippet(path) }],
      waitMs: 1000,
      viewport: VIEWPORT_PRESETS.desktop,
      ...(scenario.interactions ? { interactions: scenario.interactions } : {}),
    });
    const { id, ...result } = results[0];
    if (pageErrors.length > 0) throw new Error(`${name} produced a page error: ${pageErrors.join("; ")}`);
    if (!result || !["ok", "error", "unsupported"].includes(result.status)) {
      throw new Error(`${name} did not return a valid result object`);
    }
    if (result.status !== "ok") {
      throw new Error(`${name} returned ${result.status}: ${result.error ?? "no result"}`);
    }
    examples[name] = result;
  }

  writeFileSync(
    OUTPUT,
    `${JSON.stringify({ viewport: "desktop", waitMs: 1000, examples }, null, 2)}\n`
  );
  process.stdout.write(`Captured ${Object.keys(examples).length} ${CATEGORY} examples in ${OUTPUT}\n`);
} finally {
  await servers.close();
}
