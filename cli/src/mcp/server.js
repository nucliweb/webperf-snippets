import { McpServer } from "@modelcontextprotocol/server";
import { chromium } from "playwright";
import * as z from "zod/v4";
import { cliVersion } from "../report-to.js";
import { CATEGORIES, aliasesOf, listSnippets, resolveSnippetName } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { runSnippets, runMeasurement, evaluateItems, collectTrackingData, VIEWPORT_PRESETS } from "../runner.js";
import { WORKFLOWS } from "../workflows/index.js";
import { RULES } from "../decision-tree.js";
import { fetchCrux } from "../crux.js";
import { runInteractions, isInputStep, settle } from "../interactions.js";
import { createSessions, SessionError } from "./sessions.js";
import { registerResources } from "./documents.js";

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

const Step = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("hover"), selector: z.string() }),
  z.object({ action: z.literal("type"), selector: z.string(), text: z.string() }),
  z.object({ action: z.literal("scroll"), y: z.number().int().optional().describe("Pixels down, 300 by default") }),
  z.object({ action: z.literal("wait"), ms: z.number().int().min(0).max(10000) }),
]);

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

// A client that wants progress sends a token with the call; the stages of a run go to it
function progressFor(ctx) {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  return (progress, message) =>
    progressToken === undefined
      ? undefined
      : ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress, total: STAGES, message } });
}

