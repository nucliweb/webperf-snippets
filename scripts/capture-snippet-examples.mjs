import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runSnippets, VIEWPORT_PRESETS } from "../cli/src/runner.js";
import { loadSnippet } from "../cli/src/load-snippet.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "cli/tests/fixtures");
const OUTPUT = join(ROOT, "skills/webperf-core-web-vitals/references/examples.json");
const CATEGORY = "CoreWebVitals";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webm": "video/webm",
};

function serveFixture(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const requested = resolve(FIXTURES, `.${decodeURIComponent(pathname)}`);
  if (requested !== FIXTURES && !requested.startsWith(`${FIXTURES}${sep}`)) {
    res.writeHead(403).end();
    return;
  }

  try {
    res.writeHead(200, { "Content-Type": MIME_TYPES[extname(requested)] ?? "application/octet-stream" });
    res.end(readFileSync(requested));
  } catch {
    res.writeHead(404).end();
  }
}

const server = createServer(serveFixture);
await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const url = `http://127.0.0.1:${server.address().port}/core-web-vitals.html`;
  const names = readdirSync(join(ROOT, "snippets", CATEGORY))
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.slice(0, -3))
    .sort();
  const examples = {};

  for (const name of names) {
    const path = `${CATEGORY}/${name}`;
    const { results, pageErrors } = await runSnippets({
      url,
      items: [{ id: name, path, source: loadSnippet(path) }],
      waitMs: 1000,
      viewport: VIEWPORT_PRESETS.desktop,
      ...(name === "INP" ? { interactions: join(FIXTURES, "core-web-vitals-interactions.json") } : {}),
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
    `${JSON.stringify({ fixture: "cli/tests/fixtures/core-web-vitals.html", viewport: "desktop", waitMs: 1000, examples }, null, 2)}\n`
  );
  process.stdout.write(`Captured ${Object.keys(examples).length} Core Web Vitals examples in ${OUTPUT}\n`);
} finally {
  await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
}
