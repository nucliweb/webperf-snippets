import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");

// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = "500";

// One value per secret the CLI is given. The test passes them through every output of the CLI and
// fails if one comes out: in stdout, in stderr, or in the body sent to --report-to. A new output
// format, or a new error that names a flag with a secret, belongs in the list of runs below.
const SECRETS = {
  header: "wps-sentinel-header-7f3a1c",
  cookie: "wps-sentinel-cookie-9c1e4b",
  localStorage: "wps-sentinel-storage-2d8f6a",
  apiKey: "wps-sentinel-api-key-5b0e93",
  cruxKey: "wps-sentinel-crux-key-e47c21",
};

let page;
let report;
let crux;
let dir;
let storageState;
let pageUrl;
let reportUrl;
let cruxEndpoint;
// What each server received, to check that the secrets were used and not only kept out
const received = { headers: [], cookies: [], reports: [], cruxQueries: [] };

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const close = (server) => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
};

beforeAll(async () => {
  page = await listen((req, res) => {
    received.headers.push(req.headers["x-secret"] ?? null);
    received.cookies.push(req.headers.cookie ?? "");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><title>Signed in</title><h1>A page behind an access proxy</h1><script>window.token = localStorage.getItem("token")</script>`);
  });
  pageUrl = `http://127.0.0.1:${page.address().port}/`;

  report = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.reports.push({ authorization: req.headers.authorization, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  reportUrl = `http://127.0.0.1:${report.address().port}/api/report`;

  // An API error, so the CLI reports why CrUX failed
  crux = await listen((req, res) => {
    received.cruxQueries.push(req.url);
    res.writeHead(500);
    res.end();
  });
  cruxEndpoint = `http://127.0.0.1:${crux.address().port}/v1/records:queryRecord`;

  dir = mkdtempSync(join(tmpdir(), "secrets-e2e-"));
  storageState = join(dir, "auth.json");
  writeFileSync(
    storageState,
    JSON.stringify({
      cookies: [{ name: "session", value: SECRETS.cookie, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [{ origin: pageUrl.slice(0, -1), localStorage: [{ name: "token", value: SECRETS.localStorage }] }],
    })
  );
}, 10000);

afterAll(() => Promise.all([page, report, crux].filter(Boolean).map(close)));

const withSecrets = () => [
  "--header", `X-Secret: ${SECRETS.header}`,
  "--storage-state", storageState,
  "--report-to", reportUrl,
  "--api-key", SECRETS.apiKey,
  "--crux-key", SECRETS.cruxKey,
];

const cli = (args) =>
  new Promise((resolve) => {
    execFile("node", [BIN, "--wait", WAIT_MS, ...args], { env: cliEnv({ WEBPERF_CRUX_ENDPOINT: cruxEndpoint }) }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });

// Each secret that appears in `text`, by name
const leaked = (text) => Object.entries(SECRETS).filter(([, value]) => text.includes(value)).map(([name]) => name);

function expectNoSecrets({ stdout, stderr }) {
  expect(leaked(stdout), `stdout:\n${stdout.slice(0, 3000)}`).toEqual([]);
  expect(leaked(stderr), `stderr:\n${stderr}`).toEqual([]);
}

describe("the secrets given to the CLI", () => {
  let baseline;
  let matrix;
  let matrixBaseline;

  beforeAll(async () => {
    const json = await cli([pageUrl, "--snippet", "LCP", "--json", ...withSecrets()]);
    baseline = join(dir, "baseline.json");
    writeFileSync(baseline, json.stdout);

    matrix = join(dir, "matrix.json");
    writeFileSync(
      matrix,
      JSON.stringify({ urls: { home: pageUrl }, devices: { phone: { viewport: "mobile" } }, variants: { signedIn: { storageState: "auth.json" } }, runs: 1 })
    );
    const matrixJson = await cli(["--matrix", matrix, "--snippet", "LCP", "--json", ...withSecrets()]);
    matrixBaseline = join(dir, "matrix-baseline.json");
    writeFileSync(matrixBaseline, matrixJson.stdout);
  }, 60000);

  const RUNS = {
    "the JSON report": () => [pageUrl, "--snippet", "LCP", "--json"],
    "the human report": () => [pageUrl, "--snippet", "LCP"],
    "the markdown report": () => [pageUrl, "--snippet", "LCP", "--markdown"],
    "a comparison with --baseline, as JSON": () => [pageUrl, "--snippet", "LCP", "--json", "--baseline", baseline],
    "a comparison with --baseline, for a human": () => [pageUrl, "--snippet", "LCP", "--baseline", baseline],
    "the JSON of a matrix": () => ["--matrix", matrix, "--snippet", "LCP", "--json"],
    "the human table of a matrix": () => ["--matrix", matrix, "--snippet", "LCP"],
    "the markdown table of a matrix": () => ["--matrix", matrix, "--snippet", "LCP", "--markdown"],
    "a matrix compared with --baseline": () => ["--matrix", matrix, "--snippet", "LCP", "--baseline", matrixBaseline],
  };

  for (const [output, args] of Object.entries(RUNS)) {
    it(`stay out of ${output}, and of the body sent to --report-to`, async () => {
      received.reports = [];
      const result = await cli([...args(), ...withSecrets()]);
      expectNoSecrets(result);
      expect(received.reports.length, `stderr:\n${result.stderr}`).toBeGreaterThan(0);
      for (const { body } of received.reports) expect(leaked(body)).toEqual([]);
    }, 60000);
  }

  it("reach the servers they are meant for, so the runs above used them", () => {
    expect(received.headers).toContain(SECRETS.header);
    expect(received.cookies.some((cookie) => cookie.includes(SECRETS.cookie))).toBe(true);
    expect(received.reports.every(({ authorization }) => authorization === `Bearer ${SECRETS.apiKey}`)).toBe(true);
    expect(received.cruxQueries.some((query) => query.includes(SECRETS.cruxKey))).toBe(true);
  });
});

describe("an error about a flag with a secret", () => {
  const ERRORS = {
    "a header without a colon": ["--header", `Authorization Bearer ${SECRETS.header}`],
    "a header with an invalid name": ["--header", `Bad Name: ${SECRETS.header}`],
    "a header with an invalid name and the value first": ["--header", `${SECRETS.header} token: value`],
  };

  for (const [problem, args] of Object.entries(ERRORS)) {
    it(`names the problem without the secret: ${problem}`, async () => {
      const result = await cli([pageUrl, "--snippet", "LCP", ...args]);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/--header/);
      expectNoSecrets(result);
    });
  }

  it("does not repeat a storage state that is not valid JSON", async () => {
    const broken = join(dir, "broken.json");
    writeFileSync(broken, `{"cookies":[{"name":"session","value":"${SECRETS.cookie}"`);
    const result = await cli([pageUrl, "--snippet", "LCP", "--storage-state", broken]);
    expect(result.code).not.toBe(0);
    expectNoSecrets(result);
  }, 30000);
});
