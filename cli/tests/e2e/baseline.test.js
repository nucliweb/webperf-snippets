import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const run = promisify(execFile);

// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = "500";
const said = (stdout = "", stderr = "") => `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}`;

// /fast and /slow are the same product page; the image of /slow arrives 800 ms later, far beyond the
// default threshold of LCP, so the verdict does not depend on the noise of the machine. /styled adds
// a stylesheet that blocks rendering, an error of the render-blocking snippet.
const page = (img, head = "") =>
  `<!DOCTYPE html><html><head><title>Product</title>${head}</head><body><h1>Product</h1><img src="${img}" width="600" height="400" alt="Product photo"></body></html>`;
let server;
let base;
let dir;
// Every request the server gets: a run that fails before the browser makes none
let requests = 0;
// /product is fast until a test makes it slow: the same URL in the baseline and in the run
let slowProduct = false;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      requests++;
      const path = req.url.split("?")[0];
      if (path === "/fast" || path === "/news") return res.writeHead(200, { "Content-Type": "text/html" }).end(page("/hero.png"));
      if (path === "/product") return res.writeHead(200, { "Content-Type": "text/html" }).end(page(slowProduct ? "/hero.png?slow" : "/hero.png"));
      if (path === "/slow") return res.writeHead(200, { "Content-Type": "text/html" }).end(page("/hero.png?slow"));
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
  dir = mkdtempSync(join(tmpdir(), "webperf-baseline-"));
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const cli = (...args) =>
  run("node", [BIN, ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr, said: said(stdout, stderr) }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr, said: said(err.stdout, err.stderr) })
  );

// Measures a page with --json and keeps its output as a baseline file
async function saveBaseline(name, ...args) {
  const { code, stdout, said: output } = await cli(...args, "--wait", WAIT_MS, "--json");
  expect(code, output).toBe(0);
  const file = join(dir, name);
  writeFileSync(file, stdout);
  return file;
}

describe("--baseline with a page", () => {
  let fastBaseline;
  beforeAll(async () => {
    fastBaseline = await saveBaseline("fast.json", `${base}/fast`, "--runs", "3");
  }, 120000);

  it("reports a slower page as regressed, and keeps the exit code of today without --fail-on-regression", async () => {
    const { code, stdout, said: output } = await cli(`${base}/slow`, "--runs", "3", "--wait", WAIT_MS, "--baseline", fastBaseline, "--json");
    expect(code, output).toBe(0);
    const { baseline } = JSON.parse(stdout);
    expect(baseline).toMatchObject({ file: fastBaseline, url: `${base}/fast`, runs: { count: 3, medianBy: "LCP" } });
    expect(baseline.metrics.LCP.verdict).toBe("regressed");
    expect(baseline.metrics.LCP.delta).toBeGreaterThan(500);
    expect(baseline.warnings).toContain("the baseline measured /fast and this run /slow");
  }, 120000);

  it("exits with 1 for a regression with --fail-on-regression, and says what got worse", async () => {
    const { code, stderr, said: output } = await cli(`${base}/slow`, "--runs", "3", "--wait", WAIT_MS, "--baseline", fastBaseline, "--fail-on-regression");
    expect(code, output).toBe(1);
    expect(stderr).toMatch(/Regression against .*fast\.json: LCP ▲ \+\d+ms/);
  }, 120000);

  it("reports the same page as unchanged, and exits with 0 with --fail-on-regression", async () => {
    const { code, stdout, said: output } = await cli(`${base}/fast`, "--runs", "3", "--wait", WAIT_MS, "--baseline", fastBaseline, "--fail-on-regression", "--json");
    expect(code, output).toBe(0);
    const { baseline } = JSON.parse(stdout);
    expect(baseline.metrics.LCP.verdict).toBe("unchanged");
    expect(baseline.warnings).toEqual([]);
  }, 120000);

  it("adds the comparison to the human and markdown reports, with its warnings", async () => {
    const human = await cli(`${base}/slow`, "--runs", "3", "--wait", WAIT_MS, "--baseline", fastBaseline);
    expect(human.code, human.said).toBe(0);
    expect(human.stdout).toContain(`Compared with ${fastBaseline} (${base}/fast, 3 runs, median by LCP)`);
    expect(human.stdout).toMatch(/LCP\s+\S+\s+\S+\s+▲ \+\d+ms \(\+\d+%\)\s+regressed/);
    expect(human.stdout).toContain("Warning: the baseline measured /fast and this run /slow");
    expect(human.stderr).toContain("Warning: the baseline measured /fast and this run /slow");

    const markdown = await cli(`${base}/news`, "--snippet", "LCP", "--wait", WAIT_MS, "--baseline", fastBaseline, "--markdown");
    expect(markdown.code, markdown.said).toBe(0);
    expect(markdown.stdout).toContain("### Compared with `");
    expect(markdown.stdout).toContain("| Metric | Baseline | Now | Change | Verdict |");
    expect(markdown.stdout).toContain("> ⚠️ the baseline was measured with workflow core-web-vitals, and this run with snippet CoreWebVitals/LCP");
  }, 120000);

  it("lists an error that only this run has as new", async () => {
    const plain = await saveBaseline("plain.json", `${base}/fast`, "--snippet", "render-blocking");
    const { stdout, said: output } = await cli(`${base}/styled`, "--snippet", "render-blocking", "--wait", WAIT_MS, "--baseline", plain, "--json");
    const { baseline } = JSON.parse(stdout);
    expect(baseline.errors.new, output).toEqual([expect.objectContaining({ id: "render-blocking", message: expect.stringMatching(/render-blocking resource/) })]);
    expect(baseline.errors.fixed).toEqual([]);
  }, 120000);
});

