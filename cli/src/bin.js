#!/usr/bin/env node
import { runSnippets, runMeasurement } from "./runner.js";
import { InteractionError } from "./interactions.js";
import { RULES } from "./decision-tree.js";
import { cliVersion } from "./report-to.js";
import { fetchCrux, fetchCruxHistory } from "./crux.js";
import { MissingBrowserError } from "./browser.js";
import { measurementConditions } from "./conditions.js";
import { pathsOfRun } from "./overview.js";
import { machineOf } from "./machine.js";
import { parseOptions, UsageError } from "./options.js";
import { USAGE } from "./usage.js";
import { runPage } from "./page-command.js";
import { runMatrix } from "./matrix-command.js";
import { progress } from "./output.js";

// The command: it reads the options (options.js), builds what measures a page under them, and runs
// the page (page-command.js) or the matrix (matrix-command.js), which return the exit code.
async function main() {
  // The MCP server only loads its SDK when it is asked for
  if (process.argv[2] === "mcp") {
    const { startStdioServer } = await import("./mcp/stdio.js");
    await startStdioServer();
    return;
  }

  let options;
  try {
    options = parseOptions(process.argv.slice(2), process.env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    // To stderr, the usage of a command without a URL too: a pipe or a redirect of stdout gets no
    // usage text as a report
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (options.command === "help") return void process.stdout.write(USAGE);
  if (options.command === "version") return void process.stdout.write(`${cliVersion}\n`);

  const { values, waitMs, interactions, items, workflow, cruxKey, cruxWeeks } = options;
  // styleText looks at the environment each time it styles a text, and FORCE_COLOR wins over NO_COLOR
  if (values["no-color"]) {
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
  }
  // What each page load runs, a snippet or a workflow, under the conditions of the load
  const measureWith = (conditions) => {
    const options = { waitMs, headless: !values.headed, interactions, onProgress: progress.onStage, ...conditions };
    return items ? runSnippets({ ...options, items }) : runMeasurement({ ...options, workflow, rules: RULES });
  };
  // What the JSON records of how each page was measured, for a later run to compare with. The machine is
  // measured once, before Chromium starts, so its processes do not slow the benchmark down.
  const machine = machineOf();
  // The browser is the one of the run the report keeps: the run itself, or the median one
  const conditionsFor = ({ viewport, cpu, network, browser }) =>
    measurementConditions({ viewport, waitMs, cpu, network, browser, machine, ...(items ? { snippet: items[0].path } : { workflow: values.workflow ?? "core-web-vitals" }) });

  // The path of the snippet of each result, for the list of issues of the report
  const pathOf = pathsOfRun({ items: items ?? [], workflow, rules: RULES });

  // The field data: the p75 of the last 28 days with a key, and its trend week by week with --crux-history
  const fieldDataOf = async (url, formFactor) => {
    const crux = await fetchCrux({ url, apiKey: cruxKey, formFactor });
    return cruxWeeks ? { ...crux, history: await fetchCruxHistory({ url, apiKey: cruxKey, formFactor, weeks: cruxWeeks }) } : crux;
  };

  const run = options.command === "matrix" ? runMatrix : runPage;
  process.exit(await run(options, { measureWith, conditionsFor, pathOf, fieldDataOf }));
}

main().catch((err) => {
  // A missing Chromium is a step of the setup, not a bug: the message says what to run, without a stack
  // Nor is a step of --interact-script that the page did not take: its message names the step
  const known = err instanceof MissingBrowserError || err instanceof InteractionError;
  progress.stop();
  process.stderr.write(known ? `${err.message}\n` : `Error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
