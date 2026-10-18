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
});

