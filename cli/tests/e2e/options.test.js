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
