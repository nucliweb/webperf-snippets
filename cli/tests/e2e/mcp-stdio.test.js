import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startContractServers } from "../helpers/contract.js";

// `webperf-snippets mcp` started as a real process, the way a client such as Claude Code starts it:
// the client spawns the command and speaks JSON-RPC through its standard input and output. The server
// answers both eras of the protocol: the modern one (2026-07-28, server/discover) and the legacy one
// (the initialize handshake of the 2025 revisions).
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));

let client;
let servers;

beforeAll(async () => {
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await servers.close();
});

async function connect(options) {
  client = new Client({ name: "test", version: "1.0.0" }, options);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"] }));
  return client;
}

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe("webperf-snippets mcp", () => {
  it("serves a client of the modern era", async () => {
    await connect({ versionNegotiation: { mode: { pin: "2026-07-28" } } });
    expect(client.getProtocolEra()).toBe("modern");
    const result = await client.callTool({ name: "list_snippets", arguments: { category: "Resources" } });
    expect(result.structuredContent.snippets.map((s) => s.name)).toEqual(["Resources/Network-Bandwidth-Connection-Quality"]);
  }, 30000);

  it("runs a snippet for a client of the modern era", async () => {
    await connect({ versionNegotiation: { mode: { pin: "2026-07-28" } } });
    const result = await client.callTool({ name: "run_snippet", arguments: { url: `${servers.base}/lcp-image`, snippet: "LCP", waitMs: 0 } });
    expect(result.structuredContent.result).toMatchObject({ script: "LCP", status: "ok" });
  }, 60000);

  it("keeps a page open across calls for a client of the modern era", async () => {
    await connect({ versionNegotiation: { mode: { pin: "2026-07-28" } } });
    const call = (name, args) => client.callTool({ name, arguments: args });
    const opened = await call("open_page", { url: `${servers.base}/slow-click`, track: ["INP"], waitMs: 0 });
    const { sessionId } = opened.structuredContent;
    await call("interact", { sessionId, steps: [{ action: "click", selector: "#slow" }] });
    const read = await call("read_results", { sessionId });
    expect(read.structuredContent.results[0]).toMatchObject({ script: "INP", status: "ok" });
  }, 60000);

  it("serves a client of the legacy era", async () => {
    await connect();
    expect(client.getProtocolEra()).toBe("legacy");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("list_snippets");
  }, 30000);
});
