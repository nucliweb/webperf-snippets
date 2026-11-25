import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// A preconnect pays off only when the request it is for finds the connection still open. Chromium keeps
// an unused preconnected connection for about 60 s, but a server can close one that carries no request
// sooner, and then the request opens a connection of its own. Resource Timing shows it when the response
// has Timing-Allow-Origin: connectStart equals connectEnd on a connection that was open already. The
// reference is CDP, whose timing has connectStart -1 when the request found an open connection.
//
// Like resource-hints-credentials.test.js, each case runs in a persistent context of the full Chromium,
// the only kind of profile where Chromium preconnects.

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG = readFileSync(resolve(HERE, "../fixtures/hero.png"));

let page;
let keeping;
let closing;

// `?tao` adds Timing-Allow-Origin, without which Resource Timing hides the connection phases
const imageServer = ({ closeIdleAfterMs } = {}) =>
  new Promise((res) => {
    const s = createServer((req, response) => {
      req.socket.carriedRequest = true;
      const headers = { "Content-Type": "image/png" };
      if (req.url.includes("tao")) headers["Timing-Allow-Origin"] = "*";
      response.writeHead(200, headers);
      response.end(PNG);
    });
    // A server that closes a connection on which no request arrived, as some servers and CDNs do
    if (closeIdleAfterMs) {
      s.on("connection", (socket) => {
        setTimeout(() => {
          if (!socket.carriedRequest) socket.destroy();
        }, closeIdleAfterMs);
      });
    }
    s.listen(0, "127.0.0.1", () => res(s));
  });

const base = (s) => `http://127.0.0.1:${s.address().port}`;

// The image starts 1 s after the load, after the closing server dropped the preconnected connection
const CASES = {
  kept: () => ({ origin: base(keeping), path: "/a.png?tao" }),
  closed: () => ({ origin: base(closing), path: "/a.png?tao" }),
  "no-timing": () => ({ origin: base(keeping), path: "/a.png" }),
};

beforeAll(async () => {
  keeping = await imageServer();
  closing = await imageServer({ closeIdleAfterMs: 300 });
  page = await new Promise((res) => {
    const s = createServer((req, response) => {
      const name = req.url.slice(1);
      // Only the cases of this file, not a name the object inherits (constructor, toString)
      if (!Object.hasOwn(CASES, name)) return response.writeHead(404), response.end();
      const { origin, path } = CASES[name]();
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>c</title><link rel="preconnect" href="${origin}"></head>
<body><script>setTimeout(() => { const i = new Image(); i.src = "${origin}${path}"; document.body.append(i); }, 1000);</script></body></html>`);
    });
    s.listen(0, "127.0.0.1", () => res(s));
  });
}, 30000);

afterAll(async () => {
  await Promise.all([page, keeping, closing].map((s) => new Promise((r) => s.close(r))));
});

const source = loadSnippet("Loading/Resource-Hints").trim().replace(/;\s*$/, "");

async function observe(name) {
  const dir = mkdtempSync(join(tmpdir(), "webperf-preconnect-"));
  const context = await chromium.launchPersistentContext(dir, { channel: "chromium" });
  try {
    const tab = context.pages()[0] ?? (await context.newPage());
    const cdp = await context.newCDPSession(tab);
    await cdp.send("Network.enable");
    let reused = null;
    cdp.on("Network.responseReceived", ({ response }) => {
      if (response.url.includes("/a.png")) reused = response.timing?.connectStart === -1;
    });
    await tab.goto(`${base(page)}/${name}`, { waitUntil: "load" });
    await tab.waitForTimeout(2000);
    const result = await tab.evaluate(source);
    return { result, reused, preconnect: result.items.find((i) => i.rel === "preconnect") };
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Resource-Hints, whether a preconnect saved a connection", () => {
  it("says the first request reused the preconnected connection, as CDP does", async () => {
    const { reused, preconnect, result } = await observe("kept");
    expect(reused).toBe(true);
    expect(preconnect).toEqual(expect.objectContaining({ use: "used", firstUseConnection: "reused" }));
    expect(result.issues.map((i) => i.code)).not.toContain("preconnect-not-reused");
  }, 60000);

  it("says the first request opened a new connection when the server closed the preconnected one, as CDP does", async () => {
    const { reused, preconnect, result } = await observe("closed");
    expect(reused).toBe(false);
    expect(preconnect).toEqual(expect.objectContaining({ use: "used", firstUseConnection: "new" }));
    const issue = result.issues.find((i) => i.code === "preconnect-not-reused");
    expect(issue).toEqual(expect.objectContaining({ severity: "warning", target: `${base(closing)}/` }));
  }, 60000);

  it("does not say it when the response hides its connection timing", async () => {
    const { reused, preconnect, result } = await observe("no-timing");
    expect(reused).toBe(true);
    expect(preconnect).toEqual(expect.objectContaining({ use: "used", firstUseConnection: "unknown" }));
    expect(result.issues.map((i) => i.code)).not.toContain("preconnect-not-reused");
  }, 60000);
});
