import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const run = promisify(execFile);

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync(join(HERE, "../fixtures/index.html")));
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function runCli(alias) {
  try {
    const { stdout } = await run("node", [BIN, baseUrl, "--snippet", alias, "--json", "--wait", "500"]);
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

describe("--snippet aliases", () => {
  it.each(["LCP", "CLS", "INP"])("%s resolves to a snippet", async (alias) => {
    const { stdout, stderr } = await runCli(alias);
    expect(stderr).not.toContain("Snippet not found");
    const payload = JSON.parse(stdout);
    expect(payload.results[0].id).toBe(alias);
    expect(payload.results[0].script).toBe(alias);
  }, 30000);
});
