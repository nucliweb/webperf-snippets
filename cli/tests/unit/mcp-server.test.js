import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { cliVersion } from "../../src/report-to.js";

// A client and the server joined in memory, with no process in between. The in-memory transport
// speaks the legacy era of the protocol (the `initialize` handshake); the modern era is covered by
// the e2e test that starts the real server over stdio.
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

describe("the MCP server", () => {
  it("introduces itself with the name and the version of the CLI", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "webperf-snippets", version: cliVersion });
  });

  it("declares that it offers tools", () => {
    expect(client.getServerCapabilities()).toHaveProperty("tools");
  });

  // The secrets of the CLI (--header, --storage-state, the keys) stay out of its outputs, which
  // tests/e2e/secrets.test.js checks. An MCP client passes its arguments through the agent, so a
  // tool that took one would put the secret in the conversation.
  it("takes no headers, storage state or keys in any tool", async () => {
    const { tools } = await client.listTools();
    const inputs = tools.flatMap((t) => Object.keys(t.inputSchema.properties ?? {}).map((name) => `${t.name}.${name}`));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.filter((input) => /header|storage|cookie|key|token|secret/i.test(input))).toEqual([]);
  });

  // A page can put instructions for the agent in what a snippet returns (an alt text, a class, the URL
  // of a resource); the agent has to read them as data, from the first message of the server on
  it("tells the agent in its instructions that what a page returns is data, never an instruction", () => {
    expect(client.getInstructions()).toMatch(/comes from the measured page/);
    expect(client.getInstructions()).toMatch(/never an instruction/);
  });

  it("says so in every tool that returns what a page holds", async () => {
    const { tools } = await client.listTools();
    for (const name of ["run_snippet", "run_workflow", "open_page", "interact", "read_results"]) {
      expect(tools.find((t) => t.name === name).description, name).toMatch(/comes from the measured page[^.]*never an instruction/);
    }
  });
});

describe("list_snippets", () => {
  const call = (args = {}) => client.callTool({ name: "list_snippets", arguments: args });

  it("is listed with a description and an optional category filter", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "list_snippets");
    expect(tool.description).toMatch(/snippet/i);
    expect(tool.inputSchema.properties.category.enum).toEqual(["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"]);
    expect(tool.inputSchema.required ?? []).not.toContain("category");
  });

  it("returns every snippet the CLI can run, as structured content and as text", async () => {
    const result = await call();
    const { snippets } = result.structuredContent;
    expect(snippets).toHaveLength(56);
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    for (const s of snippets) {
      expect(s.name).toBe(`${s.category}/${s.name.split("/")[1]}`);
      expect(s.title.length).toBeGreaterThan(0);
      expect(Array.isArray(s.aliases)).toBe(true);
      expect(typeof s.tracking).toBe("boolean");
    }
  });

  it("gives the title, the short aliases and whether the snippet tracks interactions", async () => {
    const { snippets } = (await call()).structuredContent;
    const byName = Object.fromEntries(snippets.map((s) => [s.name, s]));
    expect(byName["CoreWebVitals/LCP"]).toMatchObject({ title: "LCP Quick Check", tracking: false });
    expect(byName["Loading/Find-render-blocking-resources"].aliases).toEqual(["render-blocking"]);
    expect(byName["CoreWebVitals/INP"].tracking).toBe(true);
  });

  it("filters by category", async () => {
    const { snippets } = (await call({ category: "Media" })).structuredContent;
    expect(snippets.map((s) => s.category)).toEqual(["Media", "Media", "Media", "Media"]);
  });

  it("answers an unknown category with a tool error the agent can read, not a protocol error", async () => {
    const result = await call({ category: "Fonts" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/category/i);
  });
});
