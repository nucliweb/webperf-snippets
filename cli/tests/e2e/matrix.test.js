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
  run("node", [BIN, "--wait", "200", ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr })
  );

describe("--matrix", () => {
  it("measures every combination in order, each with the conditions of its device and variant and the flags of the command line", async () => {
    const { code, stdout, stderr } = await cli("--matrix", writeMatrix(clientCase()), "--json", "--header", "X-Access: token");
    expect(code).toBe(0);
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
    const { code, stdout, stderr } = await cli("--matrix", writeMatrix(matrix), "--json");
    expect(code).toBe(0);
    expect(documents).toHaveLength(2);
    expect(JSON.parse(stdout).combinations[0].runs.count).toBe(2);
    expect(stderr).toContain("[2/2] home · desktop · default · run 2/2");
  }, 60000);

  it("prints a table with the median of each combination in the human report", async () => {
    const { code, stdout } = await cli("--matrix", writeMatrix(clientCase()));
    expect(code).toBe(0);
    expect(stdout).toContain("matrix.json (8 combinations, 1 run each, median by LCP)");
    expect(stdout).toMatch(/Page\s+Device\s+Variant\s+LCP\s+CLS/);
    expect(stdout).toMatch(/article\s+wide\s+consent\s+\S+ \d+ms/);
  }, 120000);

  it("compares the budgets with the median of each combination, and names the combination", async () => {
    const { code, stderr } = await cli("--matrix", writeMatrix(clientCase()), "--budget-lcp", "250");
    expect(code).toBe(1);
    // The phone loads the document with 300 ms of latency, so its LCP is over the budget
    expect(stderr).toMatch(/Budget violation: LCP \d+ms exceeds budget 250ms \(home · phone · anon\)/);
  }, 120000);

  it("warns about a header of the file that looks like a secret", async () => {
    const matrix = { urls: { home: `${baseUrl}/home` }, devices: ["desktop"], variants: { preview: { headers: { "X-Api-Token": "abc" } } } };
    const { code, stderr } = await cli("--matrix", writeMatrix(matrix), "--json");
    expect(code).toBe(0);
    expect(stderr).toContain("Warning: variants.preview.headers.X-Api-Token looks like a secret");
  }, 60000);

  it("fails with exit code 2 before any page load on an invalid matrix or an option that does not apply", async () => {
    const invalid = await cli("--matrix", writeMatrix({ urls: { home: `${baseUrl}/home` }, devices: { m: { viewport: "watch" } } }, "invalid.json"));
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain('Invalid matrix: devices.m.viewport "watch" is not a preset');

    const missing = await cli("--matrix", join(dir, "missing.json"));
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("Matrix file not found");

    const both = await cli(`${baseUrl}/home`, "--matrix", writeMatrix(clientCase()));
    expect(both.code).toBe(2);
    expect(both.stderr).toContain("Use a URL or --matrix, not both");

    const viewport = await cli("--matrix", writeMatrix(clientCase()), "--viewport", "desktop");
    expect(viewport.code).toBe(2);
    expect(viewport.stderr).toContain("--viewport does not apply to --matrix: set the viewport of each device in the file");

    expect(documents).toHaveLength(0);
  }, 60000);
});
