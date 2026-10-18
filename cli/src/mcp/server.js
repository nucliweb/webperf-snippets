import { McpServer } from "@modelcontextprotocol/server";
import { chromium } from "playwright";
import * as z from "zod/v4";
import { cliVersion } from "../report-to.js";
import { CATEGORIES, aliasesOf, listSnippets, resolveSnippetName } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { runSnippets, evaluateItems, VIEWPORT_PRESETS } from "../runner.js";
import { createSessions, SessionError } from "./sessions.js";

const VIEWPORTS = Object.keys(VIEWPORT_PRESETS);
const STAGES = 3;
const NAV_TIMEOUT_MS = 30000;

const HttpUrl = z
  .string()
  .refine((url) => /^https?:\/\//i.test(url) && URL.canParse(url), "url must be an http or https URL")
  .describe("The page to measure; local development servers (http://localhost:3000) work too");

// Free-form beyond script and status: each snippet has its own fields (snippets/SCHEMA.md). zod writes
// that as `additionalProperties: {}`; `true` says the same in a way every client reads.
const SnippetResult = z
  .looseObject({ script: z.string(), status: z.string() })
  .meta({ additionalProperties: true })
  .describe("The object the snippet returns");

const SessionId = z.string().describe("The id open_page returned");

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
// serveStdio creates one instance per connection, so the pages it keeps open belong to that client.
export function createServer({ launchBrowser = () => chromium.launch(), maxPages, idleMs } = {}) {
  const server = new McpServer({ name: "webperf-snippets", version: cliVersion });
  const sessions = createSessions({ launchBrowser, maxPages, idleMs });
  // The client left (end of stdin, or a closed transport): close the pages and Chromium
  server.server.onclose = () => sessions.closeAll();

  // Runs a session tool, and turns the errors the model can act on into tool errors
  const withSession = (handler) => async (args, ctx) => {
    try {
      return await handler(args, ctx);
    } catch (err) {
      if (err instanceof SessionError) return toolError(err.message);
      throw err;
    }
  };

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
        url: HttpUrl,
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
        result: SnippetResult,
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

  server.registerTool(
    "open_page",
    {
      title: "Open a page",
      description:
        "Opens the URL in a headless Chromium that stays open between calls, and installs the snippets that record interactions (INP, Interactions, Input-Latency-Breakdown, and the other tracking snippets in list_snippets). Returns a sessionId for the other page tools and close_page. At most 3 pages are open at a time, and a page closes after 10 minutes without use.",
      inputSchema: z.object({
        url: HttpUrl,
        track: z.array(z.string()).min(1).describe("The tracking snippets to install, by name, alias or Category/Name"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(1000).describe("Wait after the load event before installing the snippets, in ms"),
      }),
      outputSchema: z.object({
        sessionId: z.string(),
        url: z.string(),
        viewport: z.enum(VIEWPORTS),
        navMs: z.number(),
        tracking: z.array(z.object({ snippet: z.string(), status: z.string() })).describe("The installed snippets"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withSession(async ({ url, track, viewport, waitMs }, ctx) => {
      const items = [];
      for (const name of track) {
        let path;
        try {
          path = resolveSnippetName(name);
        } catch (err) {
          return toolError(err.message);
        }
        const source = loadSnippet(path);
        if (!isTrackingSnippet(path, source)) {
          return toolError(`${path} does not record interactions: run it with run_snippet instead.`);
        }
        items.push({ id: path, path, source });
      }

      const session = await sessions.create({ viewport: VIEWPORT_PRESETS[viewport], signal: ctx.mcpReq.signal });
      try {
        const navStart = Date.now();
        await session.page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
        if (waitMs > 0) await session.page.waitForTimeout(waitMs);
        const navMs = Date.now() - navStart;
        session.tracking = await evaluateItems(session.page, items);
        session.stopListening();
        const tracking = session.tracking.map(({ id, status }) => ({ snippet: id, status }));
        return toolResult({ sessionId: session.id, url, viewport, navMs, tracking });
      } catch (err) {
        await sessions.close(session.id);
        if (/page\.goto/.test(err.message)) return toolError(`Could not load ${url}: ${firstLine(err.message)}`);
        return toolError(`Opening the page failed: ${firstLine(err.message)}`);
      }
    })
  );

  server.registerTool(
    "close_page",
    {
      title: "Close a page",
      description: "Closes a page opened with open_page. Closing a page that is already closed is not an error.",
      inputSchema: z.object({ sessionId: SessionId }),
      outputSchema: z.object({ sessionId: z.string(), closed: z.boolean().describe("The page was open and is now closed") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sessionId }) => toolResult({ sessionId, closed: await sessions.close(sessionId) })
  );

  return server;
}
