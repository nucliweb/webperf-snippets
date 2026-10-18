import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { chromium } from "playwright";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";

// A page that stays open between calls: open it with the tracking snippets, interact with it, read
// what the snippets recorded and close it. The server launches Chromium through `launchBrowser`, so
// the tests hold the real browser and can see when it closes.
let servers;
let client;
let launched;

beforeAll(async () => {
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await servers.close();
});

afterEach(async () => {
  await client?.close();
  client = undefined;
  for (const browser of launched) if (browser.isConnected()) await browser.close();
});

async function connect(options = {}) {
  launched = [];
  const launchBrowser = async () => {
    const browser = await chromium.launch();
    launched.push(browser);
    return browser;
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ launchBrowser, ...options }).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
}

const call = (name, args, options) => client.callTool({ name, arguments: args }, options);
const open = (args, options) => call("open_page", { waitMs: 0, ...args }, options);
const text = (result) => result.content[0].text;

describe("the session tools", () => {
  it("are listed", async () => {
    await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const name of ["open_page", "close_page"]) expect(byName[name], name).toBeDefined();
    expect(byName.close_page.annotations).toMatchObject({ idempotentHint: true });
    expect(byName.open_page.inputSchema.required).toEqual(expect.arrayContaining(["url", "track"]));
  });
});

describe("a page that stays open", () => {
  it("only installs tracking snippets, and points to run_snippet for the others", async () => {
    await connect();
    const result = await open({ url: `${servers.base}/slow-click`, track: ["LCP"] });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/run_snippet/);
  });

  it("closes a page, and closing it again is not an error", async () => {
    await connect();
    const { sessionId } = (await open({ url: `${servers.base}/slow-click`, track: ["INP"] })).structuredContent;
    expect((await call("close_page", { sessionId })).structuredContent.closed).toBe(true);
    const again = await call("close_page", { sessionId });
    expect(again.isError).toBeFalsy();
    expect(again.structuredContent.closed).toBe(false);
  }, 60000);
});

describe("the limits", () => {
  it("opens at most three pages at a time", async () => {
    await connect();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await open({ url: `${servers.base}/slow-click`, track: ["INP"] })).structuredContent.sessionId);
    const fourth = await open({ url: `${servers.base}/slow-click`, track: ["INP"] });
    expect(fourth.isError).toBe(true);
    expect(text(fourth)).toMatch(/close_page/);
    await call("close_page", { sessionId: ids[0] });
    expect((await open({ url: `${servers.base}/slow-click`, track: ["INP"] })).isError).toBeFalsy();
  }, 90000);

});

describe("cleaning up", () => {
  it("closes Chromium when the client leaves", async () => {
    await connect();
    await open({ url: `${servers.base}/slow-click`, track: ["INP"] });
    const [browser] = launched;
    expect(browser.isConnected()).toBe(true);
    await client.close();
    client = undefined;
    await expect.poll(() => browser.isConnected(), { timeout: 5000 }).toBe(false);
  }, 60000);

  it("drops the page when the client cancels open_page during a slow load", async () => {
    // A page that never answers: the load waits until the call is cancelled
    const hanging = createHttpServer(() => {});
    await new Promise((resolve) => hanging.listen(0, "127.0.0.1", resolve));
    try {
      await connect();
      const controller = new AbortController();
      const opening = open({ url: `http://127.0.0.1:${hanging.address().port}/`, track: ["INP"] }, { signal: controller.signal });
      await expect.poll(() => launched.length, { timeout: 10000 }).toBe(1);
      setTimeout(() => controller.abort("the user stopped it"), 300);
      await expect(opening).rejects.toThrow();
      await expect.poll(() => launched[0].contexts().length, { timeout: 5000 }).toBe(0);
    } finally {
      hanging.closeAllConnections();
      await new Promise((resolve) => hanging.close(resolve));
    }
  }, 60000);
});
