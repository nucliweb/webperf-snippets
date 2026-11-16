// run_snippet and run_workflow: the tools that load a page, measure it and answer with its results.
import * as z from "zod/v4";
import { resolveSnippetName } from "../snippet-names.js";
import { loadSnippet } from "../load-snippet.js";
import { isTrackingSnippet } from "../tracking.js";
import { runSnippets, runMeasurement, VIEWPORT_PRESETS } from "../runner.js";
import { WORKFLOWS } from "../workflows/index.js";
import { RULES } from "../decision-tree.js";
import { isMissingBrowser, missingBrowserMessage } from "../browser.js";
import { shapeResults } from "./summary.js";
import { followUpCalls, inputStepsCalls } from "./next-steps.js";
import { pathsOfRun, reportOf } from "../overview.js";
import { compareWithBaseline } from "./baseline.js";
import { firstLine, toolError, toolResult } from "./calls.js";
import { BASELINE_NOTE, Baseline, Comparison, Cpu, DETAIL_NOTE, Detail, DetailOut, FoundOut, HttpUrl, Interactions, Network, NextSteps, PAGE_DATA, PageRunId, QUEUE_NOTE, Runs, RunsSummary, SnippetResult, THROTTLING_NOTE, Thresholds, Throttling, VIEWPORTS } from "./schemas.js";

const SKIPPED_STEP =
  "This step measures clicks and key presses: run the workflow with interactions that click or type on an element of the page, or open the page with open_page and this snippet in track, use it with interact, and read it with read_results.";

