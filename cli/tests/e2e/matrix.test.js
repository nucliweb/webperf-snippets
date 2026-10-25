import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
const run = promisify(execFile);

// The LCP entry needs a moment after load to be reported; with a short wait a loaded runner sometimes
// returns "No LCP entries buffered" and the CLI exits 1, as the other tests of the CLI note.
const WAIT_MS = "500";

// What the CLI printed, for the message of a failed exit code: without it a failure in CI only says
// which code came out, not why.
const said = (stdout = "", stderr = "") => `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}`;

// Two pages on one server. Each page sends its viewport width in a beacon, and the server records the
// consent cookie and the headers of every request, so the test sees the conditions of each combination.
let server;
let baseUrl;
let dir;
let documents;
let beacons;

const conditionsOf = (req) => ({
  path: req.url.split("?")[0],
  consent: /consent=all/.test(req.headers.cookie ?? ""),
  experiment: req.headers["x-experiment"] ?? null,
  access: req.headers["x-access"] ?? null,
});

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      if (req.url.startsWith("/beacon")) {
        beacons.push({ ...conditionsOf(req), width: Number(new URL(req.url, baseUrl).searchParams.get("w")) });
        res.writeHead(204);
        return res.end();
      }
      documents.push(conditionsOf(req));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><title>${req.url}</title><h1>The page ${req.url}, measured in a matrix</h1><script>fetch("/beacon?w=" + innerWidth)</script>`);
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  dir = mkdtempSync(join(tmpdir(), "matrix-e2e-"));
  mkdirSync(join(dir, "states"));
  writeFileSync(
    join(dir, "states", "consent.json"),
    JSON.stringify({
      cookies: [{ name: "consent", value: "all", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [],
    })
  );
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  documents = [];
  beacons = [];
});

const PHONE_NETWORK = { downloadKbps: 50000, uploadKbps: 10000, latencyMs: 300 };

function writeMatrix(matrix, name = "matrix.json") {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(matrix));
  return path;
}

const clientCase = () => ({
  urls: { home: `${baseUrl}/home`, article: `${baseUrl}/article` },
  devices: { phone: { viewport: "mobile", network: PHONE_NETWORK }, wide: { viewport: "desktop" } },
  variants: { anon: {}, consent: { storageState: "states/consent.json", headers: { "X-Experiment": "b" } } },
  runs: 1,
});

const cli = (...args) =>
  run("node", [BIN, "--wait", WAIT_MS, ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr, said: said(stdout, stderr) }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr, said: said(err.stdout, err.stderr) })
  );

describe("--matrix", () => {
  it("measures every combination in order, each with the conditions of its device and variant and the flags of the command line", async () => {
    const { code, stdout, stderr, said: output } = await cli("--matrix", writeMatrix(clientCase()), "--json", "--header", "X-Access: token");
    expect(code, output).toBe(0);
    const { combinations, runs } = JSON.parse(stdout);
    expect(runs).toBe(1);
    expect(combinations.map((c) => c.id)).toEqual([
      "home · phone · anon",
      "home · phone · consent",
      "home · wide · anon",
      "home · wide · consent",
      "article · phone · anon",
      "article · phone · consent",
      "article · wide · anon",
      "article · wide · consent",
    ]);

    expect(documents.map((d) => d.path)).toEqual(["/home", "/home", "/home", "/home", "/article", "/article", "/article", "/article"]);
    expect(documents.map((d) => d.consent)).toEqual([false, true, false, true, false, true, false, true]);
    expect(documents.map((d) => d.experiment)).toEqual([null, "b", null, "b", null, "b", null, "b"]);
    expect(documents.every((d) => d.access === "token")).toBe(true);
    expect(beacons.map((b) => b.width)).toEqual([375, 375, 1280, 1280, 375, 375, 1280, 1280]);

    const phone = combinations[0];
    expect(phone).toMatchObject({ name: "home", device: "phone", variant: "anon", url: `${baseUrl}/home`, throttling: { network: PHONE_NETWORK } });
    expect(phone.runs).toMatchObject({ count: 1, failed: 0, medianRun: 1, medianBy: "LCP" });
    expect(phone.runs.summary.LCP.median).toBeGreaterThanOrEqual(300);
    expect(combinations[2].throttling).toBeUndefined();

    expect(stderr).toContain("[1/8] home · phone · anon · run 1/1");
    expect(stderr).toContain("[8/8] article · wide · consent · run 1/1");
  }, 120000);

  it("repeats each combination the runs of the file, one run after the other", async () => {
    const matrix = { urls: { home: `${baseUrl}/home` }, devices: ["desktop"], runs: 2 };
    const { code, stdout, stderr, said: output } = await cli("--matrix", writeMatrix(matrix), "--json");
    expect(code, output).toBe(0);
    expect(documents).toHaveLength(2);
    expect(JSON.parse(stdout).combinations[0].runs.count).toBe(2);
    expect(stderr).toContain("[2/2] home · desktop · run 2/2");
  }, 60000);

  it("leaves out the Variant column and the variant when the file defines none", async () => {
    const matrix = { urls: { home: `${baseUrl}/home` }, devices: ["mobile", "desktop"] };
    const human = await cli("--matrix", writeMatrix(matrix));
    expect(human.stdout).toMatch(/Page\s+Device\s+LCP/);
    expect(human.stdout).not.toContain("Variant");
    const { combinations } = JSON.parse((await cli("--matrix", writeMatrix(matrix), "--json")).stdout);
    expect(combinations.map((c) => c.id)).toEqual(["home · mobile", "home · desktop"]);
    expect(combinations.every((c) => !("variant" in c))).toBe(true);
  }, 60000);

  it("prints a table with the median of each combination in the human report", async () => {
    const { code, stdout, said: output } = await cli("--matrix", writeMatrix(clientCase()));
    expect(code, output).toBe(0);
    expect(stdout).toContain("matrix.json (8 combinations, 1 run each, median by LCP)");
    expect(stdout).toMatch(/Page\s+Device\s+Variant\s+LCP\s+CLS/);
    expect(stdout).toMatch(/article\s+wide\s+consent\s+\S+ \d+ms/);
  }, 120000);

  it("compares the budgets with the median of each combination, and names the combination", async () => {
    const { code, stdout, stderr, said: output } = await cli("--matrix", writeMatrix(clientCase()), "--budget-lcp", "250");
    expect(code, output).toBe(1);
    // The phone loads the document with 300 ms of latency, so its LCP is over the budget
    expect(stderr).toMatch(/Budget violation: LCP \d+ms exceeds budget 250ms \(home · phone · anon\)/);
    // The report says it too, under the table
    expect(stdout).toMatch(/Budgets\n[\s\S]*home · phone · anon: LCP \d+ms exceeds budget 250ms/);
  }, 120000);

  it("warns about a header of the file that looks like a secret", async () => {
    const matrix = { urls: { home: `${baseUrl}/home` }, devices: ["desktop"], variants: { preview: { headers: { "X-Api-Token": "abc" } } } };
    const { code, stderr, said: output } = await cli("--matrix", writeMatrix(matrix), "--json");
    expect(code, output).toBe(0);
    expect(stderr).toContain("Warning: variants.preview.headers.X-Api-Token looks like a secret");
  }, 60000);

  it("fails with exit code 2 before any page load on an invalid matrix or an option that does not apply", async () => {
    const invalid = await cli("--matrix", writeMatrix({ urls: { home: `${baseUrl}/home` }, devices: { m: { viewport: "watch" } } }, "invalid.json"));
    expect(invalid.code, invalid.said).toBe(2);
    expect(invalid.stderr).toContain('Invalid matrix: devices.m.viewport "watch" is not a preset');

    const missing = await cli("--matrix", join(dir, "missing.json"));
    expect(missing.code, missing.said).toBe(2);
    expect(missing.stderr).toContain("Matrix file not found");

    const both = await cli(`${baseUrl}/home`, "--matrix", writeMatrix(clientCase()));
    expect(both.code, both.said).toBe(2);
    expect(both.stderr).toContain("Use a URL or --matrix, not both");

    const viewport = await cli("--matrix", writeMatrix(clientCase()), "--viewport", "desktop");
    expect(viewport.code, viewport.said).toBe(2);
    expect(viewport.stderr).toContain("--viewport does not apply to --matrix: set the viewport of each device in the file");

    expect(documents).toHaveLength(0);
  }, 60000);
});

describe("--matrix with the other reports", () => {
  let cruxServer;
  let cruxQueries;
  let reportServer;
  let reports;

  const listen = (handler) =>
    new Promise((resolve) => {
      const s = createServer(handler);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
  const readBody = (req) =>
    new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
    });

  beforeAll(async () => {
    cruxServer = await listen(async (req, res) => {
      cruxQueries.push(JSON.parse(await readBody(req)));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2100 } } } } }));
    });
    reportServer = await listen(async (req, res) => {
      reports.push(await readBody(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => cruxServer.close(resolve));
    await new Promise((resolve) => reportServer.close(resolve));
  });

  beforeEach(() => {
    cruxQueries = [];
    reports = [];
  });

  it("gives a markdown table and the report of each combination in a details block", async () => {
    const { code, stdout, said: output } = await cli("--matrix", writeMatrix(clientCase()), "--markdown");
    expect(code, output).toBe(0);
    expect(stdout).toContain("## WebPerf Results — matrix.json");
    expect(stdout).toContain("| Page | Device | Variant | LCP | CLS |");
    expect(stdout.match(/<details><summary>/g)).toHaveLength(8);
    expect(stdout).toContain("<details><summary>article · wide · consent</summary>");
  }, 120000);

  it("adds the report of each combination to the table with --verbose", async () => {
    const { code, stdout, said: output } = await cli("--matrix", writeMatrix(clientCase()), "--verbose");
    expect(code, output).toBe(0);
    expect(stdout).toContain(`home · phone · anon — ${baseUrl}/home`);
    expect(stdout.match(/Navigated in \d+ms/g)).toHaveLength(8);
  }, 120000);

  it("asks CrUX once for each URL and form factor, and gives the field data to every combination", async () => {
    const env = cliEnv({ CRUX_API_KEY: "key", WEBPERF_CRUX_ENDPOINT: `http://127.0.0.1:${cruxServer.address().port}/query` });
    const { stdout } = await run("node", [BIN, "--wait", WAIT_MS, "--matrix", writeMatrix(clientCase()), "--json"], { env });
    // 2 URLs on 2 form factors; the two variants of a device share the field data
    expect(cruxQueries.map((q) => `${q.url} ${q.formFactor}`).sort()).toEqual([
      `${baseUrl}/article DESKTOP`,
      `${baseUrl}/article PHONE`,
      `${baseUrl}/home DESKTOP`,
      `${baseUrl}/home PHONE`,
    ]);
    const { combinations } = JSON.parse(stdout);
    expect(combinations.every((c) => c.crux?.metrics?.LCP?.p75 === 2100)).toBe(true);
  }, 120000);

  it("reports each combination to --report-to, with its device, variant and runs, and never the value of a header", async () => {
    const reportUrl = `http://127.0.0.1:${reportServer.address().port}/api/report`;
    const { code, said: output } = await cli("--matrix", writeMatrix(clientCase()), "--json", "--report-to", reportUrl, "--header", "X-Access: s3cr3t-value");
    expect(code, output).toBe(0);
    expect(reports).toHaveLength(8);
    expect(reports.some((body) => body.includes("s3cr3t-value"))).toBe(false);
    const bodies = reports.map((body) => JSON.parse(body));
    expect(bodies[1]).toMatchObject({ url: `${baseUrl}/home`, meta: { viewport: "mobile", device: "phone", variant: "consent", runs: { count: 1 } } });
    expect(bodies[7]).toMatchObject({ url: `${baseUrl}/article`, meta: { viewport: "desktop", device: "wide", variant: "consent" } });
  }, 120000);
});