describe("--baseline with a matrix", () => {
  // A matrix of pages on one device, written to the folder of the test
  const writeMatrix = (name, urls) => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify({ urls, devices: ["mobile"], runs: 2 }));
    return file;
  };
  let lastWeek;
  let today;

  beforeAll(async () => {
    slowProduct = false;
    const before = writeMatrix("before.json", { home: `${base}/fast`, product: `${base}/product`, legacy: `${base}/fast` });
    const { code, stdout, said: output } = await cli("--matrix", before, "--wait", WAIT_MS, "--json");
    expect(code, output).toBe(0);
    lastWeek = join(dir, "last-week.json");
    writeFileSync(lastWeek, stdout);
    // This week the product page is slower, a page is new and another one is gone
    today = writeMatrix("today.json", { home: `${base}/fast`, product: `${base}/product`, about: `${base}/fast` });
    slowProduct = true;
  }, 180000);

  afterAll(() => {
    slowProduct = false;
  });

  it("compares each combination with the one of the same id, and lists the ones only one side has", async () => {
    const { code, stdout, said: output } = await cli("--matrix", today, "--wait", WAIT_MS, "--baseline", lastWeek, "--json");
    expect(code, output).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.baseline).toEqual({ file: lastWeek, added: ["about · mobile"], missing: ["legacy · mobile"], warnings: [] });
    const byId = Object.fromEntries(report.combinations.map((c) => [c.id, c]));
    expect(byId["product · mobile"].baseline.metrics.LCP.verdict).toBe("regressed");
    expect(byId["home · mobile"].baseline.metrics.LCP.verdict).toBe("unchanged");
    expect(byId["about · mobile"]).not.toHaveProperty("baseline");
  }, 180000);

  it("exits with 1 when any combination regressed with --fail-on-regression, and names it", async () => {
    const { code, stderr, said: output } = await cli("--matrix", today, "--wait", WAIT_MS, "--baseline", lastWeek, "--fail-on-regression");
    expect(code, output).toBe(1);
    expect(stderr).toMatch(/Regression against .*last-week\.json in product · mobile: LCP ▲ \+\d+ms/);
    expect(stderr).not.toMatch(/in home · mobile/);
  }, 180000);

  it("adds a change column to the table, and the comparison below it, in the human and markdown reports", async () => {
    const human = await cli("--matrix", today, "--wait", WAIT_MS, "--baseline", lastWeek);
    expect(human.code, human.said).toBe(0);
    expect(human.stdout).toMatch(/product\s+mobile\s+\S+ \S+\s+▲ \+\d+ms/);
    expect(human.stdout).toMatch(/about\s+mobile\s+\S+ \S+\s+new/);
    expect(human.stdout).toContain(`Compared with ${lastWeek}`);
    expect(human.stdout).toContain("Added: about · mobile");
    expect(human.stdout).toContain("Missing: legacy · mobile");
    // Both matrices were measured the same way, with the same runs: nothing to warn about
    expect(human.stdout).not.toContain("Warning:");

    const markdown = await cli("--matrix", today, "--wait", WAIT_MS, "--baseline", lastWeek, "--markdown");
    expect(markdown.code, markdown.said).toBe(0);
    expect(markdown.stdout).toMatch(/\| Page \| Device \| LCP \| Δ \|/);
    expect(markdown.stdout).toMatch(/\| product \| mobile \| \S+ \S+ \| ▲ \+\d+ms \|/);
    expect(markdown.stdout).toContain("- Added: `about · mobile`");
    // The report of each combination, folded in its details block, carries its own comparison
    const details = markdown.stdout.slice(markdown.stdout.indexOf("<details><summary>product · mobile</summary>"));
    expect(details).toContain("### Compared with `");
  }, 180000);

  it("refuses the baseline of a page for a matrix, before any page load", async () => {
    const pageBaseline = join(dir, "one-page.json");
    writeFileSync(pageBaseline, JSON.stringify({ url: `${base}/fast`, results: [] }));
    const before = requests;
    const { code, stderr, said: output } = await cli("--matrix", today, "--baseline", pageBaseline);
    expect(code, output).toBe(2);
    expect(stderr).toContain("is the baseline of a page: compare it with a URL, not --matrix");
    expect(requests).toBe(before);
  }, 30000);
});

describe("--baseline fails before opening the browser", () => {
  const invalid = (name, text) => {
    const file = join(dir, name);
    writeFileSync(file, text);
    return file;
  };

  it.each([
    ["a missing file", () => ["--baseline", join(dir, "missing.json")], /Cannot read the baseline .*missing\.json: the file does not exist/],
    ["a file that is not an output of the CLI", () => ["--baseline", invalid("other.json", '{"lcp":2100}')], /is not an output of webperf-snippets --json/],
    ["the baseline of a matrix for a page", () => ["--baseline", invalid("matrix.json", '{"matrix":"m.json","runs":1,"combinations":[]}')], /is the baseline of a matrix: compare it with --matrix/],
    ["a threshold without its unit", () => ["--baseline", invalid("page.json", '{"url":"https://example.com/","results":[]}'), "--threshold", "LCP=200"], /Invalid --threshold "LCP=200"/],
    ["--threshold without --baseline", () => ["--threshold", "LCP=15%"], /--threshold needs --baseline/],
    ["--fail-on-regression without --baseline", () => ["--fail-on-regression"], /--fail-on-regression needs --baseline/],
  ])("with exit code 2 for %s", async (_, args, message) => {
    const before = requests;
    const { code, stderr, said: output } = await cli(`${base}/fast`, ...args());
    expect(code, output).toBe(2);
    expect(stderr).toMatch(message);
    expect(requests).toBe(before);
  }, 30000);
});
