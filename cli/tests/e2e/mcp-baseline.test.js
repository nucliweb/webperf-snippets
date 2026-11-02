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
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const execute = promisify(execFile);

// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = 500;

// /product is fast until a test makes it slow: the same URL in the baseline and in the run, with an image
// 800 ms later, far beyond the default threshold of LCP. /styled has a stylesheet that blocks rendering,
// an error of the render-blocking snippet.
const page = (img, head = "") =>
  `<!DOCTYPE html><html><head><title>Product</title>${head}</head><body><h1>Product</h1><img src="${img}" width="600" height="400" alt="Product photo"></body></html>`;
let server;
let base;
let dir;
let slowProduct = false;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createHttpServer((req, res) => {
      const path = req.url.split("?")[0];
      if (path === "/product") return res.writeHead(200, { "Content-Type": "text/html" }).end(page(slowProduct ? "/hero.png?slow" : "/hero.png"));
      if (path === "/styled") return res.writeHead(200, { "Content-Type": "text/html" }).end(page("/hero.png", `<link rel="stylesheet" href="/style.css">`));
      if (path === "/style.css") return res.writeHead(200, { "Content-Type": "text/css" }).end("h1{color:#333}");
      if (path === "/hero.png") {
        const delay = req.url.includes("slow") ? 800 : 0;
        return setTimeout(() => res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }).end(png), delay);
      }
      res.writeHead(404).end();
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
  dir = mkdtempSync(join(tmpdir(), "webperf-mcp-baseline-"));
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

// A client joined in memory, and a real Chromium on the local page
let client;

