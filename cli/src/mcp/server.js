import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { cliVersion } from "../report-to.js";
import { CATEGORIES, aliasesOf, listSnippets, resolveSnippetName } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { runSnippets, VIEWPORT_PRESETS } from "../runner.js";

const VIEWPORTS = Object.keys(VIEWPORT_PRESETS);
const STAGES = 3;

const SnippetInfo = z.object({
  name: z.string().describe("Category/Name, the name other tools take"),
  category: z.enum(CATEGORIES),
  title: z.string(),
  aliases: z.array(z.string()).describe("Short names that also select the snippet"),
  tracking: z.boolean().describe("The snippet records interactions and answers after them"),
});

// Every snippet starts with a comment that names it: "// LCP Quick Check"
const titleOf = (source) => source.split("\n", 1)[0].replace(/^\/\/\s*/, "").trim();

// The result of a tool, as structured content for clients that read it and as the same JSON in text
// for those that do not
const toolResult = (data) => ({ structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] });

// A failure the model reads and can act on: a wrong argument or a page that does not load. It is
// still a result of the tool, not an error of the protocol.
const toolError = (text) => ({ isError: true, content: [{ type: "text", text }] });

const firstLine = (message) => message.split("\n")[0];

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
      return toolResult({ snippets });
    }
  );

  server.registerTool(
    "run_snippet",
    {
      title: "Run a snippet",
      description:
        "Opens the URL in a headless Chromium, runs one web performance snippet on the loaded page and returns the object the snippet returns, as defined in snippets/SCHEMA.md. Use list_snippets for the names. The snippets that record interactions (INP, Interactions, Input-Latency-Breakdown) need a script of interactions and are not run here.",
      inputSchema: z.object({
        url: z
          .string()
          .refine((url) => /^https?:\/\//i.test(url) && URL.canParse(url), "url must be an http or https URL")
          .describe("The page to measure; local development servers (http://localhost:3000) work too"),
        snippet: z.string().describe("The snippet: its name (LCP-Subparts), an alias (render-blocking) or Category/Name"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(3000).describe("Wait after the load event before running the snippet, in ms"),
      }),
      outputSchema: z.object({
        url: z.string(),
        snippet: z.string().describe("Category/Name of the snippet that ran"),
        viewport: z.enum(VIEWPORTS),
        navMs: z.number().describe("From the start of the navigation to the end of the wait"),
        pageErrors: z.array(z.string()).describe("Uncaught errors of the page during the run"),
        result: z.looseObject({ script: z.string(), status: z.string() }).describe("The object the snippet returns"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, snippet, viewport, waitMs }, ctx) => {
      let path;
      try {
        path = resolveSnippetName(snippet);
      } catch (err) {
        return toolError(err.message);
      }
      const source = loadSnippet(path);
      if (isTrackingSnippet(path, source)) {
        return toolError(`${path} records interactions: it needs a script of interactions (clicks, key presses) on the page, which run_snippet does not run.`);
      }

      // A client that wants progress sends a token with the call; the stages of the run go to it
      const progressToken = ctx.mcpReq._meta?.progressToken;
      const onProgress = (progress, message) =>
        progressToken === undefined
          ? undefined
          : ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress, total: STAGES, message } });

      try {
        const run = await runSnippets({ url, items: [{ id: path, path, source }], waitMs, viewport: VIEWPORT_PRESETS[viewport], onProgress });
        const { id, ...result } = run.results[0];
        return toolResult({ url, snippet: id, viewport, navMs: run.navMs, pageErrors: run.pageErrors, result });
      } catch (err) {
        if (/page\.goto/.test(err.message)) return toolError(`Could not load ${url}: ${firstLine(err.message)}`);
        return toolError(`The run failed: ${firstLine(err.message)}`);
      }
    }
  );

  return server;
}
