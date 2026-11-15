import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const HERO = readFileSync(join(HERE, "../fixtures/hero.png"));
// A pipe holds 64 KB on macOS and Linux. The report of this page is several times that: an item for
// each of its images
const IMAGES = 400;
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Many images</title></head><body><h1>Many images</h1>${Array.from(
  { length: IMAGES },
  (_, i) => `<img src="hero.png?image-number-${i}" alt="">`
).join("\n")}</body></html>`;

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        if (req.url.startsWith("/hero.png")) return res.writeHead(200, { "Content-Type": "image/png" }).end(HERO);
        res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

// Runs the CLI with its stdout on a pipe, and `onStdout` decides what the reader does with it
function cli(args, onStdout) {
  return new Promise((resolve) => {
    const child = spawn("node", [BIN, ...args], { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    onStdout(child.stdout, stdout);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString() }));
  });
}

describe("a report larger than a pipe holds", () => {
  it(
    "reaches a reader that is slower than the CLI whole, so its JSON parses",
    async () => {
      const { code, stdout, stderr } = await cli([baseUrl, "--snippet", "Image-Element-Audit", "--wait", "200", "--fail-on", "never", "--json"], (stream, chunks) => {
        // A reader that is busy when the report is written, as a script that does something else first
        setTimeout(() => stream.on("data", (chunk) => chunks.push(chunk)), 1000);
      });
      expect(stderr).toBe("");
      expect(stdout.length).toBeGreaterThan(4 * 65536);
      expect(JSON.parse(stdout.toString()).results[0].count).toBe(IMAGES);
      expect(code).toBe(0);
    },
    90000
  );

  it(
    "keeps the exit code of the issues when it waits for the reader",
    async () => {
      const { code, stdout } = await cli([baseUrl, "--snippet", "Image-Element-Audit", "--wait", "200", "--fail-on", "warning", "--json"], (stream, chunks) => stream.on("data", (chunk) => chunks.push(chunk)));
      expect(JSON.parse(stdout.toString()).overview.withWarnings).toBe(1);
      expect(code).toBe(1);
    },
    90000
  );

  it(
    "ends without an error when the reader closes the pipe early, as head does",
    async () => {
      const { stderr } = await cli([baseUrl, "--snippet", "Image-Element-Audit", "--wait", "200", "--fail-on", "never", "--json"], (stream) => stream.once("data", () => stream.destroy()));
      expect(stderr).toBe("");
    },
    90000
  );
});
