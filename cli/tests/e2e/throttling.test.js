import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSnippets } from "../../src/runner.js";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const run = promisify(execFile);

let server;
let pageUrl;
let secrets = [];

// The time the document finished downloading, and the time a fixed piece of work takes on the main thread.
// The work takes some 20 ms unthrottled: with a few milliseconds, as with 3e6 iterations, the JIT and
// the slices in which Chrome throttles the CPU made the ratio go from 0.85 to 3.7 for a factor of 4.
const READ_PAGE = `(() => {
  const start = performance.now();
  let x = 0;
  for (let i = 0; i < 3e7; i++) x += Math.sqrt(i);
  return {
    status: "ok",
    responseEnd: performance.getEntriesByType("navigation")[0].responseEnd,
    workMs: performance.now() - start,
    x,
  };
})()`;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      secrets.push(req.headers["x-secret"] ?? null);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>Throttled</title><h1>A headline for the largest paint</h1>");
    });
    server.listen(0, "127.0.0.1", () => {
      pageUrl = `http://127.0.0.1:${server.address().port}/`;
      resolve();
    });
  });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const items = [{ id: "page", path: "inline", source: READ_PAGE }];
const measure = (options) => runSnippets({ url: pageUrl, items, waitMs: 0, ...options });

describe("throttling in the runner", () => {
  it("adds the latency of the network preset to each request", async () => {
    const plain = await measure();
    const slow = await measure({ network: "slow-4g" });
    // Slow 4G has a latency of 562.5 ms, the same as the preset of DevTools. Chrome delays the body
    // of the response, not its headers, so the latency shows in responseEnd and not in responseStart.
    expect(plain.results[0].responseEnd).toBeLessThan(500);
    expect(slow.results[0].responseEnd).toBeGreaterThanOrEqual(500);
  }, 30000);

  it("adds the latency of a network of its own", async () => {
    const custom = await measure({ network: { downloadKbps: 50000, uploadKbps: 10000, latencyMs: 600 } });
    expect(custom.results[0].responseEnd).toBeGreaterThanOrEqual(500);
    expect(custom.throttling).toEqual({ network: { downloadKbps: 50000, uploadKbps: 10000, latencyMs: 600 } });
  }, 30000);

  it("slows the main thread by the CPU factor", async () => {
    const plain = await measure();
    const slow = await measure({ cpu: 4 });
    expect(slow.results[0].workMs / plain.results[0].workMs).toBeGreaterThan(2);
  }, 30000);

  it("throttles a page that also receives request headers", async () => {
    secrets = [];
    const { results } = await measure({ network: "slow-4g", cpu: 4, headers: { "X-Secret": "s3cr3t" } });
    expect(secrets[0]).toBe("s3cr3t");
    expect(results[0].responseEnd).toBeGreaterThanOrEqual(500);
  }, 30000);

  it("returns the conditions it measured under, and none without throttling", async () => {
    expect((await measure({ cpu: 4, network: "fast-4g" })).throttling).toEqual({ cpu: 4, network: "fast-4g" });
    expect((await measure({ network: "3g" })).throttling).toEqual({ network: "3g" });
    expect((await measure()).throttling).toBeUndefined();
  }, 30000);
});

describe("--cpu and --network flags", () => {
  const cli = (...args) =>
    run("node", [BIN, pageUrl, "--snippet", "TTFB", "--wait", "0", ...args], { env: cliEnv() }).then(
      ({ stdout }) => ({ code: 0, stdout, stderr: "" }),
      (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr })
    );

  it("measures under the conditions given and says so in the JSON and the report", async () => {
    const json = await cli("--cpu", "4", "--network", "slow-4g", "--json");
    expect(JSON.parse(json.stdout).throttling).toEqual({ cpu: 4, network: "slow-4g" });

    const human = await cli("--cpu", "4", "--network", "slow-4g");
    expect(human.stdout).toContain("Throttling: CPU 4x, Slow 4G");
  }, 30000);

  it("fails with a clear error and exit code 2 for a CPU factor below 1 or not a number", async () => {
    for (const bad of ["0", "0.5", "fast"]) {
      const { code, stderr } = await cli("--cpu", bad);
      expect(code).toBe(2);
      expect(stderr).toContain(`Invalid CPU factor "${bad}"`);
    }
  }, 30000);

  it("fails with a clear error and exit code 2 for an unknown network preset", async () => {
    const { code, stderr } = await cli("--network", "5g");
    expect(code).toBe(2);
    expect(stderr).toContain('Unknown network preset: "5g". Choose from: fast-4g, slow-4g, 3g');
  }, 30000);
});