export function registerPageTools(server, { measureInTurn, keepPage, baselineFor }) {
  // The handler of a tool that measures a page load, which run_snippet and run_workflow share: the
  // arguments are checked before the page loads, a wrong one being a tool error; the page is measured
  // in its turn; the run is kept, as the baseline of a later one; and it is compared with its baseline.
  // Each tool says what it runs and what it answers:
  //   prepare(args)                       what the run needs, checked: it throws what is wrong
  //   conditionsOf(args, prepared)        how the page is measured, for the conditions of the run
  //   measure(args, prepared, progress)   the run; `progress` is its onProgress and its signal
  //   resultsOf(run)                      the results as the tool gives them
  //   pathsOf(args, prepared)             the path of the snippet of each result
  //   answer({ ... })                     the answer, with `comparison` to spread where the baseline goes
  const pageTool =
    ({ prepare = () => ({}), conditionsOf, measure, resultsOf = (run) => run.results, pathsOf, answer }) =>
    async (args, ctx) => {
      let prepared;
      let base;
      try {
        prepared = prepare(args);
        base = baselineFor(args);
      } catch (err) {
        return toolError(err.message);
      }
      try {
        const { conditions, run, date } = await measureInTurn(conditionsOf(args, prepared), (onProgress, signal) => measure(args, prepared, { onProgress, signal }), args.runs, ctx);
        const results = resultsOf(run);
        const found = { date, ...reportOf(results, pathsOf(args, prepared)) };
        const { runId, current } = keepPage(run, results, conditions, found);
        return toolResult(answer({ args, prepared, run, results, found, runId, comparison: base ? { baseline: compareWithBaseline(base, current) } : {} }));
      } catch (err) {
        if (isMissingBrowser(err)) return toolError(missingBrowserMessage(err));
        if (/page\.goto/.test(err.message)) return toolError(`Could not load ${args.url}: ${firstLine(err.message)}`);
        return toolError(`The run failed: ${firstLine(err.message)}`);
      }
    };

  server.registerTool(
    "run_snippet",
    {
      title: "Run a snippet",
      description:
        `Opens the URL in a headless Chromium, runs one web performance snippet on the loaded page and returns the object the snippet returns, as defined in snippets/SCHEMA.md. Use list_snippets for the names. The snippets that record interactions (INP, Interactions, Input-Latency-Breakdown) need interactions with a click or a key press, which run after the load of each run; open_page explores a page step by step instead. ${THROTTLING_NOTE} ${QUEUE_NOTE} ${BASELINE_NOTE} ${DETAIL_NOTE} ${PAGE_DATA}`,
      inputSchema: z.object({
        url: HttpUrl,
        snippet: z.string().describe("The snippet: its name (LCP-Subparts), an alias (render-blocking) or Category/Name"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(3000).describe("Wait after the load event before running the snippet, in ms"),
        cpu: Cpu,
        network: Network,
        interactions: Interactions,
        runs: Runs,
        detail: Detail,
        baseline: Baseline,
        thresholds: Thresholds,
      }),
      outputSchema: z.object({
        url: z.string(),
        runId: PageRunId,
        detail: DetailOut,
        snippet: z.string().describe("Category/Name of the snippet that ran"),
        viewport: z.enum(VIEWPORTS),
        ...FoundOut,
        navMs: z.number().describe("From the start of the navigation to the end of the wait"),
        pageErrors: z.array(z.string()).describe("Uncaught errors of the page during the run"),
        throttling: Throttling,
        result: SnippetResult,
        runs: RunsSummary,
        baseline: Comparison,
        nextSteps: NextSteps,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    pageTool({
      // The snippet, by any of its names; with interactions, the runner installs a tracking one before
      // the steps and reads it after them
      prepare({ snippet, interactions }) {
        const path = resolveSnippetName(snippet);
        const source = loadSnippet(path);
        if (isTrackingSnippet(path, source) && !interactions) {
          throw new Error(
            `${path} records interactions: run it with interactions that click or type on an element of the page, which run after the load, or open the page with open_page and this snippet in track, use it with interact, and read it with read_results.`
          );
        }
        return { path, source };
      },
      conditionsOf: ({ viewport, waitMs, cpu, network }, { path }) => ({ viewport, snippet: path, waitMs, cpu, network }),
      measure: ({ url, waitMs, viewport, cpu, network, interactions }, { path, source }, progress) =>
        runSnippets({ url, items: [{ id: path, path, source }], waitMs, viewport: VIEWPORT_PRESETS[viewport], cpu, network, interactions, ...progress }),
      pathsOf: (args, { path }) => pathsOfRun({ items: [{ id: path, path }] }),
      answer({ args: { url, viewport, waitMs, cpu, network, detail }, prepared: { path }, run, results, found, runId, comparison }) {
        const shaped = shapeResults(results.map(({ id, ...result }) => result), detail);
        const nextSteps = followUpCalls({ results, url, viewport, waitMs, cpu, network, ran: [path] });
        return {
          url,
          runId,
          detail: shaped.detail,
          snippet: results[0].id,
          viewport,
          ...found,
          navMs: run.navMs,
          pageErrors: run.pageErrors,
          ...(run.throttling ? { throttling: run.throttling } : {}),
          result: shaped.results[0],
          ...(run.runs ? { runs: run.runs } : {}),
          ...comparison,
          ...(nextSteps.length ? { nextSteps } : {}),
        };
      },
    })
  );

  server.registerTool(
    "run_workflow",
    {
      title: "Run a workflow",
      description:
        `Opens the URL in a headless Chromium and runs a workflow: a sequence of snippets plus the follow-ups its decision tree adds from the results (for example LCP-Subparts when LCP is over 2.5 s, with the reason). core-web-vitals: LCP and CLS. audit: render-blocking resources, resource hints, critical CSS, TTFB, scripts, images and more. loading: TTFB, FCP, render-blocking, scripts and fonts. interaction: long tasks, animation frames, scroll and layout shifts while it scrolls the page, or while it runs interactions, which with a click or a key press also measure INP, Interactions and Input-Latency-Breakdown. The answer starts with what the results found, as the JSON of the CLI: overview (how many snippets have errors, warnings only or nothing to fix) and issues (every issue in one list, errors first, with the id of its step and the path of its snippet), whole even when the results are summaries. ${THROTTLING_NOTE} ${QUEUE_NOTE} ${BASELINE_NOTE} ${DETAIL_NOTE} ${PAGE_DATA}`,
      inputSchema: z.object({
        url: HttpUrl,
        workflow: z.enum(Object.keys(WORKFLOWS)).default("core-web-vitals"),
        viewport: z.enum(VIEWPORTS).default("mobile").describe("Device size of the page"),
        waitMs: z.number().int().min(0).max(10000).default(3000).describe("Wait after the load event before running the workflow, in ms"),
        cpu: Cpu,
        network: Network,
        interactions: Interactions,
        runs: Runs,
        detail: Detail,
        baseline: Baseline,
        thresholds: Thresholds,
      }),
      outputSchema: z.object({
        url: z.string(),
        runId: PageRunId,
        detail: DetailOut,
        workflow: z.string(),
        viewport: z.enum(VIEWPORTS),
        ...FoundOut,
        navMs: z.number(),
        pageErrors: z.array(z.string()),
        throttling: Throttling,
        results: z
          .array(z.looseObject({ id: z.string(), status: z.string() }).meta({ additionalProperties: true }))
          .describe("One object per step, in order, then the follow-ups, each with the reason it was added"),
        runs: RunsSummary,
        baseline: Comparison,
        nextSteps: NextSteps,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    pageTool({
      conditionsOf: ({ viewport, workflow, waitMs, cpu, network }) => ({ viewport, workflow, waitMs, cpu, network }),
      measure: ({ url, workflow, waitMs, viewport, cpu, network, interactions }, prepared, progress) =>
        runMeasurement({ url, workflow: WORKFLOWS[workflow], rules: RULES, waitMs, viewport: VIEWPORT_PRESETS[viewport], cpu, network, interactions, ...progress }),
      // The runner explains a skipped step with the flag of the CLI; here the tools are what the model has
      resultsOf: (run) => run.results.map((r) => (r.status === "skipped" ? { ...r, reason: SKIPPED_STEP } : r)),
      pathsOf: ({ workflow }) => pathsOfRun({ workflow: WORKFLOWS[workflow], rules: RULES }),
      answer({ args: { url, workflow, viewport, waitMs, cpu, network, detail }, run, results, found, runId, comparison }) {
        const shaped = shapeResults(results, detail);
        // The runner already ran the follow-ups of the decision tree; what is left is the steps it skipped
        const skipped = results
          .filter((r) => r.status === "skipped")
          .map((r) => WORKFLOWS[workflow].steps.find((s) => s.id === r.id)?.path)
          .filter(Boolean);
        const nextSteps = skipped.length ? inputStepsCalls({ workflow, paths: skipped, url, viewport, waitMs, cpu, network }) : [];
        return {
          url,
          runId,
          ...shaped,
          workflow,
          viewport,
          ...found,
          navMs: run.navMs,
          pageErrors: run.pageErrors,
          ...(run.throttling ? { throttling: run.throttling } : {}),
          ...(run.runs ? { runs: run.runs } : {}),
          ...comparison,
          ...(nextSteps.length ? { nextSteps } : {}),
        };
      },
    })
  );
}
