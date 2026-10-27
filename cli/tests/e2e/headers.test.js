import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSnippets, runMeasurement } from "../../src/runner.js";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const run = promisify(execFile);

// 127.0.0.1 and localhost are two origins: the page and a third party
let first;
let third;
let pageUrl;
let requests;

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const record = (origin, req) => requests.push({ origin, path: req.url, method: req.method, secret: req.headers["x-secret"] ?? null, language: req.headers["accept-language"] });

const READ_FETCH = `(async () => {
  for (let i = 0; i < 50 && !window.fetched; i++) await new Promise((r) => setTimeout(r, 20));
  return { status: "ok", fetched: window.fetched ?? null };
})()`;

beforeAll(async () => {
  third = await listen((req, res) => {
    record("third", req);
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("ok");
  });
  const thirdUrl = `http://localhost:${third.address().port}`;
  first = await listen((req, res) => {
    record("first", req);
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      return res.end("window.app = true;");
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!doctype html><title>Review app</title><script src="/app.js"></script>` +
        `<img src="${thirdUrl}/pixel.gif" alt="">` +
        `<script>fetch("${thirdUrl}/api").then((r) => r.text()).then((t) => (window.fetched = t), () => (window.fetched = "failed"))</script>`
    );
  });
  pageUrl = `http://127.0.0.1:${first.address().port}/`;
}, 10000);

afterAll(async () => {
  await new Promise((resolve) => first.close(resolve));
  await new Promise((resolve) => third.close(resolve));
});

beforeEach(() => {
  requests = [];
});

const items = [{ id: "fetch", path: "inline", source: READ_FETCH }];
const fromPage = () => requests.filter((r) => r.origin === "first");
const toThirdParty = () => requests.filter((r) => r.origin === "third");

describe("headers in the runner", () => {
  it("runSnippets sends the headers with every request to the origin of the page", async () => {
    await runSnippets({ url: pageUrl, items, waitMs: 0, headers: { "X-Secret": "s3cr3t" } });
    expect(fromPage().map((r) => r.path)).toEqual(expect.arrayContaining(["/", "/app.js"]));
    expect(fromPage().every((r) => r.secret === "s3cr3t")).toBe(true);
  }, 30000);

  it("runSnippets never sends the headers to another origin", async () => {
    const { results } = await runSnippets({ url: pageUrl, items, waitMs: 0, headers: { "X-Secret": "s3cr3t" } });
    expect(toThirdParty().length).toBeGreaterThan(0);
    expect(toThirdParty().every((r) => r.secret === null)).toBe(true);
    // A header added to a cross-origin fetch would need a preflight, and this server answers none
    expect(toThirdParty().some((r) => r.method === "OPTIONS")).toBe(false);
    expect(results[0].fetched).toBe("ok");
  }, 30000);

  it("runSnippets replaces a header the browser sends, whatever its case", async () => {
    await runSnippets({ url: pageUrl, items, waitMs: 0, headers: { "accept-language": "ca" } });
    expect(fromPage()[0].language).toBe("ca");
    expect(toThirdParty().every((r) => r.language !== "ca")).toBe(true);
  }, 30000);

  it("runSnippets without headers sends none", async () => {
    await runSnippets({ url: pageUrl, items, waitMs: 0 });
    expect(requests.every((r) => r.secret === null)).toBe(true);
  }, 30000);

  it("runMeasurement sends the headers with the navigation", async () => {
    const workflow = { steps: [{ id: "LCP", path: "CoreWebVitals/LCP" }] };
    await runMeasurement({ url: pageUrl, workflow, waitMs: 0, headers: { "X-Secret": "s3cr3t" } });
    expect(fromPage()[0]).toMatchObject({ path: "/", secret: "s3cr3t" });
  }, 30000);
});

describe("--header flag", () => {
  const cli = (...args) =>
    run("node", [BIN, pageUrl, "--snippet", "TTFB", "--json", "--wait", "0", ...args], { env: cliEnv() }).then(
      ({ stdout }) => ({ code: 0, stdout, stderr: "" }),
      (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr })
    );

  it("sends each header given, to the origin of the page only", async () => {
    const { code } = await cli("--header", "X-Secret: s3cr3t", "--header", "X-Other:  two words ");
    expect(code).toBe(0);
    expect(fromPage()[0]).toMatchObject({ path: "/", secret: "s3cr3t" });
    expect(toThirdParty().every((r) => r.secret === null)).toBe(true);
  }, 30000);

  it("fails with a clear error and exit code 2 when a header has no name or no colon, without repeating it", async () => {
    for (const bad of ["X-Secret", ": s3cr3t", "Bad Name: s3cr3t"]) {
      const { code, stderr } = await cli("--header", bad);
      expect(code).toBe(2);
      expect(stderr).toContain(`Invalid --header (number 1): use --header "Name: value"`);
      expect(stderr).not.toContain(bad);
    }
    expect(requests).toHaveLength(0);
  }, 30000);

  it("says which header is invalid when there are several", async () => {
    const { code, stderr } = await cli("--header", "X-Access: one", "--header", "X-Token two");
    expect(code).toBe(2);
    expect(stderr).toContain("Invalid --header (number 2)");
  }, 30000);
});
