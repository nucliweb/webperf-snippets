import { McpServer } from "@modelcontextprotocol/server";
import { cliVersion } from "../report-to.js";

// The MCP server of the CLI: the same snippets and runner, offered as tools an agent calls by name.
// It holds no state of its own yet, so every connection can get a fresh instance.
export function createServer() {
  return new McpServer({ name: "webperf-snippets", version: cliVersion }, { capabilities: { tools: {} } });
}
