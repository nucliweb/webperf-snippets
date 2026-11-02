import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { compareRun, DEFAULT_THRESHOLDS } from "../../src/baseline.js";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const execute = promisify(execFile);

// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = 500;
// Far beyond the default threshold of LCP and the noise of one load, so five runs a side never overlap
const LATE = 800;
// No value of one side reaches the other: with five a side, a p-value of 1/252, or under 0.01 with ties
const REGRESSED = { verdict: "regressed", stats: { p: expect.closeTo(0.005, 2) } };

// /product is one image, as late as the next of `delays` says, or as `delay` when none is left: a run
// is a real load with the LCP a test gives it. A load that `fails` closes its connection, a navigation
// that fails. /large has enough images for a result over the size of a whole answer.
let delays = [];
let delay = 0;
let fails = [];
let loads = 0;
const image = (src) => `<img src="${src}" width="600" height="400" alt="Product photo">`;
const html = (body) => `<!DOCTYPE html><html><head><title>Product</title></head><body><h1>Product</h1>${body}</body></html>`;
let server;
let base;
let dir;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createHttpServer((req, res) => {
      const { pathname, searchParams } = new URL(req.url, "http://localhost");
      if (pathname === "/product") {
        loads++;
        if (fails.includes(loads)) return req.socket.destroy();
        return res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(html(image(`/hero.png?delay=${delays.shift() ?? delay}&load=${loads}`)));
      }
      if (pathname === "/large") {
        const images = Array.from({ length: 60 }, (_, i) => `<img src="/hero.png?n=${i}" alt="Photo number ${i} of the long gallery of this product">`);
        return res.writeHead(200, { "Content-Type": "text/html" }).end(html(images.join("")));
      }
      if (pathname === "/hero.png") {
        return setTimeout(() => res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }).end(png), Number(searchParams.get("delay") ?? 0));
      }
      res.writeHead(404).end();
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
  dir = mkdtempSync(join(tmpdir(), "webperf-mcp-runs-"));
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

// A client joined in memory, and a real Chromium on the local page
let client;

