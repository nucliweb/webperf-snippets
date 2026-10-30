import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";

// run_workflow runs the workflows of the CLI with their decision tree; get_crux reads field data from
// a fake CrUX API on localhost, so no key or network is needed.
const KEY = "secret-key-for-tests";

// What the CrUX API returns: LCP and INP p75 as numbers, CLS p75 as a string
const RECORD = {
  record: {
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 2800 } },
      cumulative_layout_shift: { percentiles: { p75: "0.08" } },
      interaction_to_next_paint: { percentiles: { p75: 220 } },
    },
  },
};

let servers;
let late;
let crux;
let cruxRequests;
let cruxAnswer;
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
  crux = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      cruxRequests.push({ url: req.url, body: JSON.parse(body) });
      cruxAnswer(res);
    });
  });
}, 30000);

afterAll(async () => {
  await servers.close();
  await new Promise((resolve) => late.close(resolve));
  await new Promise((resolve) => crux.close(resolve));
});

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(env = {}) {
  cruxRequests = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ env: { WEBPERF_CRUX_ENDPOINT: `${base(crux)}/v1/records:queryRecord`, ...env } }).connect(serverTransport);
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

  it("returns summaries by default when the whole results are large", async () => {
    await connect();
    const { structuredContent } = await call("run_workflow", { url: `${servers.base}/seeded`, workflow: "audit", waitMs: 0 });
    expect(structuredContent.detail).toBe("summary");
    for (const r of structuredContent.results) expect(r.details).toBeUndefined();
  }, 60000);

  it("returns a summary of each step, and get_details gives the full result of a follow-up of the same run", async () => {
    await connect();
    const { structuredContent } = await call("run_workflow", { url: base(late), workflow: "core-web-vitals", waitMs: 3500, detail: "summary" });
    expect(structuredContent.runId).toEqual(expect.any(String));
    for (const r of structuredContent.results) expect(r.details).toBeUndefined();

    const details = await call("get_details", { runId: structuredContent.runId, snippet: "LCP-Subparts" });
    expect(details.isError).toBeFalsy();
    expect(details.structuredContent.result).toMatchObject({ id: "LCP-Subparts", script: "LCP-Subparts", reason: expect.stringMatching(/LCP/) });
    expect(details.structuredContent.result.details).toEqual(expect.any(Object));
  }, 60000);

  it("gives the calls of the next steps the decision tree asks for after run_snippet, and none when the result is good", async () => {
    await connect();
    const slow = await call("run_snippet", { url: base(late), snippet: "LCP", waitMs: 3500, viewport: "desktop" });
    expect(slow.structuredContent.result.value).toBeGreaterThan(2500);
    expect(slow.structuredContent.nextSteps).toContainEqual({
      tool: "run_snippet",
      args: { url: base(late), snippet: "CoreWebVitals/LCP-Subparts", viewport: "desktop", waitMs: 3500 },
      reason: expect.stringMatching(/LCP > 2\.5s/),
    });

    const fast = await call("run_snippet", { url: `${servers.base}/lcp-text`, snippet: "LCP", waitMs: 0 });
    expect(fast.structuredContent.result.value).toBeLessThan(2500);
    expect(fast.structuredContent.nextSteps).toBeUndefined();
  }, 60000);

  it("gives the call that opens a page with the steps a workflow skipped", async () => {
    await connect();
    const result = await call("run_workflow", { url: `${servers.base}/seeded`, workflow: "interaction", waitMs: 0 });
    expect(result.structuredContent.nextSteps).toEqual([
      {
        tool: "open_page",
        args: { url: `${servers.base}/seeded`, track: ["CoreWebVitals/INP", "Interaction/Interactions", "Interaction/Input-Latency-Breakdown"], viewport: "mobile" },
        reason: expect.stringMatching(/clicks and key presses/),
      },
    ]);
  }, 60000);

  it("explains the steps it skips with the tools of the MCP server, not the flags of the CLI", async () => {
    await connect();
    const result = await call("run_workflow", { url: `${servers.base}/seeded`, workflow: "interaction", waitMs: 0 });
    const skipped = result.structuredContent.results.filter((r) => r.status === "skipped");
    expect(skipped.map((r) => r.id)).toEqual(["INP", "interactions", "input-latency"]);
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

describe("get_crux", () => {
  it("returns the p75 of the field data for the form factor asked", async () => {
    await connect({ CRUX_API_KEY: KEY });
    cruxAnswer = (res) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(RECORD));
    const result = await call("get_crux", { url: "https://example.com/", formFactor: "desktop" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ url: "https://example.com/", formFactor: "desktop", scope: "url" });
    expect(result.structuredContent.metrics.LCP).toEqual({ p75: 2800, rating: "needs-improvement", unit: "ms" });
    expect(cruxRequests[0].body).toEqual({ url: "https://example.com/", formFactor: "DESKTOP" });
  });

  it("reads the key from the environment of the server, never from the arguments, and never returns it", async () => {
    await connect({ CRUX_API_KEY: KEY });
    cruxAnswer = (res) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(RECORD));
    const { tools } = await client.listTools();
    expect(Object.keys(tools.find((t) => t.name === "get_crux").inputSchema.properties)).not.toContain("key");
    const result = await call("get_crux", { url: "https://example.com/" });
    expect(cruxRequests[0].url).toContain(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("keeps a page without field data as a result, not as a failure", async () => {
    await connect({ CRUX_API_KEY: KEY });
    cruxAnswer = (res) => res.writeHead(404, { "Content-Type": "application/json" }).end("{}");
    const result = await call("get_crux", { url: "https://example.com/new-page" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.unavailable).toMatch(/not in the CrUX dataset/);
  });

  it("answers an API error with a tool error that does not contain the key", async () => {
    await connect({ CRUX_API_KEY: KEY });
    cruxAnswer = (res) => res.writeHead(403).end("forbidden");
    const result = await call("get_crux", { url: "https://example.com/" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/403/);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("explains how to set the key when the server has none", async () => {
    await connect({ CRUX_API_KEY: undefined });
    const result = await call("get_crux", { url: "https://example.com/" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/CRUX_API_KEY/);
    expect(text(result)).toMatch(/claude mcp add .*-e CRUX_API_KEY/);
    expect(cruxRequests).toHaveLength(0);
  });
});
