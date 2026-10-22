import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
const run = promisify(execFile);

// /delays/600,50,350/<id> answers its first load after 600 ms, its second after 50 ms and its third
// after 350 ms, so the order of the LCP of the runs is the server's and not noise. "destroy" closes
// the connection instead, so that load fails. Each test uses its own id, which counts its loads.
let server;
let baseUrl;
const loads = new Map();

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      const [, , list, id] = req.url.split("/");
      if (!list || !id) {
        res.writeHead(404);
        return res.end();
      }
      const n = (loads.get(id) ?? 0) + 1;
      loads.set(id, n);
      const delay = list.split(",")[n - 1];
      if (delay === "destroy") return req.socket.destroy();
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!doctype html><title>Load ${n}</title><h1>Load ${n} of a page measured several times</h1>`);
      }, Number(delay));
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

let ids = 0;
const pageWith = (delays) => `${baseUrl}/delays/${delays}/t${++ids}`;

const cli = (url, ...args) =>
  run("node", [BIN, url, "--wait", "300", ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr })
  );

describe("--runs", () => {
  it("measures the page N times and reports the median run by LCP, with the summary of each metric", async () => {
    const url = pageWith("600,50,350");
    const { code, stdout } = await cli(url, "--runs", "3", "--json");
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.runs).toMatchObject({ count: 3, failed: 0, medianRun: 3, medianBy: "LCP" });
    const [first, second, third] = payload.runs.summary.LCP.values;
    expect(first).toBeGreaterThan(third);
    expect(third).toBeGreaterThan(second);
    expect(payload.runs.summary.LCP.median).toBe(third);
    expect(payload.results.find((r) => r.metric === "LCP").value).toBe(third);
  }, 90000);

  it("reports each load on stderr, and only with --runs", async () => {
    const url = pageWith("0,0");
    const withRuns = await cli(url, "--runs", "2", "--json");
    expect(withRuns.stderr).toContain(`[1/2] ${url} · run 1/2`);
    expect(withRuns.stderr).toContain(`[2/2] ${url} · run 2/2`);

    const once = await cli(pageWith("0"), "--json");
    expect(once.stderr).not.toContain("[1/");
    expect(JSON.parse(once.stdout)).not.toHaveProperty("runs");
  }, 90000);

  it("compares the budgets with the median, not with each run", async () => {
    const pass = await cli(pageWith("600,50,350"), "--runs", "3", "--budget-lcp", "550");
    expect(pass.code).toBe(0);

    const fail = await cli(pageWith("600,50,350"), "--runs", "3", "--budget-lcp", "300");
    expect(fail.code).toBe(1);
    expect(fail.stderr).toMatch(/LCP \d+ms exceeds budget 300ms/);
  }, 120000);

  it("leaves out a load that fails and counts it", async () => {
    const { code, stdout } = await cli(pageWith("300,destroy,100"), "--runs", "3", "--json");
    expect(code).toBe(0);
    expect(JSON.parse(stdout).runs).toMatchObject({ count: 3, failed: 1, medianRun: 3 });
  }, 90000);

  it("follows the metric of --median-by, and falls back when the runs did not measure it", async () => {
    const byNav = JSON.parse((await cli(pageWith("0,0,0"), "--runs", "3", "--json", "--median-by", "navMs")).stdout);
    expect(byNav.runs.medianBy).toBe("navMs");

    const byTtfb = JSON.parse((await cli(pageWith("0,0,0"), "--runs", "3", "--json", "--median-by", "TTFB")).stdout);
    expect(byTtfb.runs).toMatchObject({ medianBy: "LCP", medianByRequested: "TTFB" });
  }, 120000);

  it("names the runs and the median in the human and markdown reports", async () => {
    const human = await cli(pageWith("600,50,350"), "--runs", "3");
    expect(human.stdout).toContain("3 runs, median by LCP: run 3");
    expect(human.stdout).toMatch(/LCP\s+median \S+\s+min \S+\s+max \S+/);

    const markdown = await cli(pageWith("600,50,350"), "--runs", "3", "--markdown");
    expect(markdown.stdout).toContain("3 runs, median by LCP: run 3");
    expect(markdown.stdout).toContain("| Metric | Median | Min | Max |");
  }, 120000);

  it("fails with a clear error and exit code 2 for an invalid count or metric, before any load", async () => {
    const url = pageWith("0");
    for (const bad of ["0", "10", "2.5", "many"]) {
      const { code, stderr } = await cli(url, "--runs", bad);
      expect(code).toBe(2);
      expect(stderr).toContain(`Invalid --runs "${bad}". Use a whole number from 1 to 9`);
    }
    const { code, stderr } = await cli(url, "--runs", "3", "--median-by", "FID");
    expect(code).toBe(2);
    expect(stderr).toContain('Unknown --median-by "FID". Choose from: LCP, FCP, TTFB, CLS, INP, navMs');
    const alone = await cli(url, "--median-by", "LCP");
    expect(alone.code).toBe(2);
    expect(alone.stderr).toContain("--median-by needs --runs");
    expect(loads.get(url.split("/").pop())).toBeUndefined();
  }, 60000);
});
