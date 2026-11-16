import { McpServer, ResourceTemplate, ResourceNotFoundError } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { cliVersion } from "../report-to.js";
import { CATEGORIES, describeSnippet, listSnippets, resolveSnippetName } from "../snippet-names.js";
import { fetchCrux, fetchCruxHistory } from "../crux.js";
import { createSessions, SessionError } from "./sessions.js";
import { createQueue } from "./queue.js";
import { launchChromium } from "../browser.js";
import { registerResources } from "./documents.js";
import { registerPrompts } from "./prompts.js";
import { createRuns, RunError } from "./summary.js";
import { machineOf } from "../machine.js";
import { measurementConditions } from "../conditions.js";
import { prepareBaseline } from "./baseline.js";
import { CALL_LIMIT_MS, STAGES, measurePage, toolError, toolResult, waitProgressFor } from "./calls.js";
import { HttpUrl, INSTRUCTIONS, PAGE_DATA, RunId, SnippetInfo, SnippetResult } from "./schemas.js";
import { registerPageTools } from "./page-tools.js";
import { registerSessionTools, registerClosePage } from "./session-tools.js";

const CRUX_FORM_FACTORS = { phone: "PHONE", desktop: "DESKTOP", tablet: "TABLET" };
const CRUX_SETUP =
  "get_crux needs a CrUX API key in the CRUX_API_KEY environment variable of the MCP server. Set it in the configuration of the client, for example: claude mcp add webperf -e CRUX_API_KEY=<key> -- npx -y webperf-snippets mcp. A key is free in the Google Cloud console (Chrome UX Report API).";

// The runs of the connection that measured a page, as resources: an agent picks the baseline of a run
// among them. Each is the JSON the CLI prints with --json, so saved to a file it is a baseline of the
// CLI too.
function registerRuns(server, runs) {
  const JSON_TYPE = "application/json";
  server.registerResource(
    "runs",
    new ResourceTemplate("webperf://runs/{runId}", {
      list: async () => ({
        resources: runs.pages().map(({ runId, url, conditions, at, runs: count }) => ({
          uri: `webperf://runs/${runId}`,
          name: `${conditions.snippet ?? conditions.workflow} on ${url} (${conditions.viewport})${count ? `, ${count} runs` : ""}`,
          description: `Measured at ${at}`,
          mimeType: JSON_TYPE,
        })),
      }),
    }),
    {
      title: "Runs of this connection",
      description: `The page an earlier run_snippet or run_workflow of this connection measured, with its results and conditions, as the JSON of the CLI (--json). Its runId is the baseline argument of a later run. The server keeps the last 20 runs. ${PAGE_DATA}`,
      mimeType: JSON_TYPE,
    },
    async (uri, { runId }) => {
      let page;
      try {
        page = runs.page(runId);
      } catch (err) {
        if (err instanceof RunError) throw new ResourceNotFoundError(uri.href);
        throw err;
      }
      return { contents: [{ uri: uri.href, mimeType: JSON_TYPE, text: JSON.stringify(page) }] };
    }
  );
}

