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

  it("an unknown workflow lists the ones there are", async () => {
    const { code, stderr } = await cli(URL, "--workflow", "everything");
    expect(code).toBe(2);
    expect(stderr).toMatch(/^Unknown workflow: "everything"\. Choose from: .*\bcore-web-vitals\b.*\baudit\b/);
  }, 30000);
});
