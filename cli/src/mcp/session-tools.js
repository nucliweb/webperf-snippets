// The tools of a page that stays open between calls: open_page, interact, read_results and close_page.
import * as z from "zod/v4";
import { resolveSnippetName } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { loadPage, evaluateItems, collectTrackingData, VIEWPORT_PRESETS } from "../runner.js";
import { runInteractions, isInputStep, settle } from "../interactions.js";
import { Step } from "./steps.js";
import { isMissingBrowser, missingBrowserMessage } from "../browser.js";
import { shapeResults } from "./summary.js";
import { throttlingOf } from "../throttling.js";
import { NAV_TIMEOUT_MS, firstLine, stoppedAnswering, toolError, toolResult } from "./calls.js";
import { Cpu, DETAIL_NOTE, Detail, DetailOut, HttpUrl, Network, PAGE_DATA, SessionId, SnippetResult, SummaryRunId, THROTTLING_NOTE, Throttling, VIEWPORTS } from "./schemas.js";

export function registerSessionTools(server, { sessions, runs, inTurn, withSession, callLimitMs }) {
  server.registerTool(
    "open_page",
    {
      title: "Open a page",
      description:
        `Opens the URL in a headless Chromium that stays open between calls, and installs the snippets that record interactions (INP, Interactions, Input-Latency-Breakdown, and the other tracking snippets in list_snippets). Returns a sessionId for interact, read_results and close_page. ${THROTTLING_NOTE} The throttling stays for the interactions on the page. At most 3 pages are open at a time, and a page closes after 10 minutes without use. ${PAGE_DATA}`,
      inputSchema: z.object({
        url: HttpUrl,
        track: z.array(z.string()).min(1).describe("The tracking snippets to install, by name, alias or Category/Name"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(1000).describe("Wait after the load event before installing the snippets, in ms"),
        cpu: Cpu,
        network: Network,
      }),
      outputSchema: z.object({
        sessionId: z.string(),
        url: z.string(),
        viewport: z.enum(VIEWPORTS),
        navMs: z.number(),
        throttling: Throttling,
        tracking: z.array(z.object({ snippet: z.string(), status: z.string() })).describe("The installed snippets"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withSession(async ({ url, track, viewport, waitMs, cpu, network }, ctx) => {
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

      return inTurn(ctx, undefined, async () => {
        const limit = AbortSignal.timeout(callLimitMs);
        let session;
        try {
          session = await sessions.create({ viewport: VIEWPORT_PRESETS[viewport], signal: AbortSignal.any([ctx.mcpReq.signal, limit]) });
        } catch (err) {
          if (isMissingBrowser(err)) return toolError(missingBrowserMessage(err));
          throw err;
        }
        try {
          // The load of the runner: the throttling applies before it, so the load and every interaction run throttled
          const navMs = await loadPage(session.context, session.page, { url, waitMs, navTimeout: NAV_TIMEOUT_MS, cpu, network });
          session.tracking = await evaluateItems(session.page, items);
          // evaluateItems keeps a failed evaluation as a result, and closing the page fails every one
          if (limit.aborted) return toolError(`Opening the page failed: ${stoppedAnswering(callLimitMs)}`);
          session.stopListening();
          const tracking = session.tracking.map(({ id, status }) => ({ snippet: id, status }));
          const throttling = throttlingOf({ cpu, network });
          return toolResult({ sessionId: session.id, url, viewport, navMs, ...(throttling ? { throttling } : {}), tracking });
        } catch (err) {
          await sessions.close(session.id);
          if (limit.aborted) return toolError(`Opening the page failed: ${stoppedAnswering(callLimitMs)}`);
          if (/page\.goto/.test(err.message)) return toolError(`Could not load ${url}: ${firstLine(err.message)}`);
          return toolError(`Opening the page failed: ${firstLine(err.message)}`);
        }
      });
    })
  );

  server.registerTool(
    "interact",
    {
      title: "Interact with an open page",
      description:
        `Runs steps on a page opened with open_page, as a person would: click, type, hover, scroll or wait. A click or a key press is what the tracking snippets record. A step whose element does not appear within 5 seconds stops the run. ${PAGE_DATA}`,
      inputSchema: z.object({
        sessionId: SessionId,
        steps: z.array(Step).min(1).max(50),
      }),
      outputSchema: z.object({ sessionId: z.string(), steps: z.number().describe("Steps run"), url: z.string().describe("The URL after the steps") }),
      // A click can submit a form or change data on the site, so this tool is not read-only
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    withSession(async ({ sessionId, steps }, ctx) => {
      // A page that is not open answers now, not after a turn it does not need
      sessions.get(sessionId);
      return inTurn(ctx, undefined, async () => {
        const session = sessions.get(sessionId);
        // A wait step is time the agent asked for. Closing the page fails whatever it stopped answering.
        const limitMs = callLimitMs + steps.reduce((sum, step) => sum + (step.ms ?? 0), 0);
        const limit = AbortSignal.timeout(limitMs);
        const closePage = () => sessions.close(sessionId);
        limit.addEventListener("abort", closePage, { once: true });
        try {
          await runInteractions(session.page, steps);
          session.hadInput ||= steps.some(isInputStep);
          await settle(session.page);
          if (!limit.aborted) return toolResult({ sessionId, steps: steps.length, url: session.page.url() });
        } catch (err) {
          if (!limit.aborted) return toolError(`A step failed: ${firstLine(err.message)}`);
        } finally {
          limit.removeEventListener("abort", closePage);
        }
        return toolError(`${stoppedAnswering(limitMs)}, and it was closed. Open it again with open_page.`);
      });
    })
  );

  server.registerTool(
    "read_results",
    {
      title: "Read the tracking snippets",
      description:
        `Returns what the tracking snippets installed by open_page have recorded on the page so far, as the objects they return. A snippet with nothing recorded yet, such as INP before any interaction, answers with status tracking and a message: interact with the page and read again. After a click or key press that the document did not record, as one inside an iframe, it is an error that says so: interact with an element of the page and read again. ${DETAIL_NOTE} ${PAGE_DATA}`,
      inputSchema: z.object({ sessionId: SessionId, detail: Detail }),
      outputSchema: z.object({ sessionId: z.string(), runId: SummaryRunId, detail: DetailOut, pageErrors: z.array(z.string()), results: z.array(SnippetResult) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withSession(async ({ sessionId, detail }) => {
      const session = sessions.get(sessionId);
      const collected = [];
      for (const installed of session.tracking) collected.push(await collectTrackingData(session.page, installed, session.hadInput));
      const shaped = shapeResults(collected.map(({ id, ...result }) => result), detail);
      const runId = shaped.detail === "summary" ? runs.keep(collected) : undefined;
      return toolResult({ sessionId, ...(runId ? { runId } : {}), ...shaped, pageErrors: session.pageErrors });
    })
  );
}

export function registerClosePage(server, { sessions }) {
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
}
