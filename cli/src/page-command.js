import { reportHuman } from "./reporters/human.js";
import { reportJson } from "./reporters/json.js";
import { reportMarkdown } from "./reporters/markdown.js";
import { reportBody, reportLines, reportTo } from "./report-to.js";
import { formFactorFor } from "./crux.js";
import { MissingBrowserError } from "./browser.js";
import { failingIssues } from "./blocking.js";
import { checkBudgets, violationsOf } from "./budgets.js";
import { pageReport } from "./overview.js";
import { compareRun } from "./baseline.js";
import { describeRegressions, describeInconclusive } from "./reporters/baseline-view.js";
import { measureLiveBaseline } from "./live-baseline.js";
import { pageOutcome } from "./exit-code.js";
import { measureRunsWithProgress, say, writeReport } from "./output.js";

// One page: measured once, or several times for its median run, alone or against a live baseline,
// then compared, checked against its budgets, reported and, with --report-to, posted. Returns the exit
// code. `options` are the ones of the command line (options.js); `measureWith` measures a page under
// some conditions, and the others describe the run for the report.
export async function runPage(options, { measureWith, conditionsFor, pathOf, fieldDataOf }) {
  const { values, url, waitMs, viewportName, viewport, cpu, network, reportUrl, storageState, headers, ownDomains, runCount, medianBy, cruxKey, baseline, thresholds, live, maxRuns, failOn, budgets } = options;

  const conditions = { url, viewport, storageState, headers, cpu, network, ownDomains };
  // When the measurement started, in UTC
  const date = new Date().toISOString();
  const pageOf = (measured) => pageReport(measured, { date, pathOf, conditions: conditionsFor({ viewport: viewportName, cpu, network, browser: measured.browser }) });
  // The median run of several, with their runs field; one run without --runs has none, as always
  const medianOf = (median) => (runCount == null ? median.payload : { ...median.payload, runs: median.runs });

  let payload;
  let comparison;
  if (live) {
    // Both pages under the same conditions, their runs alternating, and the comparison of the CLI
    const urls = { baseline: values.baseline, current: url };
    const measuredLive = await measureLiveBaseline((side) => measureWith({ ...conditions, url: urls[side] }), {
      runs: runCount ?? 1,
      maxRuns,
      medianBy,
      compare: (base, current) => compareRun(pageOf(medianOf(base)), pageOf(medianOf(current)), { live: true, thresholds }),
      isFatal: (err) => err instanceof MissingBrowserError,
      onRun: ({ side, run, runs, step, steps }) => say(`[${step}/${steps}] ${side} ${urls[side]} · run ${run}/${runs}`),
      onExtend: ({ after, metrics, maxRuns }) =>
        say(`${metrics.join(", ")} inconclusive for the worse after ${after} runs a side: measuring both pages up to ${maxRuns} runs each`),
    });
    if (!measuredLive.current.payload) throw new Error(`Every run failed: ${measuredLive.current.errors.join("; ")}`);
    if (!measuredLive.baseline.payload) throw new Error(`Every run of the baseline ${values.baseline} failed: ${measuredLive.baseline.errors.join("; ")}`);
    payload = pageOf(medianOf(measuredLive.current));
    // The runs it added, next to the runs of the baseline
    const { metrics, errors, warnings, ...head } = measuredLive.comparison;
    comparison = { ...head, ...(measuredLive.extended ? { extended: measuredLive.extended } : {}), metrics, errors, warnings };
  } else if (runCount == null) {
    payload = pageOf(await measureWith(conditions));
  } else {
    const median = await measureRunsWithProgress(() => measureWith(conditions), runCount, medianBy, (i) => `[${i}/${runCount}] ${url} · run ${i}/${runCount}`);
    if (!median.payload) throw new Error(`Every run failed: ${median.errors.join("; ")}`);
    payload = pageOf(medianOf(median));
  }

  if (cruxKey) payload.crux = await fieldDataOf(url, formFactorFor(viewportName));

  if (baseline) comparison = compareRun(baseline.data, payload, { file: baseline.file, thresholds });
  if (comparison) {
    payload.baseline = comparison;
    for (const warning of payload.baseline.warnings) say(`Warning: ${warning}`);
  }

  // The verdict of each budget goes in the report, so a pull request comment says which one failed
  if (Object.keys(budgets).length > 0) payload.budgets = checkBudgets(payload, budgets);

  let output;
  if (values.markdown) {
    output = reportMarkdown(payload);
  } else if (values.json) {
    output = reportJson(payload);
  } else {
    output = reportHuman({ ...payload, verbose: values.verbose });
  }
  await writeReport(output + "\n");

  if (reportUrl) {
    const meta = { viewport: viewportName, waitMs, ...(payload.throttling ? { throttling: payload.throttling } : {}), ...(payload.runs ? { runs: payload.runs } : {}) };
    const outcome = await reportTo({ url: reportUrl, apiKey: values["api-key"] || process.env.PERF_REVIEWS_API_KEY, body: reportBody({ url, values, page: payload, meta }) });
    reportLines(outcome, { url: reportUrl }).forEach((line) => say(line));
  }

  // Without --fail-on-regression or --fail-on-inconclusive the comparison only informs, and the exit
  // code is the one of today. A live baseline is named by its URL, a file by its path
  const { lines, code } = pageOutcome({
    budgetViolations: violationsOf(payload.budgets ?? []),
    regressions: values["fail-on-regression"] ? describeRegressions(payload.baseline) : [],
    inconclusive: values["fail-on-inconclusive"] ? describeInconclusive(payload.baseline) : [],
    against: live ? values.baseline : baseline?.file,
    failing: failingIssues(payload.results, failOn).length > 0,
  });
  lines.forEach((line) => say(line));
  return code;
}
