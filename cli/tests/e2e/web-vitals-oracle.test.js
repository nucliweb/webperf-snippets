import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// web-vitals is the reference for reading Chrome's metrics: CrUX and most RUM tools report what it
// reports. On the same page, a snippet has to give the same numbers as its attribution build, or a
// developer comparing the console with the field sees two answers.
const HERE = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const WEB_VITALS = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve("web-vitals")), "web-vitals.attribution.iife.js"),
  "utf8"
);
// Values that differ only by the rounding of the snippet
const TOLERANCE = 1;
let browser;
let server;
let base;

const listen = (handler) =>
  new Promise((resolve) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
const html = (body) => `<!DOCTYPE html><html><head><title>p</title></head><body>${body}</body></html>`;
const expression = (name) => loadSnippet(name).trim().replace(/;\s*$/, "");

beforeAll(async () => {
  server = await listen((req, res) => {
    const path = req.url.split("?")[0];
    const page = (body) => res.writeHead(200, { "Content-Type": "text/html" }).end(html(body));
    if (path === "/image") return page(`<img src="/slow.png" width="600" height="400" alt="Product photo">`);
    // The page downloads the image with fetch() first, and shows it half a second later: the same URL
    // has two Resource Timing entries, and only the second one loads the LCP image
    if (path === "/fetched-before")
      return page(`<script>
        fetch("/hero.png?same").then((r) => r.arrayBuffer());
        setTimeout(() => {
          const img = new Image(600, 400);
          img.alt = "Product photo";
          img.src = "/hero.png?same";
          document.body.append(img);
        }, 500);
      </script>`);
    if (path === "/shift")
      return page(`<p>Text before the banner</p><div id="banner" style="height:20px;background:#eee">banner</div><p>Text below</p><p>Text below</p>`);
    // Nothing on this page responds or paints
    if (path === "/inert") return page(`<h1>Inert title</h1>`);
    if (path === "/painted")
      return page(`<button id="work">Work</button><script>
        document.getElementById("work").addEventListener("click", (e) => {
          const end = performance.now() + 80;
          while (performance.now() < end) {}
          e.target.textContent = "Done";
        });
      </script>`);
    if (path === "/slow.png") return setTimeout(() => res.writeHead(200, { "Content-Type": "image/png" }).end(png), 300);
    if (path === "/hero.png") return res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }).end(png);
    res.writeHead(404).end();
  });
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await launch();
}, 30000);

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

// Opens the page with web-vitals listening from the start, as a RUM script would, and keeps the last
// value it reported for each metric in window.__webVitals
async function open(path) {
  const tab = await browser.newPage();
  // An init script runs in its own scope, so the global of the IIFE is set by hand
  await tab.addInitScript({ content: `${WEB_VITALS}\nwindow.webVitals = webVitals;` });
  await tab.addInitScript(() => {
    window.__webVitals = {};
    const keep = (metric) => (window.__webVitals[metric.name] = { value: metric.value, attribution: metric.attribution });
    window.webVitals.onLCP(keep, { reportAllChanges: true });
    window.webVitals.onCLS(keep, { reportAllChanges: true });
    window.webVitals.onINP(keep, { reportAllChanges: true });
  });
  await tab.goto(`${base}${path}`, { waitUntil: "load" });
  return tab;
}

// Waits until the LCP is the image, so that both read the same entry
const imageIsLcp = (tab) =>
  tab.evaluate(
    () =>
      new Promise((resolve) => {
        new PerformanceObserver((list) => {
          if (list.getEntries().some((e) => e.element?.localName === "img")) resolve();
        }).observe({ type: "largest-contentful-paint", buffered: true });
      })
  );

// The last report of web-vitals for a metric, once it has reported a value above 0
async function webVitals(tab, name) {
  const read = () => tab.evaluate((n) => window.__webVitals[n], name);
  await expect.poll(async () => (await read())?.value > 0, { timeout: 5000 }).toBe(true);
  return read();
}

// The INP of both, once both answer. web-vitals reports 0 for an interaction that paints nothing, so
// this waits for a report, not for a value above 0
async function bothInp(tab) {
  await expect
    .poll(() => tab.evaluate(() => [window.getINP().status, window.__webVitals.INP?.value !== undefined]), { timeout: 3000 })
    .toEqual(["ok", true]);
  return { snippet: await tab.evaluate(() => window.getINP()), reference: await webVitalsNow(tab, "INP") };
}

const webVitalsNow = (tab, name) => tab.evaluate((n) => window.__webVitals[n], name);

const expectClose = (actual, expected, label) =>
  expect(Math.abs(actual - expected), `${label}: snippet ${actual}, web-vitals ${expected}`).toBeLessThanOrEqual(TOLERANCE);

