import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";

// Resources are documents the client attaches to the context. They run no browser, so a client in
// memory is enough.
let client;

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

const read = async (uri) => (await client.readResource({ uri })).contents[0];

describe("resources", () => {
  it("are declared, with the general contract, a template per snippet and a template per category", async () => {
    expect(client.getServerCapabilities()).toHaveProperty("resources");
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual(["webperf://schema/{snippet}", "webperf://workflows/{category}"]);
  });

  it("list the general contract, the snippets with a section in SCHEMA.md and the five workflows", async () => {
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain("webperf://schema");
    expect(uris).toContain("webperf://schema/LCP");
    expect(uris).toContain("webperf://schema/INP");
    // A snippet without a section of its own is not listed
    expect(uris).not.toContain("webperf://schema/Back-Forward-Cache");
    expect(uris.filter((u) => u.startsWith("webperf://workflows/")).sort()).toEqual([
      "webperf://workflows/CoreWebVitals",
      "webperf://workflows/Interaction",
      "webperf://workflows/Loading",
      "webperf://workflows/Media",
      "webperf://workflows/Resources",
    ]);
  });

  it("give the general contract without the sections of each snippet", async () => {
    const schema = await read("webperf://schema");
    expect(schema.mimeType).toBe("text/markdown");
    expect(schema.text).toMatch(/## Base Shape/);
    expect(schema.text).toMatch(/## Guidelines for Agents/);
    expect(schema.text).not.toMatch(/^#### LCP$/m);
    expect(schema.text.length).toBeLessThan(20000);
  });

  it("give the section of one snippet", async () => {
    const lcp = await read("webperf://schema/LCP");
    expect(lcp.text).toMatch(/^#### LCP$/m);
    expect(lcp.text).toMatch(/"script": "LCP"/);
    expect(lcp.text).not.toMatch(/^#### CLS$/m);
  });

  it("give the workflows and the decision tree of a category", async () => {
    const loading = await read("webperf://workflows/Loading");
    expect(loading.mimeType).toBe("text/markdown");
    expect(loading.text).toMatch(/### After TTFB\.js/);
  });

  it("do not answer for a snippet or a category they do not have", async () => {
    await expect(client.readResource({ uri: "webperf://schema/Back-Forward-Cache" })).rejects.toThrow();
    await expect(client.readResource({ uri: "webperf://workflows/Fonts" })).rejects.toThrow();
  });
});
