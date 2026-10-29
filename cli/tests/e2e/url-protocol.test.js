import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");

const cli = (...args) =>
  new Promise((resolve) => {
    execFile("node", [BIN, ...args], { env: cliEnv() }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });

// The CLI loads the URL in a browser and returns what the snippets read from it. A file:// URL would
// hand an agent the files of the machine; the MCP server and the matrix file accept only http and
// https, and so does the URL of the command line. Local servers are the normal use, so they stay.
describe("the URL of the command line", () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<h1>x</h1>", "chrome://settings", "example.com"]) {
    it(`refuses ${url} before it opens a browser, with exit code 2`, async () => {
      const { code, stdout, stderr } = await cli(url, "--snippet", "LCP", "--json");
      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toMatch(/http or https URL, such as https:\/\/example\.com or http:\/\/localhost:3000/);
    }, 30000);
  }
});
