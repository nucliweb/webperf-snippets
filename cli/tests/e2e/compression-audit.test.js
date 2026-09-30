import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");

// Compressible text: repeated lines, so gzip shrinks it a lot.
const text = (kb, seed) => `/* ${seed} */\n` + `.rule-${seed} { color: red; margin: 0; padding: 0 }\n`.repeat(kb * 20);

const CSS_UNCOMPRESSED = text(60, "css"); // ~60 KB, biggest saving
const JS_UNCOMPRESSED = text(20, "js"); // ~20 KB
const JS_GZIP = gzipSync(text(40, "gz"));
const JS_TINY = "window.__tiny = 1;";

let main;
let other;
let mainUrl;
let otherUrl;

const listen = (handler) =>
  new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });

beforeAll(async () => {
  // Second origin without Timing-Allow-Origin: Resource Timing hides its sizes.
  other = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(text(30, "third"));
  });
  otherUrl = `http://127.0.0.1:${other.address().port}`;

  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const html = (body) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>${body}</head><body><h1>t</h1></body></html>`);
    };
    if (path === "/mixed") {
      return html(
        `<link rel="stylesheet" href="/big.css"><script src="/mid.js"></script><script src="/gz.js"></script>` +
          `<script src="/tiny.js"></script><script src="${otherUrl}/third.js"></script>`
      );
    }
    if (path === "/same-origin") return html(`<script src="/gz.js"></script>`);
    if (path === "/big.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      return res.end(CSS_UNCOMPRESSED);
    }
    if (path === "/mid.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end(JS_UNCOMPRESSED);
    }
    if (path === "/gz.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Content-Encoding": "gzip" });
      return res.end(JS_GZIP);
    }
    if (path === "/tiny.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end(JS_TINY);
    }
    res.writeHead(404);
    res.end();
  });
  mainUrl = `http://127.0.0.1:${main.address().port}`;
}, 10000);

afterAll(async () => {
  await Promise.all([main, other].map((s) => new Promise((r) => s.close(r))));
});

async function run(route) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${mainUrl}${route}`, { waitUntil: "load" });
    return await page.evaluate(asExpression("Loading/Compression-Audit"));
  } finally {
    await browser.close();
  }
}

describe("Compression-Audit", () => {
  it("flags text resources served uncompressed, sorted by estimated savings", async () => {
    const r = await run("/mixed");
    expect(r.script).toBe("Compression-Audit");
    expect(r.status).toBe("ok");
    expect(r.items.map((i) => i.shortName)).toEqual(["big.css", "mid.js"]);
    expect(r.count).toBe(2);
    const [css] = r.items;
    expect(css.type).toBe("css");
    expect(css.encoding).toBe("none");
    expect(css.decodedBytes).toBeGreaterThan(50000);
    expect(css.estimatedSavingsBytes).toBeGreaterThan(0);
    expect(r.issues.some((i) => i.severity === "warning")).toBe(true);
  }, 30000);

  it("does not flag compressed resources, and reports the encoding", async () => {
    const r = await run("/mixed");
    expect(r.items.some((i) => i.url.endsWith("/gz.js"))).toBe(false);
    expect(r.details.compressedCount).toBe(1);
    expect(r.details.byEncoding.gzip).toBe(1);
  }, 30000);

  it("ignores resources too small to be worth compressing", async () => {
    const r = await run("/mixed");
    expect(r.items.some((i) => i.url.endsWith("/tiny.js"))).toBe(false);
  }, 30000);

  it("counts the resources it skipped, so every text resource is accounted for", async () => {
    const r = await run("/mixed");
    const d = r.details;
    // tiny.js and the fixture document itself are both under 1 KB
    expect(d.skippedSmallCount).toBe(2);
    expect(d.compressedCount + d.uncompressedCount + d.sizeUnknownCount + d.skippedSmallCount).toBe(d.totalTextResources);
  }, 30000);

  it("totals the estimated savings over the whole set", async () => {
    const r = await run("/mixed");
    const sum = r.items.reduce((n, i) => n + i.estimatedSavingsBytes, 0);
    expect(r.details.estimatedSavingsBytes).toBe(sum);
    expect(r.details.uncompressedCount).toBe(2);
  }, 30000);

  it("counts cross-origin resources without Timing-Allow-Origin and sets corsLimitedAnalysis", async () => {
    const r = await run("/mixed");
    expect(r.corsLimitedAnalysis).toBe(true);
    expect(r.details.sizeUnknownCount).toBe(1);
    expect(r.items.some((i) => i.url.includes("/third.js"))).toBe(false);
    expect(r.issues.some((i) => i.severity === "info" && /Timing-Allow-Origin/.test(i.message))).toBe(true);
  }, 30000);

  it("leaves corsLimitedAnalysis false when every size is known", async () => {
    const r = await run("/same-origin");
    expect(r.corsLimitedAnalysis).toBe(false);
    expect(r.details.sizeUnknownCount).toBe(0);
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
  }, 30000);
});