const CRUX_FORM_FACTORS = { phone: "PHONE", desktop: "DESKTOP", tablet: "TABLET" };
const CRUX_SETUP =
  "get_crux needs a CrUX API key in the CRUX_API_KEY environment variable of the MCP server. Set it in the configuration of the client, for example: claude mcp add webperf -e CRUX_API_KEY=<key> -- npx -y webperf-snippets mcp. A key is free in the Google Cloud console (Chrome UX Report API).";

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
export function createServer({ launchBrowser = () => chromium.launch(), maxPages, idleMs, env = process.env } = {}) {
  const server = new McpServer({ name: "webperf-snippets", version: cliVersion });
  const sessions = createSessions({ launchBrowser, maxPages, idleMs });
  // The client left (end of stdin, or a closed transport): close the pages and Chromium
  server.server.onclose = () => sessions.closeAll();
  registerResources(server);

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
        "Opens the URL in a headless Chromium, runs one web performance snippet on the loaded page and returns the object the snippet returns, as defined in snippets/SCHEMA.md. Use list_snippets for the names. The snippets that record interactions (INP, Interactions, Input-Latency-Breakdown) run on a page opened with open_page instead.",
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
        return toolError(`${path} records interactions: open the page with open_page and this snippet in track, use it with interact, and read it with read_results.`);
      }

      try {
        const run = await runSnippets({ url, items: [{ id: path, path, source }], waitMs, viewport: VIEWPORT_PRESETS[viewport], onProgress: progressFor(ctx) });
        const { id, ...result } = run.results[0];
        return toolResult({ url, snippet: id, viewport, navMs: run.navMs, pageErrors: run.pageErrors, result });
      } catch (err) {
        if (/page\.goto/.test(err.message)) return toolError(`Could not load ${url}: ${firstLine(err.message)}`);
        return toolError(`The run failed: ${firstLine(err.message)}`);
      }
    }
  );

  server.registerTool(
    "run_workflow",
    {
      title: "Run a workflow",
      description:
        "Opens the URL in a headless Chromium and runs a workflow: a sequence of snippets plus the follow-ups its decision tree adds from the results (for example LCP-Subparts when LCP is over 2.5 s, with the reason). core-web-vitals: LCP and CLS. audit: render-blocking resources, resource hints, critical CSS, TTFB, scripts, images and more. loading: TTFB, FCP, render-blocking, scripts and fonts. interaction: long tasks, animation frames, scroll and layout shifts while it scrolls the page.",
      inputSchema: z.object({
        url: HttpUrl,
        workflow: z.enum(Object.keys(WORKFLOWS)).default("core-web-vitals"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(3000).describe("Wait after the load event before running the workflow, in ms"),
      }),
      outputSchema: z.object({
        url: z.string(),
        workflow: z.string(),
        viewport: z.enum(VIEWPORTS),
        navMs: z.number(),
        pageErrors: z.array(z.string()),
        results: z
          .array(z.looseObject({ id: z.string(), status: z.string() }).meta({ additionalProperties: true }))
          .describe("One object per step, in order, then the follow-ups, each with the reason it was added"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, workflow, viewport, waitMs }, ctx) => {
      try {
        const run = await runMeasurement({
          url,
          workflow: WORKFLOWS[workflow],
          rules: RULES,
          waitMs,
          viewport: VIEWPORT_PRESETS[viewport],
          onProgress: progressFor(ctx),
        });
        // The runner explains a skipped step with the flag of the CLI; here the tools are what the model has
        const results = run.results.map((r) =>
          r.status === "skipped"
            ? { ...r, reason: "This step measures clicks and key presses: open the page with open_page and this snippet in track, use it with interact, and read it with read_results." }
            : r
        );
        return toolResult({ url, workflow, viewport, navMs: run.navMs, pageErrors: run.pageErrors, results });
      } catch (err) {
        if (/page\.goto/.test(err.message)) return toolError(`Could not load ${url}: ${firstLine(err.message)}`);
        return toolError(`The run failed: ${firstLine(err.message)}`);
      }
    }
  );

  server.registerTool(
    "get_crux",
    {
      title: "Get CrUX field data",
      description:
        "Returns the p75 of LCP, CLS and INP that real Chrome users had on a URL over the last 28 days, from the Chrome UX Report, with their rating. Falls back to the origin when the URL has no data of its own. Compare it with the lab values of run_snippet: field data is what users get.",
      inputSchema: z.object({
        url: HttpUrl,
        formFactor: z.enum(Object.keys(CRUX_FORM_FACTORS)).default("phone").describe("The devices the data describes"),
      }),
      outputSchema: z.object({
        url: z.string(),
        formFactor: z.string(),
        scope: z.enum(["url", "origin"]).optional().describe("Whether the data is for the URL or for its whole origin"),
        metrics: z
          .record(z.string(), z.object({ p75: z.number(), rating: z.string(), unit: z.string() }))
          .optional()
          .describe("By metric name: LCP, CLS, INP"),
        unavailable: z.string().optional().describe("Why there is no field data, such as a page with too little traffic"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, formFactor }) => {
      const apiKey = env.CRUX_API_KEY;
      if (!apiKey) return toolError(CRUX_SETUP);
      const crux = await fetchCrux({
        url,
        apiKey,
        formFactor: CRUX_FORM_FACTORS[formFactor],
        ...(env.WEBPERF_CRUX_ENDPOINT ? { endpoint: env.WEBPERF_CRUX_ENDPOINT } : {}),
      });
      if (crux.failed) return toolError(`Could not read the CrUX data: ${crux.unavailable}.`);
      if (crux.unavailable) return toolResult({ url, formFactor, unavailable: crux.unavailable });
      return toolResult({ url, formFactor, scope: crux.scope, metrics: crux.metrics });
    }
  );

  server.registerTool(
    "open_page",
    {
      title: "Open a page",
      description:
        "Opens the URL in a headless Chromium that stays open between calls, and installs the snippets that record interactions (INP, Interactions, Input-Latency-Breakdown, and the other tracking snippets in list_snippets). Returns a sessionId for interact, read_results and close_page. At most 3 pages are open at a time, and a page closes after 10 minutes without use.",
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
    "interact",
    {
      title: "Interact with an open page",
      description:
        "Runs steps on a page opened with open_page, as a person would: click, type, hover, scroll or wait. A click or a key press is what the tracking snippets record. A step whose element does not appear within 5 seconds stops the run.",
      inputSchema: z.object({
        sessionId: SessionId,
        steps: z.array(Step).min(1).max(50),
      }),
      outputSchema: z.object({ sessionId: z.string(), steps: z.number().describe("Steps run"), url: z.string().describe("The URL after the steps") }),
      // A click can submit a form or change data on the site, so this tool is not read-only
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    withSession(async ({ sessionId, steps }) => {
      const session = sessions.get(sessionId);
      try {
        await runInteractions(session.page, steps);
      } catch (err) {
        return toolError(`A step failed: ${firstLine(err.message)}`);
      }
      session.hadInput ||= steps.some(isInputStep);
      await settle(session.page);
      return toolResult({ sessionId, steps: steps.length, url: session.page.url() });
    })
  );

  server.registerTool(
    "read_results",
    {
      title: "Read the tracking snippets",
      description:
        "Returns what the tracking snippets installed by open_page have recorded on the page so far, as the objects they return. A snippet with nothing recorded yet answers with status error, which is a result, not a failure.",
      inputSchema: z.object({ sessionId: SessionId }),
      outputSchema: z.object({ sessionId: z.string(), pageErrors: z.array(z.string()), results: z.array(SnippetResult) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withSession(async ({ sessionId }) => {
      const session = sessions.get(sessionId);
      const results = [];
      for (const installed of session.tracking) {
        const { id, ...result } = await collectTrackingData(session.page, installed, session.hadInput);
        results.push(result);
      }
      return toolResult({ sessionId, pageErrors: session.pageErrors, results });
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