beforeEach(async () => {
  slowProduct = false;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return result.structuredContent;
}
const runSnippet = (args) => call("run_snippet", { waitMs: WAIT_MS, ...args });

// The CLI on the same page: its --json, as a file for the server to read
async function cli(...args) {
  const { stdout } = await execute("node", [BIN, ...args, "--wait", String(WAIT_MS), "--json"], { env: cliEnv() }).catch((err) => err);
  return stdout;
}

describe("a baseline on the tools that measure", () => {
  it("is an earlier run: a page that got slower regresses, and the same page does not", async () => {
    const before = await runSnippet({ url: `${base}/product`, snippet: "LCP" });
    // A small result comes whole and still has the id of its run: it is what a later run compares with
    expect(before.detail).toBe("full");
    expect(before.runId).toEqual(expect.any(String));
    expect(before.baseline).toBeUndefined();

    // The first Chromium of a machine can take 130 ms more for the same page, over the default of 100 ms
    // with one run a side, so the page that does not change has a threshold above that noise
    const same = await runSnippet({ url: `${base}/product`, snippet: "LCP", baseline: before.runId, thresholds: ["LCP=500ms"] });
    expect(same.baseline).toMatchObject({ runId: before.runId, url: `${base}/product`, runs: { count: 1 }, errors: { new: [], fixed: [] }, regressions: [] });
    expect(same.baseline.metrics.LCP.verdict).toBe("unchanged");

    slowProduct = true;
    const after = await runSnippet({ url: `${base}/product`, snippet: "LCP", baseline: before.runId });
    expect(after.baseline.metrics.LCP).toMatchObject({ baseline: before.result.value, verdict: "regressed" });
    expect(after.baseline.metrics.LCP.delta).toBeGreaterThan(500);
    expect(after.baseline.regressions).toEqual([expect.stringMatching(/^LCP ▲ \+\d+ms/)]);
    expect(after.baseline.warnings).toEqual(["the baseline has 1 run, so only the thresholds apply; measure both with 5 runs or more"]);
  }, 120000);

  it("takes the thresholds of --threshold", async () => {
    const before = await runSnippet({ url: `${base}/product`, snippet: "LCP" });
    slowProduct = true;
    const after = await runSnippet({ url: `${base}/product`, snippet: "LCP", baseline: before.runId, thresholds: ["LCP=5000ms"] });
    expect(after.baseline.metrics.LCP).toMatchObject({ threshold: 5000, verdict: "unchanged" });
  }, 120000);

  it("compares run_workflow with its earlier run, and warns when the other run measured something else", async () => {
    const before = await call("run_workflow", { url: `${base}/product`, workflow: "core-web-vitals", waitMs: WAIT_MS });
    expect(before.runId).toEqual(expect.any(String));
    slowProduct = true;
    const after = await call("run_workflow", { url: `${base}/product`, workflow: "core-web-vitals", waitMs: WAIT_MS, baseline: before.runId });
    expect(after.baseline.metrics.LCP.verdict).toBe("regressed");
    const snippet = await runSnippet({ url: `${base}/product`, snippet: "CLS", baseline: before.runId });
    expect(snippet.baseline.warnings).toContain("the baseline was measured with workflow core-web-vitals, and this run with snippet CoreWebVitals/CLS");
  }, 120000);

  it("is a file of the CLI, with the verdict --baseline gives for it, and pairs an error across both names of a snippet", async () => {
    const file = join(dir, "styled.json");
    const output = await cli(`${base}/styled`, "--snippet", "render-blocking");
    writeFileSync(file, output);
    // The CLI names its result render-blocking, the alias it was given, and the error is there to pair
    expect(JSON.parse(output).results[0]).toMatchObject({ id: "render-blocking", issues: expect.arrayContaining([expect.objectContaining({ severity: "error" })]) });

    const { baseline: cliComparison } = JSON.parse(await cli(`${base}/styled`, "--snippet", "render-blocking", "--baseline", file));
    const { baseline } = await runSnippet({ url: `${base}/styled`, snippet: "render-blocking", baseline: file });
    expect(baseline).toMatchObject({ file, url: `${base}/styled`, errors: cliComparison.errors, regressions: [] });
    expect(baseline.errors).toEqual({ new: [], fixed: [] });
    expect(baseline.warnings).toEqual(cliComparison.warnings);
  }, 120000);

  it("gives the same verdict as --baseline for a page that got slower", async () => {
    const file = join(dir, "product.json");
    writeFileSync(file, await cli(`${base}/product`, "--snippet", "LCP"));

    slowProduct = true;
    const { baseline: cliComparison } = JSON.parse(await cli(`${base}/product`, "--snippet", "LCP", "--baseline", file));
    const { baseline } = await runSnippet({ url: `${base}/product`, snippet: "LCP", baseline: file });
    expect(cliComparison.metrics.LCP.verdict).toBe("regressed");
    expect(baseline.metrics.LCP.verdict).toBe("regressed");
    expect(baseline.metrics.LCP.baseline).toBe(cliComparison.metrics.LCP.baseline);
    expect(baseline.warnings).toEqual(cliComparison.warnings);
  }, 120000);

  it("lists the runs of the connection as resources, in the shape of the JSON of the CLI", async () => {
    const first = await runSnippet({ url: `${base}/product`, snippet: "LCP" });
    const listed = (await client.listResources()).resources.filter((r) => r.uri.startsWith("webperf://runs/"));
    expect(listed).toEqual([expect.objectContaining({ uri: `webperf://runs/${first.runId}`, name: `CoreWebVitals/LCP on ${base}/product (mobile)`, mimeType: "application/json" })]);
    // The time, not the long description of the template, repeated for each of the 20 runs
    expect(listed[0].description).toMatch(/^Measured at \d{4}-\d{2}-\d{2}T/);
    expect(listed[0].description.length).toBeLessThan(100);

    const [{ text, mimeType }] = (await client.readResource({ uri: listed[0].uri })).contents;
    expect(mimeType).toBe("application/json");
    const run = JSON.parse(text);
    expect(run).toMatchObject({ url: `${base}/product`, conditions: { viewport: "mobile", snippet: "CoreWebVitals/LCP", waitMs: WAIT_MS, machine: { cpu: expect.any(String) } } });
    expect(run.results[0]).toMatchObject({ id: "CoreWebVitals/LCP", metric: "LCP", value: first.result.value });

    // Saved to a file it is a baseline of the CLI too
    const file = join(dir, "from-mcp.json");
    writeFileSync(file, text);
    const { baseline } = JSON.parse(await cli(`${base}/product`, "--snippet", "LCP", "--baseline", file, "--threshold", "LCP=500ms"));
    expect(baseline.metrics.LCP.verdict).toBe("unchanged");
    expect(baseline.errors).toEqual({ new: [], fixed: [] });
  }, 120000);

  it("lets a client know the list of runs changed", async () => {
    const changed = new Promise((resolve) => client.setNotificationHandler("notifications/resources/list_changed", resolve));
    await runSnippet({ url: `${base}/product`, snippet: "LCP" });
    await changed;
  }, 60000);
});
