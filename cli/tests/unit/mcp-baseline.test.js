import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prepareBaseline, compareWithBaseline } from "../../src/mcp/baseline.js";
import { createRuns } from "../../src/mcp/summary.js";
import { compareRun, DEFAULT_THRESHOLDS } from "../../src/baseline.js";
import { cliVersion } from "../../src/report-to.js";

// The baseline of a tool of the MCP server: the runId of an earlier run of the connection, or a file
// the CLI wrote with --json. Both are compared with baseline.js, as --baseline does.
const CONDITIONS = { viewport: "mobile", snippet: "CoreWebVitals/LCP", waitMs: 0, cliVersion };
const lcp = (value) => [{ id: "CoreWebVitals/LCP", script: "LCP", status: "ok", metric: "LCP", value, unit: "ms" }];
const page = (value, url = "http://localhost:3101/product") => ({ url, navMs: 400, pageErrors: [], conditions: CONDITIONS, results: lcp(value) });

let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "webperf-mcp-baseline-"));
});

const file = (name, data) => {
  const path = join(dir, name);
  writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data));
  return path;
};

describe("a baseline of the MCP server", () => {
  it("is an earlier run of the connection, by its runId, and a slower page regresses against it", () => {
    const runs = createRuns();
    const { results, ...rest } = page(2100);
    const runId = runs.keep(results, rest);
    const comparison = compareWithBaseline(prepareBaseline({ baseline: runId }, runs), page(2900));
    expect(comparison).toMatchObject({ runId, url: "http://localhost:3101/product", errors: { new: [], fixed: [] } });
    expect(comparison.file).toBeUndefined();
    expect(comparison.metrics.LCP).toMatchObject({ baseline: 2100, current: 2900, delta: 800, threshold: 210, verdict: "regressed" });
    expect(comparison.regressions).toEqual(["LCP ▲ +800ms (+38%)"]);
  });

  it("is a file the CLI wrote with --json, with the verdict --baseline gives for it", () => {
    const base = page(2100);
    const path = file("cli.json", base);
    const comparison = compareWithBaseline(prepareBaseline({ baseline: path }, createRuns()), page(2150));
    const { file: name, ...cli } = compareRun(base, page(2150), { file: path, thresholds: DEFAULT_THRESHOLDS });
    expect(name).toBe(path);
    expect(comparison).toEqual({ file: path, ...cli, regressions: [] });
    expect(comparison.metrics.LCP.verdict).toBe("unchanged");
  });

  it("uses the thresholds given as --threshold does", () => {
    const runs = createRuns();
    const { results, ...rest } = page(2100);
    const runId = runs.keep(results, rest);
    const comparison = compareWithBaseline(prepareBaseline({ baseline: runId, thresholds: ["LCP=50%"] }, runs), page(2900));
    expect(comparison.metrics.LCP).toMatchObject({ threshold: 1050, verdict: "unchanged" });
  });

  // A tool of the server measures one run: statistics need five a side, so the rule of the range applies
  it("judges one run against a file of several runs by their range, as --baseline does", () => {
    const values = [2000, 2100, 2500, 2900, 3000];
    const base = { ...page(2500), runs: { count: 5, failed: 0, medianRun: 3, medianBy: "LCP", summary: { LCP: { median: 2500, min: 2000, max: 3000, values, unit: "ms" } } } };
    const prepared = prepareBaseline({ baseline: file("runs.json", base) }, createRuns());
    const inside = compareWithBaseline(prepared, page(2900)).metrics.LCP;
    expect(inside).toMatchObject({ threshold: 250, verdict: "unchanged" });
    expect(inside.stats).toBeUndefined();
    expect(compareWithBaseline(prepared, page(3100)).metrics.LCP.verdict).toBe("regressed");
    expect(compareWithBaseline(prepared, page(3100)).warnings).toContain("the baseline has 5 runs, and this run 1");
  });

  it("refuses a threshold it does not understand, with how to write one", () => {
    expect(() => prepareBaseline({ baseline: "x.json", thresholds: ["LCP=fast"] }, createRuns())).toThrow(/LCP=15%/);
  });

  it("refuses the baseline of a matrix, which only the CLI compares", () => {
    const path = file("matrix.json", { matrix: "matrix.json", runs: 3, combinations: [] });
    expect(() => prepareBaseline({ baseline: path }, createRuns())).toThrow(/baseline of a matrix.*--matrix/);
  });

  it("refuses a file that does not exist, or that is not an output of the CLI", () => {
    expect(() => prepareBaseline({ baseline: join(dir, "none.json") }, createRuns())).toThrow(/does not exist/);
    expect(() => prepareBaseline({ baseline: file("other.json", { name: "other" }) }, createRuns())).toThrow(/not an output of webperf-snippets/);
  });

  it("answers a runId the connection no longer keeps with an error that says to run again", () => {
    expect(() => prepareBaseline({ baseline: randomUUID() }, createRuns())).toThrow(/Unknown runId .*Run the tool again/);
  });

  it("refuses a run that read an open page, which measured no page load", () => {
    const runs = createRuns();
    const runId = runs.keep([{ id: "CoreWebVitals/INP", script: "INP", status: "ok" }]);
    expect(() => prepareBaseline({ baseline: runId }, runs)).toThrow(/run_snippet or run_workflow/);
  });
});
