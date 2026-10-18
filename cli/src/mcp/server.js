import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { cliVersion } from "../report-to.js";
import { CATEGORIES, aliasesOf, listSnippets } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";

const SnippetInfo = z.object({
  name: z.string().describe("Category/Name, the name other tools take"),
  category: z.enum(CATEGORIES),
  title: z.string(),
  aliases: z.array(z.string()).describe("Short names that also select the snippet"),
  tracking: z.boolean().describe("The snippet records interactions and answers after them"),
});

// Every snippet starts with a comment that names it: "// LCP Quick Check"
const titleOf = (source) => source.split("\n", 1)[0].replace(/^\/\/\s*/, "").trim();

function describeSnippet(name) {
  const source = loadSnippet(name);
  return {
    name,
    category: name.split("/")[0],
    title: titleOf(source),
    aliases: aliasesOf(name),
    tracking: isTrackingSnippet(name, source),
  };
}

// The MCP server of the CLI: the same snippets and runner, offered as tools an agent calls by name.
// It holds no state of its own yet, so every connection can get a fresh instance.
export function createServer() {
  const server = new McpServer({ name: "webperf-snippets", version: cliVersion });

  server.registerTool(
    "list_snippets",
    {
      title: "List snippets",
      description:
        "Lists the web performance snippets this server can run, with their category, title and short aliases. Call it to find the name of the snippet to run.",
      inputSchema: z.object({
        category: z.enum(CATEGORIES).optional().describe("Only the snippets of this category"),
      }),
      outputSchema: z.object({ snippets: z.array(SnippetInfo) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category }) => {
      const snippets = listSnippets()
        .filter((name) => !category || name.startsWith(`${category}/`))
        .map(describeSnippet);
      const result = { snippets };
      // Structured content for clients that read it, and the same JSON as text for those that do not
      return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  return server;
}
