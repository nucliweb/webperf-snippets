import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliEnv } from "../helpers/cli-env.js";
import { startContractServers } from "../helpers/contract.js";
import { auditWorkflow } from "../../src/workflows/audit.js";

// The JSON of the CLI says what the results found, as the export of the audit of the extension: when it
// was measured (date), how many snippets have errors, warnings or nothing to fix (overview) and every
// issue in one list, errors first (issues). The seeded page has render-blocking resources and an image
// with loading="lazy" and fetchpriority="high", two errors of the audit.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));
const SEVERITY = ["error", "warning", "info"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let servers;
let dir;

beforeAll(async () => {
  servers = await startContractServers();
  dir = mkdtempSync(join(tmpdir(), "report-overview-"));
}, 30000);

afterAll(() => servers?.close());

const cli = (args) =>
  new Promise((resolve) =>
    execFile(process.execPath, [BIN, ...args], { env: cliEnv(), maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ code: err?.code ?? 0, stdout, stderr, said: `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}` })
    )
  );

// What the report says against what its results have: the same issues, in severity order
function expectReportOfResults(report) {
  const fromResults = report.results.flatMap((r) => (r.status === "error" ? [{ id: r.id, severity: "error" }] : (r.issues ?? []).map((i) => ({ id: r.id, severity: i.severity }))));
  expect(report.issues.map(({ id, severity }) => ({ id, severity })).sort((a, b) => a.id.localeCompare(b.id) || a.severity.localeCompare(b.severity))).toEqual(
    fromResults.sort((a, b) => a.id.localeCompare(b.id) || a.severity.localeCompare(b.severity))
  );
  const order = report.issues.map((i) => SEVERITY.indexOf(i.severity));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(report.overview.snippets).toBe(report.results.length);
  expect(report.overview.withErrors + report.overview.withWarnings + report.overview.withNothingToFix).toBe(report.results.length);
}

describe("the overview and the issues in the JSON", () => {
  it("of the audit say what every step found, with the path of its snippet, errors first", async () => {
    const before = Date.now();
    const { stdout, said } = await cli([`${servers.base}/seeded`, "--workflow", "audit", "--wait", "500", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.date, said).toMatch(ISO);
    expect(Date.parse(report.date)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(report.date)).toBeLessThanOrEqual(Date.now());
    expectReportOfResults(report);
    expect(report.overview.snippets).toBe(auditWorkflow.steps.length);
    expect(report.overview.withErrors).toBeGreaterThan(0);
    // Each issue names the step and the snippet it comes from
    const pathOf = Object.fromEntries(auditWorkflow.steps.map((s) => [s.id, s.path]));
    for (const issue of report.issues) expect(issue.path, issue.id).toBe(pathOf[issue.id]);
    expect(report.issues[0]).toMatchObject({ severity: "error", code: expect.any(String), message: expect.any(String) });
    expect(report.issues).toContainEqual(expect.objectContaining({ id: "render-blocking", path: "Loading/Find-render-blocking-resources", severity: "error" }));
  }, 120000);

  it("of one snippet name it as it was given, with the path it resolves to", async () => {
    const { stdout, said } = await cli([`${servers.base}/seeded`, "--snippet", "render-blocking", "--wait", "500", "--json"]);
    const report = JSON.parse(stdout);
    expectReportOfResults(report);
    expect(report.issues.length, said).toBeGreaterThan(0);
    for (const issue of report.issues) expect(issue).toMatchObject({ id: "render-blocking", path: "Loading/Find-render-blocking-resources" });
  }, 60000);

  it("of the Core Web Vitals of a page with nothing to fix are an empty list", async () => {
    const { stdout, said } = await cli([`${servers.base}/empty`, "--wait", "500", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.date, said).toMatch(ISO);
    expectReportOfResults(report);
    expect(report.overview).toEqual({ snippets: 2, withErrors: 0, withWarnings: 0, withNothingToFix: 2 });
    expect(report.issues).toEqual([]);
  }, 60000);

  it("of several runs are the ones of the run the report keeps", async () => {
    const { stdout, said } = await cli([`${servers.base}/seeded`, "--snippet", "render-blocking", "--runs", "2", "--wait", "500", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.runs.count, said).toBe(2);
    expect(report.date).toMatch(ISO);
    expectReportOfResults(report);
  }, 90000);

  it("of a matrix go in each combination, with its date, and the matrix has the date it started", async () => {
    const file = join(dir, "matrix.json");
    writeFileSync(file, JSON.stringify({ urls: { seeded: `${servers.base}/seeded`, empty: `${servers.base}/empty` }, devices: ["mobile"] }));
    const { stdout, said } = await cli(["--matrix", file, "--snippet", "render-blocking", "--wait", "500", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.date, said).toMatch(ISO);
    expect(report.combinations).toHaveLength(2);
    for (const c of report.combinations) {
      expect(c.date).toMatch(ISO);
      expect(Date.parse(c.date)).toBeGreaterThanOrEqual(Date.parse(report.date));
      expectReportOfResults(c);
    }
    expect(report.combinations.find((c) => c.id.startsWith("seeded")).overview.withErrors).toBe(1);
    expect(report.combinations.find((c) => c.id.startsWith("empty")).issues).toEqual([]);
  }, 120000);
});
