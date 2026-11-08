import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startClickHandlerServer } from "../helpers/click-handler-page.js";

// interactions of run_snippet and run_workflow, through `webperf-snippets mcp` started as a client starts
// it: the measurement of INP in one call, with the runs, the throttling and the baseline of a page load,
// where open_page, interact and read_results take four calls and allow neither.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));

// The handler of the baseline takes 40 ms and the slower one 300 ms: far beyond the 50 ms threshold of
// INP, so the verdict does not depend on the noise of the machine
const FAST_MS = 40;
const SLOW_MS = 300;
const CLICK = [{ action: "click", selector: "#buy" }, { action: "wait", ms: 300 }];
// Five runs a side give the statistical verdict; a short wait keeps each run quick, as the page has
// nothing to load after the load event
const MEASURE = { workflow: "interaction", interactions: CLICK, runs: 5, cpu: 4, waitMs: 500 };

let client;
let pages;
// The first run_workflow on the page of the baseline, which the comparisons use
let baseline;

beforeAll(async () => {
  pages = await startClickHandlerServer();
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"] }));
}, 30000);

afterAll(async () => {
  await client?.close();
  await pages?.close();
});

const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 240000 });
const buy = (ms) => `${pages.base}/buy?ms=${ms}`;
const byId = (results, id) => results.find((r) => r.id === id);

describe("interactions on run_workflow", () => {
  it("measures INP and the long animation frames of a click over five throttled runs", async () => {
    const result = await call("run_workflow", { url: buy(FAST_MS), ...MEASURE, detail: "full" });
    expect(result.isError, result.content[0].text).toBeFalsy();
    const { results, runs, throttling, runId, nextSteps } = result.structuredContent;
    expect(throttling).toEqual({ cpu: 4 });
    expect(byId(results, "INP")).toMatchObject({ status: "ok", metric: "INP", value: expect.any(Number) });
    expect(byId(results, "INP").value).toBeGreaterThanOrEqual(FAST_MS);
    expect(byId(results, "long-frames")).toMatchObject({ script: "Long-Animation-Frames", status: expect.stringMatching(/^(ok|error)$/) });
    // The steps that need a click ran, so nothing is skipped and nothing is left to do with open_page
    expect(results.filter((r) => r.status === "skipped")).toEqual([]);
    expect(nextSteps ?? []).toEqual([]);
    expect(runs).toMatchObject({ count: 5, failed: 0 });
    expect(runs.summary.INP.values).toHaveLength(5);
    baseline = runId;
  }, 240000);

  it("finds the regression of INP on a page with a slower click handler, against that run", async () => {
    const result = await call("run_workflow", { url: buy(SLOW_MS), ...MEASURE, baseline });
    expect(result.isError, result.content[0].text).toBeFalsy();
    const comparison = result.structuredContent.baseline;
    expect(comparison.runId).toBe(baseline);
    expect(comparison.metrics.INP).toMatchObject({ verdict: "regressed", stats: { p: expect.any(Number) } });
    expect(comparison.metrics.INP.stats.p).toBeLessThan(0.05);
    expect(comparison.regressions.some((line) => /^INP/.test(line))).toBe(true);
  }, 240000);

  it("finds no regression on the same page measured again", async () => {
    const result = await call("run_workflow", { url: buy(FAST_MS), ...MEASURE, baseline });
    expect(result.isError, result.content[0].text).toBeFalsy();
    const comparison = result.structuredContent.baseline;
    expect(comparison.metrics.INP.verdict).not.toBe("regressed");
    expect(comparison.regressions).toEqual([]);
  }, 240000);

  it("skips the steps that need a click without interactions, and offers interactions before open_page", async () => {
    const result = await call("run_workflow", { url: buy(FAST_MS), workflow: "interaction", waitMs: 500 });
    const { results, nextSteps } = result.structuredContent;
    const skipped = results.filter((r) => r.status === "skipped");
    expect(skipped.map((r) => r.id)).toEqual(["INP", "interactions", "input-latency"]);
    for (const r of skipped) expect(r.reason).toMatch(/interactions.*open_page/);
    expect(nextSteps.map((s) => s.tool)).toEqual(["run_workflow", "open_page"]);
    expect(nextSteps[0].args).toMatchObject({ workflow: "interaction", interactions: [{ action: "click" }] });
  }, 120000);
});

describe("interactions on run_snippet", () => {
  it("measures INP in one call", async () => {
    const result = await call("run_snippet", { url: buy(SLOW_MS), snippet: "INP", interactions: CLICK, waitMs: 500 });
    expect(result.isError, result.content[0].text).toBeFalsy();
    expect(result.structuredContent.result).toMatchObject({ script: "INP", status: "ok", value: expect.any(Number) });
    expect(result.structuredContent.result.value).toBeGreaterThanOrEqual(SLOW_MS);
  }, 120000);

  it("refuses INP without interactions, with both ways to measure it", async () => {
    const result = await call("run_snippet", { url: buy(SLOW_MS), snippet: "INP" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/interactions/);
    expect(result.content[0].text).toMatch(/open_page/);
  }, 30000);
});
