import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const run = promisify(execFile);

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync(join(HERE, "../fixtures/index.html")));
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function runCli(alias) {
  try {
    const { stdout } = await run("node", [BIN, baseUrl, "--snippet", alias, "--json", "--wait", "500"], { env: cliEnv() });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

describe("a CLI run in a shell that has the service keys set", () => {
  it("makes no call to CrUX or to a report endpoint", async () => {
    const requests = [];
    const external = createServer((req, res) => {
      requests.push(req.url);
      req.resume();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    await new Promise((resolve) => external.listen(0, "127.0.0.1", resolve));
    const saved = { ...process.env };
    process.env.CRUX_API_KEY = "key-from-the-shell";
    process.env.PERF_REVIEWS_API_KEY = "key-from-the-shell";
    process.env.WEBPERF_CRUX_ENDPOINT = `http://127.0.0.1:${external.address().port}/crux`;
    try {
      await runCli("LCP");
    } finally {
      process.env = saved;
      external.closeAllConnections();
      await new Promise((resolve) => external.close(resolve));
    }
    expect(requests).toEqual([]);
  }, 30000);
});

describe("--snippet aliases", () => {
  it.each(["LCP", "CLS", "INP"])("%s resolves to a snippet", async (alias) => {
    const { stdout, stderr } = await runCli(alias);
    expect(stderr).not.toContain("Snippet not found");
    const payload = JSON.parse(stdout);
    expect(payload.results[0].id).toBe(alias);
    expect(payload.results[0].script).toBe(alias);
  }, 30000);
});

describe("--snippet by snippet name", () => {
  it("runs a snippet that has no alias by its bare name, in any case", async () => {
    const { code, stdout } = await runCli("compression-audit");
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.results[0].id).toBe("compression-audit");
    expect(payload.results[0].script).toBe("Compression-Audit");
  }, 30000);

  it("runs a snippet from another category by its Category/Name path", async () => {
    const { stdout } = await runCli("Interaction/DOM-Size-and-Depth");
    expect(JSON.parse(stdout).results[0].script).toBe("DOM-Size-and-Depth");
  }, 30000);

  it("exits with code 2 and names the closest snippet when the name is unknown", async () => {
    const { code, stdout, stderr } = await runCli("Compresion-Audit");
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/Unknown snippet "Compresion-Audit"/);
    expect(stderr).toContain("Loading/Compression-Audit");
  }, 30000);

  it("does not read a file outside the snippets", async () => {
    const { code, stderr } = await runCli("../package");
    expect(code).toBe(2);
    expect(stderr).toMatch(/Unknown snippet/);
  }, 30000);
});