beforeEach(async () => {
  delays = [];
  delay = 0;
  fails = [];
  loads = 0;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

const url = () => `${base}/product`;

async function call(name, args, options) {
  const result = await client.callTool({ name, arguments: args }, options);
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return result.structuredContent;
}
const lcp = (args, options) => call("run_snippet", { url: url(), snippet: "LCP", waitMs: WAIT_MS, ...args }, options);

// The CLI on the same page: its --json, as a file for the server to read
async function cli(...args) {
  const { stdout } = await execute("node", [BIN, ...args, "--wait", String(WAIT_MS), "--json"], { env: cliEnv() }).catch((err) => err);
  return stdout;
}

describe("several runs on the tools that measure", () => {
  it("answer with the median run and the agreement of each metric, as --runs of the CLI", async () => {
    // 600 ms between runs: the 200 ms below held only by 100 ms with 300 ms, and failed with the CPU busy
    delays = [1200, 0, 600];
    const { runs, result, navMs } = await lcp({ runs: 3 });
    expect(runs).toMatchObject({ count: 3, failed: 0, medianRun: 3, medianBy: "LCP" });
    const { LCP } = runs.summary;
    expect(LCP.values).toHaveLength(3);
    expect(LCP.median).toBe(LCP.values[2]);
    expect(LCP.min).toBe(LCP.values[1]);
    expect(LCP.max).toBe(LCP.values[0]);
    expect(LCP.median - LCP.min).toBeGreaterThan(200);
    expect(LCP.max - LCP.median).toBeGreaterThan(200);
    expect(LCP).toMatchObject({ unit: "ms", agreement: "noisy", cv: expect.any(Number) });
    // The result is the one of the median run, so it agrees with the median
    expect(result.value).toBe(LCP.median);
    expect(navMs).toBeGreaterThan(300);

    delays = [1200, 0, 600];
    const fromCli = JSON.parse(await cli(url(), "--snippet", "LCP", "--runs", "3")).runs;
    expect(Object.keys(runs).sort()).toEqual(Object.keys(fromCli).sort());
    expect(Object.keys(LCP).sort()).toEqual(Object.keys(fromCli.summary.LCP).sort());
    expect(fromCli.medianRun).toBe(3);
  }, 120000);

  it("are one run and no `runs` field by default", async () => {
    const { runs } = await lcp({});
    expect(runs).toBeUndefined();
    expect(loads).toBe(1);
  }, 60000);

  it("work on run_workflow, by LCP, and get_details gives the median run of the summary", async () => {
    delays = [600, 0, 300];
    const { runId, runs, results, detail } = await call("run_workflow", { url: url(), workflow: "core-web-vitals", waitMs: WAIT_MS, runs: 3, detail: "summary" });
    expect(detail).toBe("summary");
    expect(runs).toMatchObject({ count: 3, medianRun: 3, medianBy: "LCP" });
    const summary = results.find((r) => r.id === "LCP");
    expect(summary.value).toBe(runs.summary.LCP.median);

    const details = await call("get_details", { runId, snippet: "LCP" });
    expect(details).toMatchObject({ runId, snippet: "LCP", medianRun: 3, result: { id: "LCP", value: runs.summary.LCP.median } });
    expect(details.result.details).toEqual(expect.any(Object));
  }, 120000);

  it("keep the adaptive size of the answer: a large result comes as a summary, with the runs", async () => {
    const { detail, runId, runs, results } = await call("run_workflow", { url: `${base}/large`, workflow: "audit", waitMs: WAIT_MS, runs: 2 });
    expect(detail).toBe("summary");
    for (const r of results) expect(r.details).toBeUndefined();
    expect(runs).toMatchObject({ count: 2, failed: 0 });
    const { result } = await call("get_details", { runId, snippet: results[0].id });
    expect(JSON.stringify(result).length).toBeGreaterThan(JSON.stringify(results[0]).length);
  }, 120000);

  it("leave out a run that fails, and say so", async () => {
    delays = [100, 100];
    fails = [2];
    const { runs, result } = await lcp({ runs: 3 });
    expect(runs).toMatchObject({ count: 3, failed: 1 });
    expect(runs.summary.LCP.values[1]).toBeNull();
    expect(runs.summary.LCP.values.filter((value) => typeof value === "number")).toHaveLength(2);
    expect(result.status).toBe("ok");
  }, 120000);

  it("answer with a tool error of one line when every run fails", async () => {
    fails = [1, 2];
    const result = await client.callTool({ name: "run_snippet", arguments: { url: url(), snippet: "LCP", waitMs: WAIT_MS, runs: 2 } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Could not load .*: Every run failed: page\.goto: /);
    expect(result.content[0].text).not.toContain("\n");
    expect(loads).toBe(2);
  }, 60000);
});

describe("how long several runs take", () => {
  it("reports the three stages of each run, numbered across the runs", async () => {
    const updates = [];
    await lcp({ runs: 2 }, { onprogress: (u) => updates.push(u) });
    expect(updates.map((u) => u.progress)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(updates.every((u) => u.total === 6)).toBe(true);
    expect(updates[0].message).toBe("Run 1 of 2: Opening Chromium");
    expect(updates[5].message).toBe("Run 2 of 2: Snippets evaluated");
  }, 60000);

  it("keeps a client that resets its timeout on progress waiting for longer than that timeout", async () => {
    const started = Date.now();
    const timeout = 5000;
    const { runs } = await lcp({ runs: 3, waitMs: 2000 }, { timeout, resetTimeoutOnProgress: true, onprogress: () => {} });
    expect(runs.count).toBe(3);
    expect(Date.now() - started).toBeGreaterThan(timeout);
  }, 60000);

  it("stops starting runs when the client gives up, on its timeout or by cancelling", async () => {
    await expect(lcp({ runs: 5 }, { timeout: 500 })).rejects.toThrow(/timed out/i);
    // Five runs of about a second each would all have started by now
    await new Promise((resolve) => setTimeout(resolve, 6000));
    expect(loads).toBeLessThanOrEqual(2);
  }, 60000);
});

describe("several runs with a baseline", () => {
  it("reach the statistical verdict with five runs a side, by runId", async () => {
    const before = await lcp({ runs: 5 });
    expect(before.baseline).toBeUndefined();

    // The noise of a page that does not change is well under this threshold, which keeps the test off
    // the 5 % of chance the p-value leaves
    const same = await lcp({ runs: 5, baseline: before.runId, thresholds: ["LCP=300ms"] });
    expect(same.baseline.runs).toEqual({ count: 5, medianBy: "LCP" });
    expect(same.baseline.metrics.LCP).toMatchObject({ verdict: "unchanged", stats: { p: expect.any(Number) } });
    expect(same.baseline.regressions).toEqual([]);
    expect(same.baseline.warnings).toEqual([]);

    delay = LATE;
    const after = await lcp({ runs: 5, baseline: before.runId });
    expect(after.baseline.metrics.LCP).toMatchObject(REGRESSED);
    expect(after.baseline.metrics.LCP.stats.shift).toBeGreaterThan(LATE / 2);
    expect(after.baseline.regressions).toEqual([expect.stringMatching(/^LCP ▲ \+\d+ms/)]);
    expect(after.baseline.warnings).toEqual([]);
  }, 120000);

  it("say what to do when the baseline has one run, in words for the MCP server and the CLI", async () => {
    const before = await lcp({});
    const after = await lcp({ runs: 5, baseline: before.runId, thresholds: ["LCP=500ms"] });
    expect(after.baseline.metrics.LCP.stats).toBeUndefined();
    expect(after.baseline.warnings).toEqual(["the baseline has 1 run, so only the thresholds apply; measure both with 5 runs or more"]);
  }, 60000);

  it("give the verdict of --baseline for the same file, and of baseline.js for the same two sets of runs", async () => {
    const file = join(dir, "five-runs.json");
    writeFileSync(file, await cli(url(), "--snippet", "LCP", "--runs", "5"));

    delay = LATE;
    const { baseline: cliComparison } = JSON.parse(await cli(url(), "--snippet", "LCP", "--runs", "5", "--baseline", file));
    const { runId, baseline } = await lcp({ runs: 5, baseline: file });
    expect(cliComparison.metrics.LCP).toMatchObject(REGRESSED);
    expect(baseline.metrics.LCP).toMatchObject({ ...REGRESSED, baseline: cliComparison.metrics.LCP.baseline });
    expect(baseline.warnings).toEqual(cliComparison.warnings);
    expect(baseline.regressions).toHaveLength(1);

    // One side measured by the CLI, the other by the server: what the CLI runs on both gives this answer
    const current = JSON.parse((await client.readResource({ uri: `webperf://runs/${runId}` })).contents[0].text);
    const { metrics, errors } = compareRun(JSON.parse(readFileSync(file, "utf8")), current, { file, thresholds: DEFAULT_THRESHOLDS });
    expect(baseline.metrics).toEqual(metrics);
    expect(baseline.errors).toEqual(errors);
  }, 180000);

  it("keep a measurement of several runs as a resource, in the shape of the JSON of the CLI, which is a baseline of the CLI too", async () => {
    const before = await lcp({ runs: 5 });
    const listed = (await client.listResources()).resources.filter((r) => r.uri.startsWith("webperf://runs/"));
    expect(listed).toEqual([expect.objectContaining({ uri: `webperf://runs/${before.runId}`, name: `CoreWebVitals/LCP on ${url()} (mobile), 5 runs` })]);

    const [{ text }] = (await client.readResource({ uri: listed[0].uri })).contents;
    const run = JSON.parse(text);
    expect(run.runs).toEqual(before.runs);
    expect(run.results[0].value).toBe(before.runs.summary.LCP.median);

    const file = join(dir, "from-mcp.json");
    writeFileSync(file, text);
    delay = LATE;
    const { baseline } = JSON.parse(await cli(url(), "--snippet", "LCP", "--runs", "5", "--baseline", file));
    expect(baseline.runs).toEqual({ count: 5, medianBy: "LCP" });
    expect(baseline.metrics.LCP).toMatchObject(REGRESSED);
  }, 120000);
});
