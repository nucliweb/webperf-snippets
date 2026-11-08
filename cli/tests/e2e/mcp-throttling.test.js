import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startContractServers } from "../helpers/contract.js";

// cpu and network of the tools that load a page, through `webperf-snippets mcp` started as a client
// starts it: the throttling of --cpu and --network, applied before the load and reported as the JSON
// of the CLI reports it.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));

let client;
let servers;

beforeAll(async () => {
  servers = await startContractServers();
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"] }));
}, 30000);

afterAll(async () => {
  await client?.close();
  await servers.close();
});

const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });

describe("throttling on the tools of the MCP server", () => {
  it("run_snippet loads the page throttled and says so, and says nothing without it", async () => {
    const throttled = await call("run_snippet", { url: `${servers.base}/lcp-image`, snippet: "LCP", waitMs: 0, cpu: 4, network: "fast-4g" });
    expect(throttled.isError, throttled.content[0].text).toBeFalsy();
    expect(throttled.structuredContent.throttling).toEqual({ cpu: 4, network: "fast-4g" });
    expect(throttled.structuredContent.result).toMatchObject({ script: "LCP", status: "ok" });

    const plain = await call("run_snippet", { url: `${servers.base}/lcp-image`, snippet: "LCP", waitMs: 0 });
    expect(plain.structuredContent).not.toHaveProperty("throttling");
  }, 60000);

  it("run_workflow loads the page throttled and says so", async () => {
    const result = await call("run_workflow", { url: `${servers.base}/lcp-image`, workflow: "core-web-vitals", waitMs: 0, cpu: 2 });
    expect(result.isError, result.content[0].text).toBeFalsy();
    expect(result.structuredContent.throttling).toEqual({ cpu: 2 });
  }, 60000);

  // 3G has a round trip of 2 s, so a throttled load takes longer than that; a local one takes milliseconds
  it("open_page throttles the page before it loads, and says so", async () => {
    const opened = await call("open_page", { url: `${servers.base}/slow-click`, track: ["INP"], waitMs: 0, cpu: 4, network: "3g" });
    expect(opened.isError, opened.content[0].text).toBeFalsy();
    const { sessionId, throttling, navMs } = opened.structuredContent;
    expect(throttling).toEqual({ cpu: 4, network: "3g" });
    expect(navMs).toBeGreaterThanOrEqual(2000);
    await call("interact", { sessionId, steps: [{ action: "click", selector: "#slow" }] });
    const read = await call("read_results", { sessionId });
    expect(read.structuredContent.results[0]).toMatchObject({ script: "INP", status: "ok" });
    await call("close_page", { sessionId });

    const plain = await call("open_page", { url: `${servers.base}/slow-click`, track: ["INP"], waitMs: 0 });
    expect(plain.structuredContent).not.toHaveProperty("throttling");
    expect(plain.structuredContent.navMs).toBeLessThan(2000);
    await call("close_page", { sessionId: plain.structuredContent.sessionId });
  }, 60000);
});
