import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliEnv } from "../helpers/cli-env.js";
import { startContractServers } from "../helpers/contract.js";

// --fail-on decides which issues make the command exit with 1: the errors (the default), the errors
// and warnings, or none. On the seeded page, render-blocking finds an error and Compression-Audit a
// warning and an info. Budgets and usage errors keep their exit codes.
const BIN = fileURLToPath(new URL("../../src/bin.js", import.meta.url));

let servers;
let noBrowsers;

beforeAll(async () => {
  servers = await startContractServers();
  noBrowsers = mkdtempSync(join(tmpdir(), "no-browsers-"));
}, 30000);

afterAll(async () => {
  await servers?.close();
  rmSync(noBrowsers, { recursive: true, force: true });
});

const cli = (args, env = cliEnv()) =>
  new Promise((resolve) =>
    execFile(process.execPath, [BIN, ...args], { env }, (err, stdout, stderr) =>
      resolve({ code: err?.code ?? 0, stdout, stderr, said: `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 2000)}` })
    )
  );
const snippet = (name, ...flags) => cli([`${servers.base}/seeded`, "--snippet", name, "--wait", "500", "--json", ...flags]);

describe("--fail-on", () => {
  it("exits 1 for an error by default and with warning, and 0 with never", async () => {
    const byDefault = await snippet("render-blocking");
    expect(JSON.parse(byDefault.stdout).overview.withErrors, byDefault.said).toBe(1);
    expect(byDefault.code, byDefault.said).toBe(1);
    expect((await snippet("render-blocking", "--fail-on", "error")).code).toBe(1);
    expect((await snippet("render-blocking", "--fail-on", "warning")).code).toBe(1);
    expect((await snippet("render-blocking", "--fail-on", "never")).code).toBe(0);
  }, 90000);

  it("exits 1 for a warning only with warning", async () => {
    const byDefault = await snippet("Compression-Audit");
    expect(JSON.parse(byDefault.stdout).overview, byDefault.said).toMatchObject({ withErrors: 0, withWarnings: 1 });
    expect(byDefault.code, byDefault.said).toBe(0);
    expect((await snippet("Compression-Audit", "--fail-on", "warning")).code).toBe(1);
    expect((await snippet("Compression-Audit", "--fail-on", "never")).code).toBe(0);
  }, 90000);

  it("decides the exit code of a matrix the same way", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fail-on-matrix-"));
    const file = join(dir, "matrix.json");
    writeFileSync(file, JSON.stringify({ urls: { seeded: `${servers.base}/seeded` }, devices: ["mobile"] }));
    try {
      const args = ["--matrix", file, "--snippet", "render-blocking", "--wait", "500", "--json"];
      const byDefault = await cli(args);
      expect(byDefault.code, byDefault.said).toBe(1);
      const never = await cli([...args, "--fail-on", "never"]);
      expect(never.code, never.said).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90000);

  it("leaves a budget that is exceeded to exit with 1, with never", async () => {
    const { code, stderr, said } = await snippet("LCP", "--budget-lcp", "1", "--fail-on", "never");
    expect(code, said).toBe(1);
    expect(stderr).toContain("Budget violation");
  }, 60000);

  it("exits with 2 for a value it does not take, before opening a browser", async () => {
    // With no browser installed, a launch would exit with 1 and say how to install it
    const { code, stderr, stdout } = await cli([`${servers.base}/seeded`, "--fail-on", "warnings"], { ...cliEnv(), PLAYWRIGHT_BROWSERS_PATH: noBrowsers });
    expect(code).toBe(2);
    expect(stderr).toContain('--fail-on must be error, warning or never, not "warnings"');
    expect(stderr).not.toContain("npx playwright install");
    expect(stdout).toBe("");
  }, 30000);
});
