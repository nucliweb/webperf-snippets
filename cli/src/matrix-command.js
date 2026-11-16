import { VIEWPORT_PRESETS } from "./runner.js";
import { reportMatrixHuman } from "./reporters/human.js";
import { reportJson } from "./reporters/json.js";
import { reportMatrixMarkdown } from "./reporters/markdown.js";
import { cliVersion, reportTo } from "./report-to.js";
import { formFactorFor } from "./crux.js";
import { failingIssues } from "./blocking.js";
import { checkBudgets, violationsOf } from "./budgets.js";
import { reportOf } from "./overview.js";
import { compareMatrix } from "./baseline.js";
import { describeMatrixRegressions, describeMatrixInconclusive, matrixComparisonView } from "./reporters/baseline-view.js";
import { matrixOutcome } from "./exit-code.js";
import { measureRunsWithProgress, say, writeReport } from "./output.js";

// Every combination of the matrix, in order, each one `matrix.runs` times. Each combination reports
// its median run, and the exit code, which it returns, follows the same rules as one page, for every combination.
export async function runMatrix(options, { measureWith, conditionsFor, pathOf, fieldDataOf }) {
  const { values, matrixPath, matrix, waitMs, reportUrl, failOn, baseline, thresholds, budgets, cruxKey } = options;
  for (const warning of matrix.warnings) say(`Warning: ${warning}`);
  const viewportOf = new Map(matrix.combinations.map((c) => [c.id, c.viewport]));

  const total = matrix.combinations.length * matrix.runs;
  const width = String(total).length;
  let started = 0;
  const combinations = [];
  const startedAt = new Date().toISOString();
  for (const c of matrix.combinations) {
    const date = new Date().toISOString();
    const conditions = { url: c.url, viewport: VIEWPORT_PRESETS[c.viewport], storageState: c.storageState, headers: c.headers, cpu: c.cpu, network: c.network, ownDomains: c.ownDomains };
    const median = await measureRunsWithProgress(() => measureWith(conditions), matrix.runs, matrix.medianBy, (i) => `[${String(++started).padStart(width)}/${total}] ${c.id} · run ${i}/${matrix.runs}`);
    const identity = { id: c.id, name: c.name, device: c.device, ...(c.variant ? { variant: c.variant } : {}), url: c.url };
    const { browser, ...measured } = median.payload ?? {};
    combinations.push(
      median.payload
        ? { ...identity, date, navMs: measured.navMs, ...reportOf(measured.results, pathOf), ...measured, runs: median.runs, conditions: conditionsFor({ ...c, browser }) }
        : { ...identity, date, status: "error", error: `Every run failed: ${median.errors.join("; ")}`, runs: { count: matrix.runs, failed: matrix.runs }, conditions: conditionsFor(c) }
    );
  }

  // The field data of a URL depends on the form factor, not on the variant: one query for each pair
  if (cruxKey) {
    const queries = new Map();
    for (const c of combinations.filter((c) => !c.error)) {
      const formFactor = formFactorFor(viewportOf.get(c.id));
      const key = `${c.url} ${formFactor}`;
      if (!queries.has(key)) queries.set(key, fieldDataOf(c.url, formFactor));
      const crux = await queries.get(key);
      if (crux) c.crux = crux;
    }
  }

  // With --baseline, each combination is compared with the one of the same id in the baseline
  let comparison;
  if (baseline) {
    const { root, combinations: byId } = compareMatrix(baseline.data, { combinations }, { file: baseline.file, thresholds });
    for (const c of combinations) if (byId[c.id]) c.baseline = byId[c.id];
    comparison = root;
    for (const warning of matrixComparisonView(root, combinations).warnings) say(`Warning: ${warning}`);
  }

  if (Object.keys(budgets).length > 0) for (const c of combinations.filter((c) => !c.error)) c.budgets = checkBudgets(c, budgets);

  const withBaseline = comparison ? { baseline: comparison } : {};
  const report = { matrix: matrixPath, runs: matrix.runs, combinations, verbose: values.verbose, ...withBaseline };
  const output = values.markdown ? reportMatrixMarkdown(report) : values.json ? reportJson({ matrix: matrixPath, date: startedAt, runs: matrix.runs, ...withBaseline, combinations }) : reportMatrixHuman(report);
  await writeReport(output + "\n");

  // One report for each combination, with the body of one page and the device, variant and runs of
  // the combination. The headers are conditions of the load, never part of the body.
  if (reportUrl) {
    for (const c of combinations.filter((c) => !c.error)) {
      const outcome = await reportTo({
        url: reportUrl,
        apiKey: values["api-key"] || process.env.PERF_REVIEWS_API_KEY,
        body: {
          url: c.url,
          workflow: values.snippet ? null : (values.workflow ?? "core-web-vitals"),
          ...(values.snippet ? { snippet: values.snippet } : {}),
          timestamp: new Date().toISOString(),
          navMs: c.navMs,
          overview: c.overview,
          issues: c.issues,
          results: c.results,
          ...(c.budgets ? { budgets: c.budgets } : {}),
          meta: {
            viewport: viewportOf.get(c.id),
            device: c.device,
            ...(c.variant ? { variant: c.variant } : {}),
            waitMs,
            ...(c.throttling ? { throttling: c.throttling } : {}),
            runs: c.runs,
            cli_version: cliVersion,
          },
        },
      });
      if (!outcome.ok) {
        say(`Warning: could not report ${c.id} to ${new URL(reportUrl).origin} (${outcome.warning})`);
      } else if (outcome.regressions.length > 0) {
        process.stderr.write(`Regressions detected in ${c.id}:\n${outcome.regressions.map((r) => `  - ${typeof r === "string" ? r : JSON.stringify(r)}`).join("\n")}\n`);
      }
    }
  }

  // Without --fail-on-regression or --fail-on-inconclusive the comparison only informs
  const { lines, code } = matrixOutcome({
    budgetViolations: combinations.flatMap((c) => violationsOf(c.budgets ?? []).map((v) => `${v} (${c.id})`)),
    regressions: values["fail-on-regression"] ? describeMatrixRegressions(combinations) : [],
    inconclusive: values["fail-on-inconclusive"] ? describeMatrixInconclusive(combinations) : [],
    against: baseline?.file,
    failed: combinations.some((c) => c.error || failingIssues(c.results, failOn).length > 0),
  });
  lines.forEach((line) => say(line));
  return code;
}
