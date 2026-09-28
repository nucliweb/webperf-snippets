import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");

// A 1x1 transparent PNG, embedded in an SVG served from another origin.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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
  // Second origin: no Timing-Allow-Origin, so resource timing is opaque for it.
  other = await listen((req, res) => {
    if (req.url.startsWith("/bitmap.svg")) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Access-Control-Allow-Origin": "*" });
      res.end(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image width="10" height="10" xlink:href="data:image/png;base64,${PNG_B64}"/></svg>`
      );
    } else {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end("window.__xorigin = true;");
    }
  });
  otherUrl = `http://127.0.0.1:${other.address().port}`;

  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const html = (body) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`);
    };
    if (path === "/basic") return html("<h1>Basic</h1>");
    if (path === "/late-resource") {
      return html(
        `<h1>Late resource</h1><script src="${otherUrl}/x.js"></script>` +
          `<script>setTimeout(() => { const s = document.createElement("script"); s.src = "/fast.js"; document.body.appendChild(s); }, 1500);</script>`
      );
    }
    if (path === "/scripts") {
      return html(`<script src="${otherUrl}/x.js" async></script><script src="/fast.js" defer></script><h1>Scripts</h1>`);
    }
    if (path === "/svg") return html(`<img src="${otherUrl}/bitmap.svg" width="10" height="10">`);
    if (path === "/slow-load") return html(`<h1>Slow</h1><img src="/slow.png" width="10" height="10">`);
    if (path === "/fast.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end("window.__fast = true;");
    }
    if (path === "/slow.png") {
      return setTimeout(() => {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(Buffer.from(PNG_B64, "base64"));
      }, 3000);
    }
    res.writeHead(404);
    res.end();
  });
  mainUrl = `http://127.0.0.1:${main.address().port}`;
}, 10000);

afterAll(async () => {
  await Promise.all([main, other].map((s) => new Promise((r) => s.close(r))));
});

async function withPage(fn, { init } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    if (init) await page.addInitScript(init);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function runSnippet(path, route, { init, wait = 500 } = {}) {
  return withPage(
    async (page) => {
      await page.goto(`${mainUrl}${route}`, { waitUntil: "load" });
      await page.waitForTimeout(wait);
      return page.evaluate(asExpression(path));
    },
    { init }
  );
}

describe("navigation timing", () => {
  it("TTFB-Sub-Parts never reports a negative sub-part on a plain HTTP connection", async () => {
    const r = await runSnippet("Loading/TTFB-Sub-Parts", "/basic");
    const parts = Object.values(r.details.subParts).map((p) => p.value);
    expect(Math.min(...parts)).toBeGreaterThanOrEqual(0);
    // No TLS on http://, so the SSL/TLS phase is zero.
    expect(r.details.subParts.sslTls.value).toBe(0);
  }, 30000);

  // Simulates a prerendered page: the navigation activated 500ms after it started.
  const PRERENDER = () => {
    const nav = {
      activationStart: 500, startTime: 0, responseStart: 600, requestStart: 550, fetchStart: 5,
      workerStart: 0, domainLookupStart: 5, domainLookupEnd: 5, connectStart: 5, connectEnd: 5,
      secureConnectionStart: 0, redirectStart: 0, redirectEnd: 0, responseEnd: 700,
      domContentLoadedEventStart: 900, domContentLoadedEventEnd: 910, loadEventStart: 950, loadEventEnd: 960,
    };
    const realByType = performance.getEntriesByType.bind(performance);
    const realByName = performance.getEntriesByName.bind(performance);
    performance.getEntriesByType = (t) => (t === "navigation" ? [nav] : realByType(t));
    performance.getEntriesByName = (n, t) =>
      n === "first-contentful-paint" ? [{ name: n, startTime: 1500 }] : realByName(n, t);
  };

  it("TTFB subtracts activationStart", async () => {
    const r = await runSnippet("Loading/TTFB", "/basic", { init: PRERENDER });
    expect(r.value).toBe(100);
  }, 30000);

  it("FCP subtracts activationStart", async () => {
    const r = await runSnippet("Loading/FCP", "/basic", { init: PRERENDER });
    expect(r.value).toBe(1000);
  }, 30000);

  it("Event-Processing-Time reports TTFB relative to activationStart", async () => {
    const r = await runSnippet("Loading/Event-Processing-Time", "/basic", { init: PRERENDER });
    expect(r.details.ttfbMs).toBe(100);
  }, 30000);

  it("Event-Processing-Time does not report a negative load time before the load event", async () => {
    const r = await withPage(async (page) => {
      await page.goto(`${mainUrl}/slow-load`, { waitUntil: "commit" });
      await page.waitForTimeout(800);
      return page.evaluate(asExpression("Loading/Event-Processing-Time"));
    });
    expect(r.status).toBe("tracking");
    expect(r.value).toBeUndefined();
  }, 30000);
});

describe("TTFB-Resources", () => {
  it("measures the server wait of a resource, not its absolute start time", async () => {
    const r = await runSnippet("Loading/TTFB-Resources", "/late-resource", { wait: 2500 });
    const fast = r.items.find((i) => i.url.endsWith("/fast.js"));
    expect(fast).toBeDefined();
    // The script was requested ~1.5s after navigation but answered immediately.
    expect(fast.ttfbMs).toBeLessThan(300);
  }, 30000);

  it("reports cross-origin resources whose timing is hidden", async () => {
    const r = await runSnippet("Loading/TTFB-Resources", "/late-resource", { wait: 2500 });
    expect(r.details.corsRestrictedCount).toBe(1);
  }, 30000);
});

describe("resource sizes hidden by Timing-Allow-Origin", () => {
  it.each(["Loading/Script-Loading", "Loading/First-And-Third-Party-Script-Info"])(
    "%s flags scripts whose size is unknown",
    async (path) => {
      const r = await runSnippet(path, "/scripts");
      expect(r.details.sizeUnknownCount).toBeGreaterThanOrEqual(1);
    },
    30000
  );

  it("SVG-Embedded-Bitmap-Analysis does not call an opaque cross-origin SVG 'cached'", async () => {
    const lines = [];
    await withPage(async (page) => {
      page.on("console", (m) => lines.push(m.text()));
      await page.goto(`${mainUrl}/svg`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      await page.evaluate(asExpression("Media/SVG-Embedded-Bitmap-Analysis"));
      await page.waitForTimeout(300);
    });
    const compression = lines.find((l) => l.includes("Compression :"));
    expect(compression).toBeDefined();
    expect(compression).not.toContain("cached");
  }, 30000);
});
