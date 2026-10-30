import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { startContractServers } from "../helpers/contract.js";

// run_snippet opens a real Chromium on the local fixture pages, through a client joined in memory.
let servers;
let client;

beforeAll(async () => {
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await servers.close();
});

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

const run = (args, options) => client.callTool({ name: "run_snippet", arguments: { waitMs: 0, ...args } }, options);

describe("run_snippet", () => {
  it("is listed with the URL and the snippet as required arguments, and as a tool that reaches the web", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "run_snippet");
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(["url", "snippet"]));
    expect(tool.inputSchema.properties.viewport.enum).toEqual(["mobile", "tablet", "desktop"]);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
  });

  it("returns a small result whole by default, since a summary would cost the agent a turn for the details", async () => {
    const result = await run({ url: `${servers.base}/lcp-image`, snippet: "LCP" });
    expect(result.structuredContent.detail).toBe("full");
    expect(result.structuredContent.result.details).toEqual(expect.any(Object));
    // A whole object leaves nothing for get_details, so there is no run to ask it about
    expect(result.structuredContent.runId).toBeUndefined();
  }, 60000);

  it("returns a summary of the result with the id of the run, as structured content and as text", async () => {
    const result = await run({ url: `${servers.base}/lcp-image`, snippet: "LCP", viewport: "desktop", detail: "summary" });
    expect(result.isError).toBeFalsy();
    const { structuredContent } = result;
    expect(structuredContent).toMatchObject({ snippet: "CoreWebVitals/LCP", viewport: "desktop", runId: expect.any(String), detail: "summary" });
    expect(structuredContent.result).toMatchObject({ script: "LCP", status: "ok", metric: "LCP", unit: "ms", rating: expect.any(String) });
    expect(structuredContent.result.value).toBeGreaterThan(0);
    expect(structuredContent.result.details).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(structuredContent);
  }, 60000);

  it("gives the full result of the same run with get_details, without measuring again", async () => {
    const { structuredContent: summary } = await run({ url: `${servers.base}/lcp-image`, snippet: "LCP", detail: "summary" });
    const details = await client.callTool({ name: "get_details", arguments: { runId: summary.runId, snippet: "LCP" } });
    expect(details.isError).toBeFalsy();
    expect(details.structuredContent).toMatchObject({ runId: summary.runId, snippet: "CoreWebVitals/LCP" });
    expect(details.structuredContent.result).toMatchObject({ script: "LCP", value: summary.result.value });
    expect(details.structuredContent.result.details).toEqual(expect.any(Object));
    expect(JSON.parse(details.content[0].text)).toEqual(details.structuredContent);
  }, 60000);

  it("returns the full result at once with detail full", async () => {
    const result = await run({ url: `${servers.base}/lcp-image`, snippet: "LCP", detail: "full" });
    expect(result.structuredContent.result.details).toEqual(expect.any(Object));
    expect(result.structuredContent.runId).toBeUndefined();
  }, 60000);

  it("answers get_details for a run it does not keep with a tool error that says to run again", async () => {
    const result = await client.callTool({ name: "get_details", arguments: { runId: "nope", snippet: "LCP" } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/run the tool again/i);
  });

  it("accepts the aliases and the Category/Name paths of the CLI", async () => {
    const result = await run({ url: `${servers.base}/seeded`, snippet: "render-blocking" });
    expect(result.structuredContent.snippet).toBe("Loading/Find-render-blocking-resources");
    expect(result.structuredContent.result.script).toBe("Find-render-blocking-resources");
  }, 60000);

  it("reports the progress of the run when the client asks for it", async () => {
    const updates = [];
    await run({ url: `${servers.base}/lcp-image`, snippet: "LCP" }, { onprogress: (u) => updates.push(u) });
    expect(updates.map((u) => u.progress)).toEqual([1, 2, 3]);
    expect(updates.every((u) => u.total === 3 && u.message)).toBe(true);
  }, 60000);

  it("keeps a snippet that reports an error or no support as a result, not as a failure of the tool", async () => {
    // A page without images: the snippet runs and says there is nothing to audit
    const result = await run({ url: `${servers.base}/lcp-text`, snippet: "LCP-Video-Candidate" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.result.script).toBe("LCP-Video-Candidate");
  }, 60000);

  it("answers an unknown snippet with a tool error that names the closest ones", async () => {
    const result = await run({ url: `${servers.base}/seeded`, snippet: "Render-Blocking-Resources" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Closest: .*Find-render-blocking-resources/);
  });

  it("answers a page that does not load with a tool error", async () => {
    // A port that was just free: nothing listens on it, so the connection is refused
    const closed = createHttpServer();
    await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address();
    await new Promise((resolve) => closed.close(resolve));
    const result = await run({ url: `http://127.0.0.1:${port}/`, snippet: "LCP" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Could not load .*ERR_CONNECTION_REFUSED/);
  }, 60000);

  it("refuses URLs that are not http or https", async () => {
    const result = await run({ url: "file:///etc/hosts", snippet: "LCP" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/http/);
  });

  it("refuses the tracking snippets, which need interactions", async () => {
    const result = await run({ url: `${servers.base}/seeded`, snippet: "INP" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/interaction/i);
  });
});
