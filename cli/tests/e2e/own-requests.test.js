import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// Some snippets request files of the page to read them (fetch, HEAD requests, new Image()).
// Those requests land in Resource Timing, so a snippet that reads it later, or the same snippet
// run again on the same page, must leave them out and give the same result.

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");
const PNG = readFileSync(fileURLToPath(new URL("../fixtures/hero.png", import.meta.url)));
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image width="10" height="10" xlink:href="data:image/png;base64,${PNG.toString("base64").slice(0, 200)}"/></svg>`;
const CSS = `@media (min-width: 900px){.a{color:red}}` + `.r{margin:0}`.repeat(200);

// The snippets that make requests of their own
const REQUESTERS = [
  "Media/SVG-Embedded-Bitmap-Analysis",
  "Media/Image-Element-Audit",
  "Media/Oversized-Images",
  "Loading/Cache-Strategy-Analysis",
  "Loading/CSS-Media-Queries-Analysis",
  "Loading/Back-Forward-Cache",
];

// The snippets that count what Resource Timing reports
const READERS = [
  "CoreWebVitals/LCP-Subparts",
  "Loading/Cache-Strategy-Analysis",
  "Loading/Client-Side-Redirect-Detection",
  "Loading/Compression-Audit",
  "Loading/Critical-CSS-Detection",
  "Loading/FCP",
  "Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
  "Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
  "Loading/Find-render-blocking-resources",
  "Loading/First-And-Third-Party-Script-Info",
  "Loading/First-And-Third-Party-Script-Timings",
  "Loading/JS-Execution-Time-Breakdown",
  "Loading/Prefetch-Resource-Validation",
  "Loading/Priority-Hints-Audit",
  "Loading/Resource-Hints",
  "Loading/Resource-Hints-Validation",
  "Loading/Script-Loading",
  "Loading/Server-Timing-Early-Hints",
  "Loading/Service-Worker-Analysis",
  "Loading/Third-Party-Impact-by-Domain",
  "Loading/TTFB-Resources",
  "Loading/Validate-Preload-Async-Defer-Scripts",
  "Loading/Webfont-Usage-Analyzer",
  "Media/Oversized-Images",
  "Media/SVG-Embedded-Bitmap-Analysis",
];

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
  // Another origin: CORS lets fetch() read its files, and no Timing-Allow-Origin hides their sizes
  other = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=600" };
    if (path === "/icon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", ...cors });
      return res.end(SVG);
    }
    if (path === "/photo.png") {
      res.writeHead(200, { "Content-Type": "image/png", ...cors });
      return res.end(PNG);
    }
    if (path === "/theme.css") {
      res.writeHead(200, { "Content-Type": "text/css", ...cors });
      return res.end(CSS);
    }
    res.writeHead(200, { "Content-Type": "application/javascript", ...cors });
    res.end(`/* ${"x".repeat(3000)} */ window.__third = 1;`);
  });
  otherUrl = `http://127.0.0.1:${other.address().port}`;

  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const send = (type, body) => {
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=600" });
      res.end(body);
    };
    if (path === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="${otherUrl}/theme.css">
<script src="/app.js"></script><script src="${otherUrl}/third.js"></script></head>
<body><h1>Own requests</h1>
<img src="/hero.png" width="600" height="400" alt="hero">
<img src="${otherUrl}/icon.svg" width="10" height="10" alt="icon">
<img src="${otherUrl}/photo.png" crossorigin="anonymous" width="20" height="20" alt="photo">
</body></html>`);
    }
    if (path === "/site.css") return send("text/css", CSS);
    if (path === "/app.js") return send("application/javascript", `/* ${"y".repeat(3000)} */ window.__app = 1;`);
    if (path === "/hero.png") return send("image/png", PNG);
    res.writeHead(404);
    res.end();
  });
  mainUrl = `http://127.0.0.1:${main.address().port}`;
}, 10000);

afterAll(async () => {
  await Promise.all([main, other].map((s) => new Promise((r) => s.close(r))));
});

async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(`${mainUrl}/`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const run = (name) => page.evaluate(asExpression(name));
    return await fn(run);
  } finally {
    await browser.close();
  }
}

// Durations and timestamps change between runs; what is counted must not
const stable = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) => (typeof v === "number" && /(Ms|duration|time|Time|ttfb)$/i.test(key) ? 0 : v))
  );

describe("snippets that make requests of their own", () => {
  it.each(REQUESTERS)("%s returns the same result when it runs twice on the same page", async (name) => {
    await withPage(async (run) => {
      const first = await run(name);
      const second = await run(name);
      expect(stable(second)).toEqual(stable(first));
    });
  }, 60000);

  it.each(READERS)("%s does not count the requests the other snippets made", async (name) => {
    await withPage(async (run) => {
      const before = await run(name);
      for (const requester of REQUESTERS) await run(requester);
      const after = await run(name);
      expect(stable(after)).toEqual(stable(before));
    });
  }, 60000);

  it("Compression-Audit counts the same cross-origin text resources after the SVG analysis", async () => {
    await withPage(async (run) => {
      const before = await run("Loading/Compression-Audit");
      await run("Media/SVG-Embedded-Bitmap-Analysis");
      await run("Loading/CSS-Media-Queries-Analysis");
      const after = await run("Loading/Compression-Audit");
      expect(after.details.sizeUnknownCount).toBe(before.details.sizeUnknownCount);
      expect(after.details.totalTextResources).toBe(before.details.totalTextResources);
    });
  }, 60000);
});
