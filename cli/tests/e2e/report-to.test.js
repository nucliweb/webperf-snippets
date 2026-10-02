import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const CLI_VERSION = JSON.parse(readFileSync(join(HERE, "../../package.json"), "utf8")).version;

let pageServer;
let pageUrl;
let reportServer;
let reportUrl;
let received;
let reportBehavior;

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

beforeAll(async () => {
  pageServer = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(join(HERE, "../fixtures/index.html")));
  });
  pageUrl = `http://127.0.0.1:${pageServer.address().port}`;

  reportServer = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
      reportBehavior(res);
    });
  });
  reportUrl = `http://127.0.0.1:${reportServer.address().port}/api/report`;
}, 10000);

afterAll(async () => {
  pageServer.closeAllConnections();
  reportServer.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => pageServer.close(resolve)),
    new Promise((resolve) => reportServer.close(resolve)),
  ]);
});

beforeEach(() => {
  received = [];
  reportBehavior = (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  };
});

function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      "node",
      [BIN, pageUrl, "--snippet", "LCP", "--json", "--wait", "0", ...args],
      { env: cliEnv(env) },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });
}

describe("--report-to", () => {
  it("makes no request when the flag is absent", async () => {
    const { code } = await cli([]);
    expect(code).toBe(0);
    expect(received).toHaveLength(0);
  }, 30000);

  it("POSTs the results after the snippets complete", async () => {
    const { code } = await cli(["--report-to", reportUrl, "--viewport", "desktop", "--wait", "10"]);
    expect(code).toBe(0);
    expect(received).toHaveLength(1);
    const { method, headers, body } = received[0];
    expect(method).toBe("POST");
    expect(headers["content-type"]).toContain("application/json");
    expect(body.url).toBe(pageUrl);
    expect(body.snippet).toBe("LCP");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(typeof body.navMs).toBe("number");
    expect(body.results[0].id).toBe("LCP");
    expect(body.meta).toEqual({ viewport: "desktop", waitMs: 10, cli_version: CLI_VERSION });
  }, 30000);

  it("sends --api-key as a Bearer token", async () => {
    await cli(["--report-to", reportUrl, "--api-key", "key-from-flag"]);
    expect(received[0].headers.authorization).toBe("Bearer key-from-flag");
  }, 30000);

  it("reads the key from PERF_REVIEWS_API_KEY when the flag is absent", async () => {
    await cli(["--report-to", reportUrl], { PERF_REVIEWS_API_KEY: "key-from-env" });
    expect(received[0].headers.authorization).toBe("Bearer key-from-env");
  }, 30000);

  it("warns without changing the exit code when the endpoint answers with an error", async () => {
    reportBehavior = (res) => {
      res.writeHead(500);
      res.end("boom");
    };
    const { code, stderr } = await cli(["--report-to", reportUrl, "--api-key", "secret-key"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Warning: could not report results");
    expect(stderr).not.toContain("secret-key");
  }, 30000);

  it("warns without changing the exit code when the endpoint is unreachable", async () => {
    const { code, stderr } = await cli(["--report-to", "http://127.0.0.1:1/report", "--api-key", "secret-key"]);
    expect(code).toBe(0);
    expect(stderr).toContain("Warning: could not report results");
    expect(stderr).not.toContain("secret-key");
  }, 30000);

  it("gives up on a slow endpoint instead of holding the process", async () => {
    reportBehavior = () => {};
    const started = Date.now();
    const { code, stderr } = await cli(["--report-to", reportUrl]);
    expect(code).toBe(0);
    expect(stderr).toContain("Warning: could not report results");
    expect(Date.now() - started).toBeLessThan(15000);
  }, 30000);

  it("warns about regressions without changing the exit code", async () => {
    reportBehavior = (res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, regressions: ["LCP got slower"] }));
    };
    const { code, stderr } = await cli(["--report-to", reportUrl]);
    expect(code).toBe(0);
    expect(stderr).toContain("Regressions detected");
    expect(stderr).toContain("LCP got slower");
  }, 30000);

  it("keeps the budget exit code when the report succeeds", async () => {
    const { code } = await cli(["--report-to", reportUrl, "--budget-lcp", "0"]);
    expect(code).toBe(1);
    expect(received).toHaveLength(1);
  }, 30000);

  it("rejects a non-https URL that is not localhost with exit code 2", async () => {
    const { code, stderr } = await cli(["--report-to", "http://example.com/report"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--report-to must be an https URL");
  }, 30000);
});
