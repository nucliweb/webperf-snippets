import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";
import { cliVersion } from "../../src/report-to.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
const run = promisify(execFile);

// The LCP entry needs a moment after load to be reported; with a short wait a loaded runner sometimes
// returns "No LCP entries buffered" and the CLI exits 1, as the other tests of the CLI note.
const WAIT_MS = "500";

// What the CLI printed, for the message of a failed exit code: without it a failure in CI only says
// which code came out, not why.
const said = (stdout = "", stderr = "") => `stderr:\n${stderr}\nstdout:\n${stdout.slice(0, 3000)}`;

let server;
let baseUrl;
let dir;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><title>${req.url}</title><h1>The page ${req.url}, measured to read its conditions</h1>`);
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  dir = mkdtempSync(join(tmpdir(), "conditions-e2e-"));
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const cli = (...args) =>
  run("node", [BIN, "--wait", WAIT_MS, ...args], { env: cliEnv() }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr, said: said(stdout, stderr) }),
    (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr, said: said(err.stdout, err.stderr) })
  );

// The machine the CLI ran on: its cores and a benchmark index, measured once per command
const machine = { cores: cpus().length, benchmarkIndex: expect.any(Number) };

describe("the conditions in the JSON", () => {
  it("of a page measured with a workflow name its viewport, workflow, wait and CLI version", async () => {
    const { code, stdout, said: output } = await cli(`${baseUrl}/home`, "--json", "--viewport", "desktop");
    expect(code, output).toBe(0);
    expect(JSON.parse(stdout).conditions).toEqual({ viewport: "desktop", workflow: "core-web-vitals", waitMs: 500, cliVersion, machine });
  }, 60000);

  it("of a page measured with one snippet name the snippet, the same for its alias and its path", async () => {
    const alias = await cli(`${baseUrl}/home`, "--json", "--snippet", "LCP");
    expect(alias.code, alias.said).toBe(0);
    expect(JSON.parse(alias.stdout).conditions).toEqual({ viewport: "mobile", snippet: "CoreWebVitals/LCP", waitMs: 500, cliVersion, machine });

    // The same conditions but the benchmark index, which is measured again
    const path = await cli(`${baseUrl}/home`, "--json", "--snippet", "CoreWebVitals/LCP");
    const withoutIndex = ({ machine: { benchmarkIndex, ...rest }, ...conditions }) => ({ ...conditions, machine: rest });
    expect(withoutIndex(JSON.parse(path.stdout).conditions)).toEqual(withoutIndex(JSON.parse(alias.stdout).conditions));
  }, 60000);

  it("of a matrix go in each combination, with the viewport of its device", async () => {
    const matrixPath = join(dir, "matrix.json");
    writeFileSync(matrixPath, JSON.stringify({ urls: { home: `${baseUrl}/home` }, devices: { phone: { viewport: "mobile" }, wide: { viewport: "desktop" } } }));
    // The exit code is left out: cache-strategy reports an error on a page without resources, so the
    // loading workflow exits 1 here, and that says nothing about the conditions
    const { stdout } = await cli("--matrix", matrixPath, "--json", "--workflow", "loading");
    const { combinations } = JSON.parse(stdout);
    expect(combinations.map((c) => c.conditions)).toEqual([
      { viewport: "mobile", workflow: "loading", waitMs: 500, cliVersion, machine },
      { viewport: "desktop", workflow: "loading", waitMs: 500, cliVersion, machine },
    ]);
    // Measured once for the whole matrix
    expect(combinations[0].conditions.machine).toEqual(combinations[1].conditions.machine);
  }, 120000);

  it("leave the human and markdown reports as they are", async () => {
    const human = await cli(`${baseUrl}/home`);
    expect(human.code, human.said).toBe(0);
    expect(human.stdout).not.toMatch(/conditions|cliVersion/i);
    const markdown = await cli(`${baseUrl}/home`, "--markdown");
    expect(markdown.stdout).not.toMatch(/conditions|cliVersion/i);
  }, 60000);
});
