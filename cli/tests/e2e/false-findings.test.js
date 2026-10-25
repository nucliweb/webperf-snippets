import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";
import { flatPng, noisePng } from "../helpers/png.js";

// Pages that look like a problem to a naive check and are not one: a nomodule fallback that
// browsers with modules never fetch, framework data that carries the word of an analytics call,
// and images whose bits per pixel depend on the size they are displayed at.

const HERE = dirname(fileURLToPath(import.meta.url));
const IMAGES = {
  // 2000 × 2000 of one color, under 1 KB: 0.001 bits per natural pixel
  "/flat.png": flatPng(2000, 2000),
  // 40 × 40 of noise, about 1.7 KB: 8.5 bits per natural pixel
  "/noise.png": noisePng(40, 40),
};

let server;
let base;
let browser;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (IMAGES[path]) {
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(IMAGES[path]);
    }
    if (path.endsWith(".js")) {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end("window.__loaded = (window.__loaded || []).concat(" + JSON.stringify(path) + ");");
    }
    try {
      const body = readFileSync(join(HERE, "../fixtures", path.slice(1)));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

const source = (name) => loadSnippet(name).trim().replace(/;\s*$/, "");

async function onPage(fixture, fn) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${base}/${fixture}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    return await fn(page);
  } finally {
    await page.close();
  }
}

// The id of the element of Chrome's last LCP entry: what Chrome itself counts as the LCP
const chromeLcpId = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const entries = [];
        const obs = new PerformanceObserver((list) => entries.push(...list.getEntries()));
        obs.observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => {
          obs.disconnect();
          resolve(entries.at(-1)?.element?.id || entries.at(-1)?.element?.tagName.toLowerCase() || null);
        }, 200);
      })
  );

describe("Script-Loading and a nomodule script", () => {
  it("does not count the nomodule script as blocking, and still reports the blocking one", async () => {
    const r = await onPage("scripts-nomodule.html", (page) => page.evaluate(source("Loading/Script-Loading")));
    expect(r.details.byStrategy.blocking).toBe(1);
    expect(r.details.byStrategy.nomodule).toBe(1);
    expect(r.issues).toContainEqual({ code: "blocking-in-head", severity: "error", message: "1 blocking script(s) in <head>" });
    const polyfills = r.items.find((i) => i.shortName === "polyfills.js");
    expect(polyfills.strategy).toBe("nomodule");
    expect(r.items.find((i) => i.shortName === "blocking.js").strategy).toBe("blocking");
  }, 30000);

  it("does not count the nomodule script, which is never fetched, as a script of unknown size", async () => {
    const { r, loaded } = await onPage("scripts-nomodule.html", async (page) => ({
      r: await page.evaluate(source("Loading/Script-Loading")),
      loaded: await page.evaluate(() => window.__loaded),
    }));
    // The browser of the test supports modules, so it never fetched the fallback
    expect(loaded).toEqual(["/blocking.js"]);
    expect(r.details.sizeUnknownCount).toBe(0);
    expect(r.corsLimitedAnalysis).toBe(false);
    expect(r.items.find((i) => i.shortName === "polyfills.js")).toEqual(expect.objectContaining({ sizeBytes: 0, sizeKnown: true }));
  }, 30000);
});

describe("Inline-Script-Info-and-Size and framework data payloads", () => {
  const run = () => onPage("inline-data-payloads.html", (page) => page.evaluate(source("Loading/Inline-Script-Info-and-Size")));
  // Scripts by their position in the page: 1 is the analytics bootstrap in <head>, 2 and 3 the
  // streamed Next.js data, 4 the Nuxt state, 5 the JSON data, 6 a configuration object
  const byIndex = (r, index) => r.items.find((i) => i.index === index);

  it("classifies the analytics bootstrap as analytics", async () => {
    const r = await run();
    expect(byIndex(r, 1)).toEqual(expect.objectContaining({ isAnalytics: true, isDataPayload: false }));
    expect(r.issues).toContainEqual({ code: "analytics-in-head", severity: "warning", message: "1 analytics script(s) blocking in <head>" });
  }, 30000);

  it("classifies data that only mentions an analytics call as data, not analytics or config", async () => {
    const r = await run();
    for (const index of [2, 3, 4]) {
      expect(byIndex(r, index)).toEqual(expect.objectContaining({ isDataPayload: true, isAnalytics: false, isConfig: false }));
    }
    expect(r.details.dataPayloadCount).toBe(4);
  }, 30000);

  it("does not call a configuration object analytics because a key contains the word", async () => {
    const r = await run();
    expect(byIndex(r, 6)).toEqual(expect.objectContaining({ isAnalytics: false, isDataPayload: false, isConfig: true }));
  }, 30000);
});

// Chrome divides the encoded size by the area the image is displayed at, and divides an upscaled
// image by its natural area instead, so stretching never lowers the result. Each test checks the
// snippet against the LCP entries of Chrome itself.
describe("LCP-Image-Entropy and the displayed size", () => {
  it("does not flag a large flat image shown small, which Chrome counts as the LCP", async () => {
    const { lcp, r } = await onPage("entropy-downscaled.html", async (page) => ({
      lcp: await chromeLcpId(page),
      r: await page.evaluate(source("CoreWebVitals/LCP-Image-Entropy")),
    }));
    expect(lcp).toBe("downscaled");
    expect(r.details.lcpImageEligible).toBe(true);
    expect(r.details.lowEntropyCount).toBe(0);
    const item = r.items.find((i) => i.isLCP);
    expect(item).toEqual(expect.objectContaining({ width: 2000, height: 2000, displayedWidth: 200, displayedHeight: 200, isLowEntropy: false }));
    expect(item.bpp).toBeCloseTo((IMAGES["/flat.png"].length * 8) / (200 * 200), 3);
  }, 30000);

  it("does not flag a small detailed image stretched large, which Chrome counts as the LCP", async () => {
    const { lcp, r } = await onPage("entropy-upscaled.html", async (page) => ({
      lcp: await chromeLcpId(page),
      r: await page.evaluate(source("CoreWebVitals/LCP-Image-Entropy")),
    }));
    expect(lcp).toBe("upscaled");
    expect(r.details.lcpImageEligible).toBe(true);
    const item = r.items.find((i) => i.isLCP);
    expect(item).toEqual(expect.objectContaining({ displayedWidth: 900, displayedHeight: 600, isLowEntropy: false }));
    expect(item.bpp).toBeCloseTo((IMAGES["/noise.png"].length * 8) / (40 * 40), 3);
  }, 30000);

  it("flags a flat image at its displayed size, which Chrome skips for the LCP", async () => {
    const { lcp, r } = await onPage("entropy-low.html", async (page) => ({
      lcp: await chromeLcpId(page),
      r: await page.evaluate(source("CoreWebVitals/LCP-Image-Entropy")),
    }));
    expect(lcp).toBe("h1");
    expect(r.details.lowEntropyCount).toBe(1);
    const item = r.items.find((i) => i.url === "flat.png");
    expect(item).toEqual(expect.objectContaining({ isLowEntropy: true, lcpEligible: false, isLCP: false }));
    expect(item.bpp).toBeCloseTo((IMAGES["/flat.png"].length * 8) / (900 * 600), 3);
  }, 30000);
});
