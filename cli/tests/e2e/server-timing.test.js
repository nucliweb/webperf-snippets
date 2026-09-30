import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

let browser;
let main;
let other;
let base;

const listen = (handler) =>
  new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
const close = (s) => new Promise((r) => s.close(r));

beforeAll(async () => {
  browser = await chromium.launch();
  other = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const headers = { "Content-Type": "application/javascript", "Server-Timing": 'edge;dur=7.5;desc="Edge cache"' };
    // Only /tao.js lets the page read its timing, including Server-Timing
    if (path === "/tao.js") headers["Timing-Allow-Origin"] = "*";
    res.writeHead(200, headers);
    res.end("window.__x = 1;");
  });
  const otherUrl = `http://127.0.0.1:${other.address().port}`;
  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/app.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Server-Timing": "app;dur=12" });
      return res.end("window.__app = 1;");
    }
    if (path === "/plain") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<!DOCTYPE html><title>plain</title><h1>plain</h1>");
    }
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Server-Timing": 'db;dur=53.2;desc="Database", cache;desc=HIT, total;dur=120',
    });
    res.end(`<!DOCTYPE html><title>st</title><h1>st</h1>
<script src="/app.js"></script>
<script src="${otherUrl}/tao.js"></script>
<script src="${otherUrl}/hidden.js"></script>`);
  });
  base = `http://127.0.0.1:${main.address().port}`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await close(main);
  await close(other);
});

const source = () => loadSnippet("Loading/Server-Timing-Early-Hints").trim().replace(/;\s*$/, "");

async function run(path) {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    return await page.evaluate(source());
  } finally {
    await page.close();
  }
}

describe("Server-Timing-Early-Hints", () => {
  it("lists the Server-Timing metrics of the document and of readable resources", async () => {
    const r = await run("/");
    expect(r.script).toBe("Server-Timing-Early-Hints");
    expect(r.status).toBe("ok");

    const nav = r.items.filter((i) => i.source === "navigation");
    expect(nav.map((i) => i.name).sort()).toEqual(["cache", "db", "total"]);
    const db = nav.find((i) => i.name === "db");
    expect(db.durationMs).toBe(53.2);
    expect(db.description).toBe("Database");
    expect(nav.find((i) => i.name === "cache").durationMs).toBe(0);

    const resources = r.items.filter((i) => i.source === "resource");
    expect(resources.map((i) => i.name).sort()).toEqual(["app", "edge"]);
    expect(resources.find((i) => i.name === "app").durationMs).toBe(12);

    // 3 document metrics + app + edge from the resource that sends Timing-Allow-Origin
    expect(r.count).toBe(5);
    // Slowest first
    expect(r.items[0].name).toBe("total");
  });

  it("reports the cross-origin resource without Timing-Allow-Origin as unreadable", async () => {
    const r = await run("/");
    expect(r.details.resourcesWithServerTiming).toBe(2);
    expect(r.details.corsRestrictedCount).toBe(1);
    expect(r.corsLimitedAnalysis).toBe(true);
    expect(r.issues.some((i) => i.severity === "info" && /Timing-Allow-Origin/.test(i.message))).toBe(true);
  });

  it("reports the response timing of the document", async () => {
    const r = await run("/");
    const t = r.details.navigation;
    expect(typeof t.responseStartMs).toBe("number");
    expect(typeof t.finalResponseHeadersStartMs).toBe("number");
    expect(typeof t.firstInterimResponseStartMs).toBe("number");
    expect(typeof t.earlyHintsReceived).toBe("boolean");
    // A local HTTP/1.1 server sends no 103 that the browser exposes, or the values agree
    if (!t.earlyHintsReceived) expect(t.firstInterimResponseStartMs).toBe(0);
  });

  it("returns an empty, valid result and an issue when nothing sends Server-Timing", async () => {
    const r = await run("/plain");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.corsLimitedAnalysis).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.issues.some((i) => /Server-Timing/.test(i.message))).toBe(true);
  });
});
