import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const { version } = JSON.parse(readFileSync(join(HERE, "../../package.json"), "utf8"));

const cli = (...args) =>
  new Promise((resolve) => {
    execFile("node", [BIN, ...args], { env: cliEnv() }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });

describe("--version", () => {
  it.each(["--version", "-v"])("%s prints only the version of the package, with exit code 0", async (flag) => {
    const { code, stdout, stderr } = await cli(flag);
    expect(code).toBe(0);
    expect(stdout).toBe(`${version}\n`);
    expect(stderr).toBe("");
  }, 30000);

  it("wins over a URL, so no browser opens", async () => {
    const { code, stdout } = await cli("https://example.com", "--version");
    expect(code).toBe(0);
    expect(stdout).toBe(`${version}\n`);
  }, 30000);

  it("is listed in the help", async () => {
    const { code, stdout } = await cli("--help");
    expect(code).toBe(0);
    expect(stdout).toMatch(/^\s+-v, --version\s+Show the version$/m);
  }, 30000);
});

describe("--help", () => {
  it("lists a live baseline, --max-runs and --fail-on-inconclusive", async () => {
    const { code, stdout } = await cli("--help");
    expect(code).toBe(0);
    expect(stdout).toMatch(/^\s+--baseline <file\|url>\s/m);
    expect(stdout).toMatch(/^\s+--max-runs <n>\s/m);
    expect(stdout).toMatch(/^\s+--fail-on-inconclusive\s/m);
  }, 30000);
});

// Each of these stops before the browser opens, so the URL is never loaded
describe("a wrong use of the options", () => {
  const URL = "http://localhost:9";

  it.each(["abc", "-1", "1s", ""])('--wait "%s" is a usage error, not a run without a wait', async (wait) => {
    const { code, stdout, stderr } = await cli(URL, `--wait=${wait}`);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toBe(`Invalid --wait "${wait}". Use a number of milliseconds, such as 3000, or 0 for no wait\n`);
  }, 30000);

  it("--json and --markdown together are a usage error, not a markdown report", async () => {
    const { code, stdout, stderr } = await cli(URL, "--json", "--markdown");
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toBe("Use --json or --markdown, not both\n");
  }, 30000);

  it("without a URL, the usage goes to stderr, so a pipe or a redirect of stdout stays empty", async () => {
    const { code, stdout, stderr } = await cli();
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/^webperf-snippets <url> \[options\]\n/);
  }, 30000);

  // The file is read and checked before the browser opens: no stack, and no wait for a page
  it.each([
    ["nowhere.json", "Interaction script not found: nowhere.json\n"],
    [join(HERE, "../fixtures/index.html"), /^Invalid --interact-script .*index\.html: it is not valid JSON \(.+\)\n$/],
    [join(HERE, "../../package.json"), /^Invalid --interact-script .*package\.json: it needs a list of steps, as \{ "interactions": \[.*\] \}\n$/],
  ])("--interact-script %s is a usage error", async (file, message) => {
    const { code, stdout, stderr } = await cli(URL, "--interact-script", file);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    if (typeof message === "string") expect(stderr).toBe(message);
    else expect(stderr).toMatch(message);
  }, 30000);

  it("an unknown workflow lists the ones there are", async () => {
    const { code, stderr } = await cli(URL, "--workflow", "everything");
    expect(code).toBe(2);
    expect(stderr).toMatch(/^Unknown workflow: "everything"\. Choose from: .*\bcore-web-vitals\b.*\baudit\b/);
  }, 30000);
});

// Playwright is a peer dependency, and loading it takes most of the start of the CLI. What needs no
// browser does not load it, so it also works where Playwright is not installed
describe("without Playwright", () => {
  const NO_PLAYWRIGHT = join(HERE, "../helpers/no-playwright.mjs");
  const run = (...args) =>
    new Promise((resolve) => {
      execFile("node", ["--import", NO_PLAYWRIGHT, BIN, ...args], { env: cliEnv() }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
    });

  it("--version prints the version", async () => {
    expect(await run("--version")).toEqual({ code: 0, stdout: `${version}\n`, stderr: "" });
  }, 30000);

  it("--help prints the usage", async () => {
    const { code, stdout, stderr } = await run("--help");
    expect(code).toBe(0);
    expect(stdout).toMatch(/^webperf-snippets <url> \[options\]\n/);
    expect(stderr).toBe("");
  }, 30000);

  it("a wrong use of the options is still a usage error", async () => {
    const { code, stderr } = await run("http://localhost:9", "--wait=abc");
    expect(code).toBe(2);
    expect(stderr).toMatch(/^Invalid --wait /);
  }, 30000);

  it("a measurement says how to install Playwright, in one line and without a stack", async () => {
    const { code, stdout, stderr } = await run("http://localhost:9");
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe("Playwright is not installed. Install it and its Chromium with: npm install playwright && npx playwright install chromium\n");
  }, 30000);
});
