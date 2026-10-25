import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";

// Resources are documents the client attaches to the context; prompts are templates the user picks.
// Neither runs a browser, so a client in memory is enough.
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
    // A snippet with issue codes and no section has its codes; one with neither is not listed
    expect(uris).toContain("webperf://schema/Validate-Preload-Async-Defer-Scripts");
    expect(uris).not.toContain("webperf://schema/Event-Processing-Time");
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
    // The rules of the issue codes, without the table of each snippet
    expect(schema.text).toMatch(/## Issue codes/);
    expect(schema.text).not.toMatch(/`blocking-in-head`/);
    expect(schema.text.length).toBeLessThan(20000);
  });

  it("give the issue codes of a snippet with its section, or alone when it has no section", async () => {
    const scripts = await read("webperf://schema/Script-Loading");
    expect(scripts.text).toMatch(/^#### Script-Loading$/m);
    expect(scripts.text).toMatch(/\| `blocking-in-head` \| error \|/);
    const preloads = await read("webperf://schema/Validate-Preload-Async-Defer-Scripts");
    expect(preloads.text).toMatch(/\| `orphan-preload` \| warning \|/);
    expect(preloads.text).not.toMatch(/`blocking-in-head`/);
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
    await expect(client.readResource({ uri: "webperf://schema/Event-Processing-Time" })).rejects.toThrow();
    await expect(client.readResource({ uri: "webperf://workflows/Fonts" })).rejects.toThrow();
  });
});

describe("prompts", () => {
  it("are listed with their arguments", async () => {
    expect(client.getServerCapabilities()).toHaveProperty("prompts");
    const { prompts } = await client.listPrompts();
    const byName = Object.fromEntries(prompts.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(["audit_lcp", "audit_page", "debug_inp"]);
    for (const prompt of prompts) {
      expect(prompt.arguments.find((a) => a.name === "url")).toMatchObject({ required: true });
    }
  });

  it("audit_lcp asks for the workflow, the field data and the sub-parts, with their schemas", async () => {
    const { messages } = await client.getPrompt({ name: "audit_lcp", arguments: { url: "https://example.com/" } });
    const text = messages.map((m) => m.content.text ?? m.content.resource?.text).join("\n");
    expect(text).toMatch(/https:\/\/example\.com\//);
    expect(text).toMatch(/run_workflow/);
    expect(text).toMatch(/get_crux/);
    const embedded = messages.filter((m) => m.content.type === "resource").map((m) => m.content.resource.uri);
    expect(embedded).toEqual(["webperf://schema/LCP", "webperf://schema/LCP-Subparts"]);
  });

  it("debug_inp asks to open the page, interact and read the tracking snippets", async () => {
    const { messages } = await client.getPrompt({ name: "debug_inp", arguments: { url: "https://example.com/", selector: "#buy" } });
    const text = messages.map((m) => m.content.text ?? "").join("\n");
    for (const tool of ["open_page", "interact", "read_results", "close_page"]) expect(text).toContain(tool);
    expect(text).toContain("#buy");
  });

  it("refuse to start without a URL", async () => {
    await expect(client.getPrompt({ name: "audit_page", arguments: {} })).rejects.toThrow();
  });
});