// The four subparts of LCP-Subparts against the attribution of web-vitals
function expectSameSubparts(result, attribution) {
  const { subParts } = result.details;
  expectClose(subParts.ttfb.value, attribution.timeToFirstByte, "TTFB");
  expectClose(subParts.resourceLoadDelay.value, attribution.resourceLoadDelay, "Resource Load Delay");
  expectClose(subParts.resourceLoadTime.value, attribution.resourceLoadDuration, "Resource Load Time");
  expectClose(subParts.elementRenderDelay.value, attribution.elementRenderDelay, "Element Render Delay");
}

describe("The snippets give the numbers of web-vitals", () => {
  it("LCP: the same value for an image", async () => {
    const tab = await open("/image");
    try {
      await imageIsLcp(tab);
      const result = await tab.evaluate(expression("CoreWebVitals/LCP"));
      const reference = await webVitals(tab, "LCP");
      expectClose(result.value, reference.value, "LCP");
    } finally {
      await tab.close();
    }
  }, 30000);

  it("LCP-Subparts: the same subparts for an image", async () => {
    const tab = await open("/image");
    try {
      await imageIsLcp(tab);
      const result = await tab.evaluate(expression("CoreWebVitals/LCP-Subparts"));
      const reference = await webVitals(tab, "LCP");
      expectClose(result.value, reference.value, "LCP");
      expectSameSubparts(result, reference.attribution);
    } finally {
      await tab.close();
    }
  }, 30000);

  it("LCP-Subparts: the same subparts when the image URL was downloaded before", async () => {
    const tab = await open("/fetched-before");
    try {
      await imageIsLcp(tab);
      const result = await tab.evaluate(expression("CoreWebVitals/LCP-Subparts"));
      const reference = await webVitals(tab, "LCP");
      expectSameSubparts(result, reference.attribution);
    } finally {
      await tab.close();
    }
  }, 30000);

  it("INP: the same value for a key press that paints nothing, which has no event entry", async () => {
    const tab = await open("/inert");
    try {
      await tab.evaluate(expression("CoreWebVitals/INP"));
      await tab.keyboard.press("a");
      const { snippet, reference } = await bothInp(tab);
      expectClose(snippet.value, reference.value, "INP");
    } finally {
      await tab.close();
    }
  }, 30000);

  it("INP: the same value for a click that paints nothing, with the mouse already on the element", async () => {
    const tab = await open("/inert");
    try {
      await tab.evaluate(expression("CoreWebVitals/INP"));
      const box = await tab.locator("h1").boundingBox();
      await tab.mouse.move(box.x + 5, box.y + 5);
      // The move paints a frame of its own; a click during that frame would be measured to it
      await tab.waitForTimeout(300);
      await tab.mouse.down();
      await tab.mouse.up();
      const { snippet, reference } = await bothInp(tab);
      expectClose(snippet.value, reference.value, "INP");
    } finally {
      await tab.close();
    }
  }, 30000);

  it("INP: the same value for a click that paints", async () => {
    const tab = await open("/painted");
    try {
      await tab.evaluate(expression("CoreWebVitals/INP"));
      await tab.click("#work");
      const { snippet, reference } = await bothInp(tab);
      expect(snippet.value).toBeGreaterThanOrEqual(80);
      expectClose(snippet.value, reference.value, "INP");
    } finally {
      await tab.close();
    }
  }, 30000);

  it("CLS: the same value for a shift after the load", async () => {
    const tab = await open("/shift");
    try {
      await tab.evaluate(expression("CoreWebVitals/CLS"));
      await tab.evaluate(() => {
        document.getElementById("banner").style.height = "300px";
      });
      const reference = await webVitals(tab, "CLS");
      await expect.poll(() => tab.evaluate(() => window.getCLS().value)).toBeGreaterThan(0);
      expectClose((await tab.evaluate(() => window.getCLS())).value * 1000, reference.value * 1000, "CLS × 1000");
    } finally {
      await tab.close();
    }
  }, 30000);

  it("CLS: counts a shift that the page hides before the observer delivers it", async () => {
    const tab = await open("/shift");
    try {
      await tab.evaluate(expression("CoreWebVitals/CLS"));
      // The banner grows in a frame, and the page is hidden right after that frame, before the observer
      // has delivered the shift: the final value has to come from takeRecords(). Headless Chromium does
      // not hide a page, so visibilityState is set by hand.
      await tab.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => {
              document.getElementById("banner").style.height = "300px";
              const channel = new MessageChannel();
              channel.port1.onmessage = () => {
                Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
                document.dispatchEvent(new Event("visibilitychange"));
                resolve();
              };
              channel.port2.postMessage(null);
            });
          })
      );
      const reference = await webVitals(tab, "CLS");
      expectClose((await tab.evaluate(() => window.getCLS())).value * 1000, reference.value * 1000, "CLS × 1000");
    } finally {
      await tab.close();
    }
  }, 30000);
});
