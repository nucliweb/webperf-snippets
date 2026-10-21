import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";

// npx installs the package and its peer playwright, but not Chromium, which Playwright downloads apart.
// With no browser, the tools and the CLI say how to install it, instead of the error of Playwright,
// whose first line names a missing executable and whose advice installs every browser.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));
const INSTALL = "npx playwright install chromium";

let servers;
let noBrowsers;
let client;

beforeAll(async () => {
  servers = await startContractServers();
  // Playwright looks for its browsers here: an empty directory is a machine that never downloaded them
  noBrowsers = mkdtempSync(join(tmpdir(), "no-browsers-"));
}, 30000);

afterAll(async () => {
  await servers.close();
  rmSync(noBrowsers, { recursive: true, force: true });
});

afterEach(async () => {
  await client?.close();
  client = undefined;
});

const withoutBrowsers = () => ({ ...process.env, PLAYWRIGHT_BROWSERS_PATH: noBrowsers });

describe("with no Chromium installed", () => {
  it.each([
    ["run_snippet", () => ({ url: `${servers.base}/seeded`, snippet: "LCP", waitMs: 0 })],
    ["run_workflow", () => ({ url: `${servers.base}/seeded`, waitMs: 0 })],
    ["open_page", () => ({ url: `${servers.base}/seeded`, track: ["INP"], waitMs: 0 })],
  ])("%s answers how to install it", async (name, args) => {
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"], env: withoutBrowsers() }));
    const result = await client.callTool({ name, arguments: args() });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(INSTALL);
  }, 30000);

  it("the CLI says how to install it and exits with 1", async () => {
    const { code, stderr } = await new Promise((resolve) =>
      execFile(process.execPath, [BIN, `${servers.base}/seeded`, "--snippet", "LCP"], { env: withoutBrowsers() }, (err, stdout, stderr) =>
        resolve({ code: err?.code ?? 0, stderr })
      )
    );
    expect(code).toBe(1);
    expect(stderr).toContain(INSTALL);
    expect(stderr).not.toMatch(/\bat runSnippets\b/);
  }, 30000);
});

describe("once Chromium is installed", () => {
  it("open_page works without restarting the server", async () => {
    let attempts = 0;
    const browsers = [];
    const launchBrowser = async () => {
      if (attempts++ === 0) throw new Error("browserType.launch: Executable doesn't exist at /nowhere/chrome-headless-shell");
      const browser = await chromium.launch();
      browsers.push(browser);
      return browser;
    };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createServer({ launchBrowser }).connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
    try {
      const args = { url: `${servers.base}/seeded`, track: ["INP"], waitMs: 0 };
      const first = await client.callTool({ name: "open_page", arguments: args });
      expect(first.isError).toBe(true);
      expect(first.content[0].text).toContain(INSTALL);
      const second = await client.callTool({ name: "open_page", arguments: args });
      expect(second.isError).toBeFalsy();
      expect(second.structuredContent.sessionId).toBeTruthy();
    } finally {
      for (const browser of browsers) await browser.close();
    }
  }, 30000);
});
