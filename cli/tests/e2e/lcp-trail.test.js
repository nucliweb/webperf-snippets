import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// The element of a largest-contentful-paint entry is null once the node leaves the DOM, as with a
// loading spinner that an app removes when it renders. Its entry still gives the time, the size and
// the URL, so the candidate stays in the trail, and the LCP is the last entry either way.
const HERE = dirname(fileURLToPath(import.meta.url));
let server;
let baseUrl;
let browser;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      try {
        const body = readFileSync(join(HERE, "../fixtures", req.url.replace(/^\//, "")));
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  browser = await chromium.launch();
}, 30000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

describe("LCP-Trail keeps the candidates removed from the DOM", () => {
  it("lists the removed spinner and the text that replaced it, and takes the LCP from the last entry", async () => {
    const page = await browser.newPage();
    const errors = [];
    const logs = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => logs.push(message.text()));
    try {
      await page.goto(`${baseUrl}/lcp-removed.html`, { waitUntil: "load" });
      // Waits for the entry of the text, and reads the time and size of every entry
      const entries = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const all = [];
            new PerformanceObserver((list, observer) => {
              all.push(...list.getEntries());
              if (all.some((e) => e.element?.hasAttribute("data-lcp"))) {
                observer.disconnect();
                resolve(all.map((e) => ({ time: Math.round(e.startTime), size: e.size, url: e.url })));
              }
            }).observe({ type: "largest-contentful-paint", buffered: true });
          })
      );
      expect(entries).toHaveLength(2);

      const result = await page.evaluate(loadSnippet("CoreWebVitals/LCP-Trail").trim().replace(/;\s*$/, ""));
      expect(result.status).toBe("ok");
      expect(result.value).toBe(entries[1].time);
      expect(result.details.candidateCount).toBe(2);
      expect(result.details.finalElement).toBe("p");
      expect(result.details.candidates[0]).toEqual({
        index: 1,
        selector: null,
        removed: true,
        id: "spinner",
        time: entries[0].time,
        elementType: "Image",
        sizePixels: entries[0].size,
        url: "data:image/svg+xml;utf8,…",
      });
      expect(result.details.candidates[1]).toEqual({
        index: 2,
        selector: "p",
        time: entries[1].time,
        elementType: "Text block",
        sizePixels: entries[1].size,
      });

      // The console trail lists both, without failing on the missing element
      expect(errors).toEqual([]);
      expect(logs.some((text) => text.includes("1. (removed from DOM)"))).toBe(true);
      expect(logs.some((text) => text.includes("2. p"))).toBe(true);
    } finally {
      await page.close();
    }
  }, 30000);

  it("takes the LCP from the last entry when its element was removed", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/lcp-removed.html`, { waitUntil: "load" });
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            new PerformanceObserver((list, observer) => {
              if (list.getEntries().some((e) => e.element?.hasAttribute("data-lcp"))) {
                observer.disconnect();
                resolve();
              }
            }).observe({ type: "largest-contentful-paint", buffered: true });
          })
      );
      await page.evaluate(() => document.querySelector("[data-lcp]").remove());

      const result = await page.evaluate(loadSnippet("CoreWebVitals/LCP-Trail").trim().replace(/;\s*$/, ""));
      expect(result.status).toBe("ok");
      expect(result.details.candidateCount).toBe(2);
      expect(result.details.finalElement).toBeNull();
      expect(result.details.candidates.map((c) => c.removed)).toEqual([true, true]);
      expect(result.details.candidates[1].elementType).toBe("Removed element");
      expect(result.value).toBe(result.details.candidates[1].time);
    } finally {
      await page.close();
    }
  }, 30000);
});
