import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startContractServers } from "../helpers/contract.js";

// Which Chromium the CLI and the MCP server launch, for each way of installing it. Playwright keeps
// each browser in a directory of its own under PLAYWRIGHT_BROWSERS_PATH, so a directory with links to
// some of them is a machine that installed only those. With no browser at all, missing-browser.test.js.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));
const LAUNCHED = fileURLToPath(new URL("../helpers/launched-chromium.js", import.meta.url));

// The directories of this Playwright, found from the path of its full Chromium:
// <browsers>/chromium-<revision>/…; the headless shell is chromium_headless_shell-<revision>
const fullPath = chromium.executablePath();
const parts = fullPath.split(sep);
const at = parts.findIndex((p) => /^chromium-\d+$/.test(p));
const browsers = parts.slice(0, at).join(sep);
const FULL = parts[at];
const SHELL = FULL.replace("chromium-", "chromium_headless_shell-");
const INSTALLED = existsSync(fullPath) && existsSync(join(browsers, SHELL));

const INSTALLS = [
  // npx playwright install chromium: what the README and the message of a missing browser say
  { name: "both", dirs: [FULL, SHELL], launches: FULL, binary: "the full Chromium", build: "chromium" },
  // npx playwright install --no-shell chromium
  { name: "the full Chromium only", dirs: [FULL], launches: FULL, binary: "the full Chromium", build: "chromium" },
  // npx playwright install --only-shell chromium
  { name: "the headless shell only", dirs: [SHELL], launches: SHELL, binary: "the headless shell", build: "chromium-headless-shell" },
];

let servers;
let client;
const roots = [];

beforeAll(async () => {
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await servers?.close();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

afterEach(async () => {
  await client?.close();
  client = undefined;
});

// A browsers directory with links to the installed directories, as an environment for a process
function installing(dirs) {
  const root = mkdtempSync(join(tmpdir(), "browsers-"));
  roots.push(root);
  for (const dir of dirs) symlinkSync(join(browsers, dir), join(root, dir), "dir");
  return { root, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root } };
}

const run = (args, env) =>
  new Promise((resolve) =>
    execFile(process.execPath, args, { env }, (err, stdout, stderr) => resolve({ code: err?.code ?? 0, stdout, stderr }))
  );

describe.skipIf(!INSTALLED)("the Chromium that is launched", () => {
  describe.each(INSTALLS)("with $name installed", ({ dirs, launches, binary, build }) => {
    it(`launches ${binary}`, async () => {
      const { root, env } = installing(dirs);
      const { code, stdout, stderr } = await run([LAUNCHED], env);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(stdout.startsWith(join(root, launches) + sep)).toBe(true);
    }, 30000);

    it("the CLI measures LCP, and names that browser in the conditions", async () => {
      const { env } = installing(dirs);
      const { code, stdout, stderr } = await run([BIN, `${servers.base}/seeded`, "--snippet", "LCP", "--wait", "0", "--json"], env);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      const { results, conditions } = JSON.parse(stdout);
      expect(results[0].status).toBe("ok");
      expect(results[0].value).toBeGreaterThan(0);
      expect(conditions.browser).toEqual({ build, mode: "headless", version: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/) });
    }, 30000);

    it("the MCP server measures LCP with run_snippet, and names that browser in the conditions of the run", async () => {
      const { env } = installing(dirs);
      client = new Client({ name: "test", version: "1.0.0" });
      await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"], env }));
      const result = await client.callTool({ name: "run_snippet", arguments: { url: `${servers.base}/seeded`, snippet: "LCP", waitMs: 0 } });
      expect(result.isError).toBeFalsy();
      const lcp = result.structuredContent.result;
      expect(lcp.status).toBe("ok");
      expect(lcp.value).toBeGreaterThan(0);
      const resource = await client.readResource({ uri: `webperf://runs/${result.structuredContent.runId}` });
      expect(JSON.parse(resource.contents[0].text).conditions.browser).toEqual({ build, mode: "headless", version: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/) });
    }, 30000);
  });
});
