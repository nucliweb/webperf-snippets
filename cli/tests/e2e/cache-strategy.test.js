import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");

// The page lives on www.app.localhost (same origin). Chromium resolves every *.localhost name to
// loopback, so one server answers for both hosts and tells them apart by the Host header:
//   assets.cdn.localhost  another origin, sends Timing-Allow-Origin, so sizes are readable but the
//                         page cannot read its Cache-Control
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const IMMUTABLE = "public, max-age=31536000, immutable";
// Text that no server compressed: encoded size equals decoded size
const UNCOMPRESSED_JS = `/* ${"x".repeat(4000)} */`;

let server;
let pageBase;
let port;

beforeAll(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    const path = new URL(req.url, "http://x").pathname;
    const send = (type, body, headers = {}) => {
      res.writeHead(200, { "Content-Type": type, ...headers });
      res.end(body);
    };
    const html = (body) => send("text/html", `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>${body}</head><body><h1>t</h1></body></html>`);
    const cdn = `http://assets.cdn.localhost:${port}`;

    if (host === "assets.cdn.localhost") {
      const headers = { "Timing-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };
      if (path === "/pic.png") return send("image/png", PNG_1PX, headers);
      if (path === "/lib.css") return send("text/css", "body{margin:0}", headers);
      return send("application/javascript", "window.__lib = 1;", headers);
    }

    // Same-origin pages
    if (path === "/") {
      return html(
        `<link rel="stylesheet" href="/static.css"><link rel="stylesheet" href="/more.css">` +
          `<script src="/app.js"></script><script src="/big.js"></script><script src="/ok.js"></script>` +
          `<script src="${cdn}/lib.js"></script><img src="${cdn}/pic.png" alt="">` +
          // The body has to be read, or the browser records no Resource Timing entry for the fetch
          `<script>for (let i = 0; i < 2; i++) fetch("/data.json", { cache: "no-store" }).then((r) => r.text());</script>`
      );
    }
    if (path === "/cross-origin-only") {
      return html(`<link rel="stylesheet" href="${cdn}/lib.css"><script src="${cdn}/lib.js"></script><img src="${cdn}/pic.png" alt="">`);
    }
    // Same-origin assets
    if (path === "/static.css" || path === "/more.css") return send("text/css", "body{margin:0}", { "Cache-Control": IMMUTABLE });
    if (path === "/app.js") return send("application/javascript", "window.__app = 1;", { "Cache-Control": "no-cache" });
    if (path === "/ok.js") return send("application/javascript", "window.__ok = 1;", { "Cache-Control": IMMUTABLE });
    if (path === "/big.js") return send("application/javascript", UNCOMPRESSED_JS, { "Cache-Control": IMMUTABLE });
    if (path === "/data.json") return send("application/json", "{}", { "Cache-Control": "no-store" });
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  pageBase = `http://www.app.localhost:${port}`;
}, 10000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

async function run(route) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const lines = [];
    page.on("console", (m) => lines.push(m.text()));
    await page.goto(`${pageBase}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const result = await page.evaluate(asExpression("Loading/Cache-Strategy-Analysis"));
    return { result, lines };
  } finally {
    await browser.close();
  }
}

const item = (result, shortName) => result.items.find((i) => i.shortName === shortName);

describe("Cache-Strategy-Analysis, what it already reports", () => {
  it("reads the cache headers of same-origin static assets and lists the one without effective cache", async () => {
    const { result } = await run("/");
    expect(result.status).toBe("ok");
    expect(result.details.headersAnalyzed).toBe(5);
    expect(item(result, "app.js").cacheStrategy).toBe("no-cache");
  }, 30000);

  it("leaves out a static asset with an immutable cache", async () => {
    const { result } = await run("/");
    expect(item(result, "static.css")).toBeUndefined();
    expect(item(result, "ok.js")).toBeUndefined();
  }, 30000);
});

describe("Cache-Strategy-Analysis, findings that need no cache headers", () => {
  it("lists a resource loaded several times from the network as duplicate-uncached", async () => {
    const { result } = await run("/");
    const duplicate = item(result, "data.json");
    expect(duplicate).toBeDefined();
    expect(duplicate.antiPatterns).toContain("duplicate-uncached");
    const issue = result.issues.find((i) => i.id === "duplicate-uncached");
    expect(issue.severity).toBe("warning");
    expect(issue.resource).toBe("data.json");
  }, 30000);

  it("reports a duplicated resource once, not once per request", async () => {
    const { result } = await run("/");
    expect(result.issues.filter((i) => i.id === "duplicate-uncached")).toHaveLength(1);
    expect(result.items.filter((i) => i.shortName === "data.json")).toHaveLength(1);
  }, 30000);

  it("lists a text resource that was sent uncompressed, even with a perfect cache", async () => {
    const { result } = await run("/");
    const big = item(result, "big.js");
    expect(big).toBeDefined();
    expect(big.cacheStrategy).toBe("immutable");
    expect(big.antiPatterns).toEqual(["uncompressed"]);
    expect(result.issues.some((i) => i.id === "uncompressed" && i.severity === "warning")).toBe(true);
  }, 30000);

  it("keeps every issue the items point to, and the count of anti-patterns", async () => {
    const { result } = await run("/");
    const fromItems = result.items.flatMap((i) => i.antiPatterns);
    for (const id of fromItems) expect(result.issues.some((i) => i.id === id)).toBe(true);
    expect(result.details.antiPatternCount).toBe(result.issues.filter((i) => i.id !== "header-coverage").length);
  }, 30000);
});

describe("Cache-Strategy-Analysis, how much of the page could be analyzed", () => {
  it("reports the share of resources whose cache headers were read", async () => {
    const { result } = await run("/");
    // 5 same-origin static assets of 9 requests
    expect(result.details.headerCoveragePercent).toBe(Math.round((5 / result.details.totalResources) * 100));
    expect(result.issues.some((i) => i.id === "header-coverage")).toBe(false);
  }, 30000);

  it("explains it when most resources are on another origin, naming the hosts", async () => {
    const { result } = await run("/cross-origin-only");
    expect(result.details.headersAnalyzed).toBe(0);
    expect(result.details.headerCoveragePercent).toBe(0);
    const issue = result.issues.find((i) => i.id === "header-coverage");
    expect(issue.severity).toBe("info");
    expect(issue.message).toMatch(/0 of 3 resources/);
    expect(issue.message).toMatch(/assets\.cdn\.localhost/);
  }, 30000);

  it("returns serializable output with the coverage issue", async () => {
    const { result } = await run("/cross-origin-only");
    expect(() => JSON.stringify(result)).not.toThrow();
  }, 30000);
});

describe("Cache-Strategy-Analysis, cache efficiency", () => {
  it("is measured only on the resources whose strategy could be read", async () => {
    const { result } = await run("/");
    // Effective: static.css, more.css, ok.js and big.js (immutable). Not effective: app.js (no-cache).
    // The cross-origin resources and the fetches are unknown and do not count either way.
    expect(result.details.cacheEfficiencyPercent).toBe(80);
    expect(result.details.cacheEfficiencyRating).toBe("good");
    expect(result.details.cacheEfficiencyResources).toBe(5);
  }, 30000);

  it("is null, not 0, when no cache header could be read", async () => {
    const { result, lines } = await run("/cross-origin-only");
    expect(result.details.cacheEfficiencyPercent).toBeNull();
    expect(result.details.cacheEfficiencyRating).toBeNull();
    expect(result.recommendations.some((r) => /Cache efficiency is low/.test(r))).toBe(false);
    expect(lines.some((l) => /Cache efficiency: n\/a/.test(l))).toBe(true);
  }, 30000);
});