// The MCP server of the CLI: the same snippets and runner, offered as tools an agent calls by name.
// serveStdio creates one instance per connection, so the pages it keeps open belong to that client.
export function createServer({ launchBrowser = () => launchChromium(), maxPages, idleMs, env = process.env, machine = machineOf, callLimitMs = CALL_LIMIT_MS, reportEveryMs } = {}) {
  const server = new McpServer({ name: "webperf-snippets", version: cliVersion }, { instructions: INSTRUCTIONS });
  const sessions = createSessions({ launchBrowser, maxPages, idleMs });
  const runs = createRuns();
  // An agent sends several calls in one turn and the client runs them at once. The calls that make a page
  // work take turns (run_snippet, run_workflow, open_page, interact): a load or a click competes for the
  // CPU with any other, which inflates what each page reports. A call keeps its turn only while it runs,
  // so it can wait only for something that ends on its own: never for a later call of the agent, and
  // never for a page left open, which keeps no turn. read_results and close_page take no turn: they ask
  // little of Chromium, and they are how an agent gets out of a page.
  const queue = createQueue({ reportEveryMs });
  const inTurn = (ctx, total, task) => queue.run(task, { signal: ctx.mcpReq.signal, onWait: waitProgressFor(ctx, total) });
  // The client left (end of stdin, or a closed transport): close the pages and Chromium
  server.server.onclose = () => sessions.closeAll();
  registerResources(server);
  registerPrompts(server);
  registerRuns(server, runs);

  // The machine goes in the conditions of every run, as in the JSON of the CLI, so a baseline measured
  // on another one warns. It is measured once, in the turn of the first run, before its Chromium starts.
  // The browser is the one the run launched, the median one with several runs.
  let machineOfServer;
  const measureInTurn = (conditions, measure, count, ctx) =>
    inTurn(ctx, STAGES * count, async () => {
      machineOfServer ??= machine();
      // When the run started, in its turn: the time it waited in the queue is not part of it
      const date = new Date().toISOString();
      const { browser, ...run } = await measurePage(measure, count, ctx, callLimitMs);
      return { conditions: measurementConditions({ ...conditions, browser, machine: machineOfServer }), run, date };
    });

  // A run of a page load, kept with its page in the shape of the JSON of the CLI: its runId is the
  // baseline of a later run, and the resources list it
  const keepPage = (run, results, conditions, found) => {
    const page = { url: run.url, ...found, navMs: run.navMs, pageErrors: run.pageErrors, ...(run.throttling ? { throttling: run.throttling } : {}), ...(run.runs ? { runs: run.runs } : {}), conditions };
    const runId = runs.keep(results, page);
    server.sendResourceListChanged();
    return { runId, current: { ...page, results } };
  };

  // The baseline of a tool, read and checked before the page loads; a wrong one is a tool error
  const baselineFor = ({ baseline, thresholds }) => {
    if (baseline === undefined) {
      if (thresholds?.length) throw new Error("thresholds need a baseline");
      return undefined;
    }
    return prepareBaseline({ baseline, thresholds }, runs);
  };

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

  registerPageTools(server, { measureInTurn, keepPage, baselineFor });

  server.registerTool(
    "get_crux",
    {
      title: "Get CrUX field data",
      description:
        "Returns the p75 of LCP, CLS and INP that real Chrome users had on a URL over the last 28 days, from the Chrome UX Report, with their rating. Falls back to the origin when the URL has no data of its own. Compare it with the lab values of run_snippet: field data is what users get. With weeks, it adds the trend: the p75 of each week, each the 28 days before it, with the change from the first week to the last.",
      inputSchema: z.object({
        url: HttpUrl,
        formFactor: z.enum(Object.keys(CRUX_FORM_FACTORS)).default("phone").describe("The devices the data describes"),
        weeks: z.number().int().min(1).max(40).optional().describe("Add the trend of the last 1 to 40 weeks"),
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
        subParts: z
          .record(z.string(), z.number())
          .optional()
          .describe("The p75 of the sub-parts of an image LCP: ttfb, resourceLoadDelay, resourceLoadTime, elementRenderDelay"),
        lcpImageShare: z.number().optional().describe("The share of loads whose LCP is an image, which the sub-parts describe"),
        roundTripTime: z.number().optional().describe("The p75 of the round trip time of the users, in ms"),
        navigationTypes: z.record(z.string(), z.number()).optional().describe("The share of each navigation type, such as navigate, reload or back_forward_cache"),
        history: z
          .looseObject({})
          .meta({ additionalProperties: true })
          .optional()
          .describe("With weeks: scope, weeks, periods, and per metric its p75s, first, last, change in percent and trend"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, formFactor, weeks }) => {
      const apiKey = env.CRUX_API_KEY;
      if (!apiKey) return toolError(CRUX_SETUP);
      const options = {
        url,
        apiKey,
        formFactor: CRUX_FORM_FACTORS[formFactor],
        ...(env.WEBPERF_CRUX_ENDPOINT ? { endpoint: env.WEBPERF_CRUX_ENDPOINT } : {}),
      };
      const crux = await fetchCrux(options);
      if (crux.failed) return toolError(`Could not read the CrUX data: ${crux.unavailable}.`);
      const history = weeks ? await fetchCruxHistory({ ...options, weeks }) : undefined;
      // A history that failed says why in its own unavailable, next to the p75 that did come
      const trend = history ? { history: history.failed ? { unavailable: history.unavailable } : history } : {};
      if (crux.unavailable) return toolResult({ url, formFactor, unavailable: crux.unavailable, ...trend });
      const { scope, metrics, subParts, lcpImageShare, roundTripTime, navigationTypes } = crux;
      return toolResult({ url, formFactor, scope, metrics, subParts, lcpImageShare, roundTripTime, navigationTypes, ...trend });
    }
  );

  registerSessionTools(server, { sessions, runs, inTurn, withSession, callLimitMs });

  server.registerTool(
    "get_details",
    {
      title: "Get the details of a result",
      description:
        `Returns the whole object of one snippet of a summarized run, by its runId: what the summary leaves out, from the same run, without measuring again. ${PAGE_DATA}`,
      inputSchema: z.object({
        runId: RunId,
        snippet: z.string().describe("The id of the result in the summary, or its script"),
      }),
      outputSchema: z.object({
        runId: z.string(),
        snippet: z.string().describe("The id of the result in the run"),
        medianRun: z.number().optional().describe("With several runs, the one this result comes from: the median run, the only one kept"),
        result: SnippetResult,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ runId, snippet }) => {
      // The id the summary shows first, then the Category/Name an alias or a short name stands for
      let resolved;
      try {
        resolved = resolveSnippetName(snippet);
      } catch {
        resolved = undefined;
      }
      try {
        let result;
        try {
          result = runs.get(runId, snippet);
        } catch (err) {
          if (!(err instanceof RunError) || !resolved || resolved === snippet) throw err;
          result = runs.get(runId, resolved);
        }
        const medianRun = runs.medianRun(runId);
        return toolResult({ runId, snippet: result.id, ...(medianRun ? { medianRun } : {}), result });
      } catch (err) {
        if (err instanceof RunError) return toolError(err.message);
        throw err;
      }
    }
  );

  registerClosePage(server, { sessions });

  return server;
}
