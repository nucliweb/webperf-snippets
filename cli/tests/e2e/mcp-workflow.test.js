import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";

// run_workflow runs the workflows of the CLI with their decision tree.
let servers;
let late;
let client;

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createHttpServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
const base = (server) => `http://127.0.0.1:${server.address().port}`;

beforeAll(async () => {
  servers = await startContractServers();
  // The largest paint comes 2.7 s after the load, so LCP is over 2.5 s and the decision tree adds LCP-Subparts
  late = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<!DOCTYPE html><title>late</title><p>.</p><script>setTimeout(() => { document.body.innerHTML = \'<h1 style="font-size:80px">A late heading</h1>\'; }, 2700);</script>');
  });
}, 30000);

afterAll(async () => {
  await servers.close();
  await new Promise((resolve) => late.close(resolve));
});

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
}

const call = (name, args) => client.callTool({ name, arguments: args });
const text = (result) => result.content[0].text;

describe("run_workflow", () => {
  it("is listed with the workflows of the CLI, as a read-only tool that reaches the web", async () => {
    await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "run_workflow");
    expect(tool.inputSchema.properties.workflow.enum).toEqual(["core-web-vitals", "audit", "loading", "interaction"]);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });

  it("runs the steps of the workflow and the follow-ups of its decision tree", async () => {
    await connect();
    const result = await call("run_workflow", { url: base(late), workflow: "core-web-vitals", waitMs: 3500 });
    expect(result.isError).toBeFalsy();
    const { results } = result.structuredContent;
    expect(results.map((r) => r.id)).toEqual(["LCP", "CLS", "LCP-Subparts"]);
    expect(results[0].value).toBeGreaterThan(2500);
    expect(results[2].reason).toMatch(/LCP/);
  }, 60000);

  it("explains the steps it skips with the tools of the MCP server, not the flags of the CLI", async () => {
    await connect();
    const result = await call("run_workflow", { url: `${servers.base}/seeded`, workflow: "interaction", waitMs: 0 });
    const skipped = result.structuredContent.results.filter((r) => r.status === "skipped");
    expect(skipped.map((r) => r.id)).toEqual(["interactions", "input-latency"]);
    for (const r of skipped) {
      expect(r.reason).toMatch(/open_page/);
      expect(r.reason).not.toMatch(/--interact-script/);
    }
  }, 60000);

  it("answers a page that does not load with a tool error", async () => {
    await connect();
    const closed = await listen(() => {});
    const url = base(closed);
    await new Promise((resolve) => closed.close(resolve));
    const result = await call("run_workflow", { url, workflow: "core-web-vitals", waitMs: 0 });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Could not load/);
  }, 60000);
});
