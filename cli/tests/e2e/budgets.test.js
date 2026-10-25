import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
const run = promisify(execFile);
// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = "500";
const said = (stdout = "", stderr = "") => `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}`;

// A page with a heading for LCP and a button whose click handler blocks the main thread for 300 ms,
// far above an INP budget of 200 ms. Its async script, cached for a year, gives the snippets of the
// loading workflow a resource to read. The server counts its requests: a run that fails on its
// options makes none.
let server;
let base;
let dir;
let requests = 0;
const PAGE = `<!doctype html><title>Budgets</title><h1>A page with a slow button</h1>
<button id="slow" style="font-size:24px">Slow</button>
<script src="/app.js" async></script>
<script>document.getElementById("slow").addEventListener("click", () => { const t = performance.now(); while (performance.now() - t < 300) {} });</script>`;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      requests++;
      if (req.url === "/app.js") return res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=31536000, immutable" }).end("1;");
      res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/`;
  dir = mkdtempSync(join(tmpdir(), "webperf-budgets-"));
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const cli = (...args) =>
  run("node", [BIN, ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr, said: said(stdout, stderr) }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr, said: said(err.stdout, err.stderr) })
  );

const steps = (name, interactions) => {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify({ interactions }));
  return file;
};

describe("--budget-inp", () => {
  it("exceeds the budget with a slow click, in the interaction workflow", async () => {
    const clicks = steps("click.json", [{ action: "click", selector: "#slow" }, { action: "wait", ms: 300 }]);
    const { code, stderr, said: output } = await cli(base, "--workflow", "interaction", "--interact-script", clicks, "--budget-inp", "200");
    expect(code, output).toBe(1);
    expect(stderr).toMatch(/Budget violation: INP \d+ms exceeds budget 200ms/);
  }, 120000);

  it("fails as not measured without a click, instead of passing", async () => {
    const { code, stderr, said: output } = await cli(base, "--workflow", "interaction", "--budget-inp", "200");
    expect(code, output).toBe(1);
    expect(stderr).toMatch(/Budget violation: INP was not measured \(budget 200ms\)/);
  }, 120000);
});

describe("budgets that cannot be checked", () => {
  it("exits with 2 before the browser opens for a metric the run does not measure", async () => {
    const before = requests;
    const { code, stderr } = await cli(base, "--workflow", "audit", "--budget-lcp", "2500");
    expect(code).toBe(2);
    expect(stderr).toMatch(/--budget-lcp needs a run that measures LCP/);
    expect(requests).toBe(before);
  }, 30000);

  it("exits with 2 before the browser opens for a value that is not a number", async () => {
    const before = requests;
    const { code, stderr } = await cli(base, "--budget-fcp", "fast");
    expect(code).toBe(2);
    expect(stderr).toMatch(/Invalid --budget-fcp "fast"/);
    expect(requests).toBe(before);
  }, 30000);
});

describe("--budget-fcp and --budget-ttfb", () => {
  it("pass with a loose budget and fail with an impossible one, in the loading workflow", async () => {
    const loose = await cli(base, "--workflow", "loading", "--wait", WAIT_MS, "--budget-fcp", "60000", "--budget-ttfb", "60000");
    expect(loose.code, loose.said).toBe(0);
    const tight = await cli(base, "--workflow", "loading", "--wait", WAIT_MS, "--budget-fcp", "0", "--budget-ttfb", "0", "--json");
    expect(tight.code, tight.said).toBe(1);
    // stderr names the violations also with --json, since stdout carries the JSON
    expect(tight.stderr).toMatch(/Budget violation: FCP \d+ms exceeds budget 0ms/);
    expect(tight.stderr).toMatch(/Budget violation: TTFB [\d.]+ms exceeds budget 0ms/);
  }, 120000);
});

describe("the budgets in the reports", () => {
  it("gives every budget its verdict in the JSON output and in the markdown report", async () => {
    const json = await cli(base, "--wait", WAIT_MS, "--budget-lcp", "60000", "--budget-cls", "0", "--json");
    const { budgets } = JSON.parse(json.stdout);
    expect(budgets, json.said).toEqual([
      expect.objectContaining({ metric: "LCP", budget: 60000, unit: "ms", verdict: "passed" }),
      expect.objectContaining({ metric: "CLS", budget: 0, unit: "score" }),
    ]);
    const markdown = await cli(base, "--wait", WAIT_MS, "--budget-lcp", "60000", "--markdown");
    expect(markdown.stdout, markdown.said).toMatch(/### Budgets\n\| Metric \| Value \| Budget \| Verdict \|[\s\S]*\| LCP \| [\d.]+m?s \| 60\.00s \| ✅ passed \|/);
  }, 120000);
});
