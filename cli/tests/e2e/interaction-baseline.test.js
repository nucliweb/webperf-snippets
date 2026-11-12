import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";
import { startClickHandlerServer } from "../helpers/click-handler-page.js";

// The gate of a pull request for INP, every flag at once: the click of --interact-script in each of the
// five runs, under --cpu 4, compared with a baseline of the same flags, failing on a regression
const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const CLICK = join(HERE, "../fixtures/click-buy.json");
const run = promisify(execFile);
const said = (stdout = "", stderr = "") => `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}`;

// The handler of the baseline takes 40 ms and the slower one 800 ms: far beyond the 50 ms threshold of
// INP and the noise of the machine. With 300 ms, a busy runner of CI gave one baseline run as slow as a
// slower one, and the five runs a side did not reach p < 0.05 (p = 0.068)
const FAST_MS = 40;
const SLOW_MS = 800;
const FLAGS = ["--snippet", "INP", "--interact-script", CLICK, "--runs", "5", "--cpu", "4", "--wait", "500"];

let pages;
let baselineFile;

beforeAll(async () => {
  pages = await startClickHandlerServer();
}, 10000);

afterAll(() => pages.close());

const buy = (ms) => `${pages.base}/buy?ms=${ms}`;
const cli = (...args) =>
  run("node", [BIN, ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr, said: said(stdout, stderr) }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr, said: said(err.stdout, err.stderr) })
  );

describe("--interact-script with --runs, --cpu, --baseline and --fail-on-regression", () => {
  it("saves a baseline of five throttled runs with a click each", async () => {
    const { code, stdout, said: output } = await cli(buy(FAST_MS), ...FLAGS, "--json");
    expect(code, output).toBe(0);
    const page = JSON.parse(stdout);
    expect(page.throttling).toEqual({ cpu: 4 });
    expect(page.conditions).toMatchObject({ snippet: "CoreWebVitals/INP", cpu: 4 });
    expect(page.runs).toMatchObject({ count: 5, failed: 0 });
    expect(page.runs.summary.INP.values.every((value) => typeof value === "number")).toBe(true);
    baselineFile = join(mkdtempSync(join(tmpdir(), "webperf-interaction-baseline-")), "baseline.json");
    writeFileSync(baselineFile, stdout);
  }, 180000);

  it("exits 1 with the regression of INP on a page whose click handler is slower", async () => {
    const { code, stdout, stderr, said: output } = await cli(buy(SLOW_MS), ...FLAGS, "--baseline", baselineFile, "--fail-on-regression", "--json");
    expect(code, output).toBe(1);
    const { INP } = JSON.parse(stdout).baseline.metrics;
    expect(INP, output).toMatchObject({ verdict: "regressed" });
    expect(INP.stats.p).toBeLessThan(0.05);
    expect(stderr).toMatch(/Regression against .*: INP/);
  }, 180000);

  it("exits 0 on the same page measured again", async () => {
    const { code, stdout, said: output } = await cli(buy(FAST_MS), ...FLAGS, "--baseline", baselineFile, "--fail-on-regression", "--json");
    expect(code, output).toBe(0);
    expect(JSON.parse(stdout).baseline.metrics.INP.verdict).not.toBe("regressed");
  }, 180000);
});
