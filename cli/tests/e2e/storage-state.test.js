import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSnippets, runMeasurement } from "../../src/runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const run = promisify(execFile);

let server;
let baseUrl;
let storageStatePath;
let navigationCookies;

const READ_PAGE = `(() => ({
  status: "ok",
  title: document.title,
  token: localStorage.getItem("token"),
}))()`;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      navigationCookies.push(req.headers.cookie ?? "");
      const signedIn = /session=abc123/.test(req.headers.cookie ?? "");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><title>${signedIn ? "Dashboard" : "Login"}</title><p>hi</p>`);
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  storageStatePath = join(mkdtempSync(join(tmpdir(), "storage-state-")), "auth.json");
  writeFileSync(
    storageStatePath,
    JSON.stringify({
      cookies: [
        {
          name: "session",
          value: "abc123",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [{ origin: baseUrl, localStorage: [{ name: "token", value: "xyz" }] }],
    })
  );
}, 10000);

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  navigationCookies = [];
});

const items = [{ id: "page", path: "inline", source: READ_PAGE }];

describe("storageState in the runner", () => {
  it("runSnippets restores the session before navigation", async () => {
    const { results } = await runSnippets({ url: baseUrl, items, waitMs: 0, storageState: storageStatePath });
    expect(navigationCookies[0]).toContain("session=abc123");
    expect(results[0].title).toBe("Dashboard");
    expect(results[0].token).toBe("xyz");
  }, 30000);

  it("runSnippets without storageState stays signed out", async () => {
    const { results } = await runSnippets({ url: baseUrl, items, waitMs: 0 });
    expect(navigationCookies[0]).toBe("");
    expect(results[0].title).toBe("Login");
    expect(results[0].token).toBeNull();
  }, 30000);

  it("runMeasurement restores the session before navigation", async () => {
    const workflow = { steps: [{ id: "LCP", path: "CoreWebVitals/LCP" }] };
    await runMeasurement({ url: baseUrl, workflow, waitMs: 0, storageState: storageStatePath });
    expect(navigationCookies[0]).toContain("session=abc123");
  }, 30000);
});

describe("--storage-state flag", () => {
  const cli = (...args) =>
    run("node", [BIN, baseUrl, "--snippet", "LCP", "--json", "--wait", "0", ...args]).then(
      ({ stdout }) => ({ code: 0, stdout, stderr: "" }),
      (err) => ({ code: err.code, stdout: err.stdout, stderr: err.stderr })
    );

  it("sends the saved cookies with the navigation", async () => {
    const { code } = await cli("--storage-state", storageStatePath);
    expect(code).toBe(0);
    expect(navigationCookies[0]).toContain("session=abc123");
  }, 30000);

  it("fails with a clear error and exit code 2 when the file does not exist", async () => {
    const { code, stderr } = await cli("--storage-state", "/nonexistent/auth.json");
    expect(code).toBe(2);
    expect(stderr).toContain("Storage state file not found: /nonexistent/auth.json");
    expect(navigationCookies).toHaveLength(0);
  }, 30000);
});
