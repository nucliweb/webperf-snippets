import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

// Serves the MCP server over stdio: the client starts this process and exchanges JSON-RPC messages,
// one per line, through its standard input and output. Standard output carries nothing else, so
// nothing here or in the code it calls may write to it. serveStdio answers both eras of the
// protocol, and decides which one when the client connects.
export function startStdioServer() {
  return serveStdio(() => createServer());
}
