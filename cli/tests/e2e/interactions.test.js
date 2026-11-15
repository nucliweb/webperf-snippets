import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSnippets, VIEWPORT_PRESETS } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HTML = readFileSync(join(HERE, "../fixtures/index.html"), "utf8");
const INTERACT_FIXTURE = join(HERE, "../fixtures/interactions.json");

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(FIXTURE_HTML);
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
  10000
);

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

describe("runSnippets with interactScript", () => {
  it(
    "runs interactions before evaluating snippets and still returns results",
    async () => {
      const { results, pageErrors } = await runSnippets({
        url: baseUrl,
        items: [{ id: "LCP", path: "CoreWebVitals/LCP", source: loadSnippet("CoreWebVitals/LCP") }],
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
        interactScript: INTERACT_FIXTURE,
      });

      expect(pageErrors).toHaveLength(0);
      const lcp = results.find((r) => r.id === "LCP");
      expect(lcp.status).toBe("ok");
      expect(typeof lcp.value).toBe("number");
    },
    30000
  );

  it(
    "omitting interactScript does not change existing behaviour",
    async () => {
      const { results } = await runSnippets({
        url: baseUrl,
        items: [{ id: "LCP", path: "CoreWebVitals/LCP", source: loadSnippet("CoreWebVitals/LCP") }],
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });

      const lcp = results.find((r) => r.id === "LCP");
      expect(lcp.status).toBe("ok");
    },
    30000
  );

  it(
    "throws when interactScript contains an unknown action",
    async () => {
      const badScript = join(HERE, "../fixtures/bad-interactions.json");
      writeFileSync(badScript, JSON.stringify({ interactions: [{ action: "fly" }] }));
      try {
        await expect(
          runSnippets({
            url: baseUrl,
            items: [{ id: "LCP", path: "CoreWebVitals/LCP", source: loadSnippet("CoreWebVitals/LCP") }],
            waitMs: 500,
            viewport: VIEWPORT_PRESETS.mobile,
            interactScript: badScript,
          })
        ).rejects.toThrow('Unknown interaction action: "fly"');
      } finally {
        unlinkSync(badScript);
      }
    },
    30000
  );
});

describe("the CLI with a step whose element is not on the page", () => {
  it(
    "names the step in one line, after the 5 s a step waits for its element, and exits with 1",
    async () => {
      const file = join(tmpdir(), `absent-${process.pid}.json`);
      writeFileSync(file, JSON.stringify({ interactions: [{ action: "scroll" }, { action: "click", selector: "#not-on-the-page" }] }));
      const { code, stdout, stderr } = await new Promise((resolve) => {
        execFile("node", [join(HERE, "../../src/bin.js"), baseUrl, "--snippet", "LongTask", "--wait", "0", "--interact-script", file], { env: cliEnv() }, (err, stdout, stderr) =>
          resolve({ code: err ? err.code : 0, stdout, stderr })
        );
      });
      unlinkSync(file);
      expect(stderr).toBe('Step 2 of the interactions (click "#not-on-the-page") failed: page.click: Timeout 5000ms exceeded.\n');
      expect(stdout).toBe("");
      expect(code).toBe(1);
    },
    60000
  );
});
