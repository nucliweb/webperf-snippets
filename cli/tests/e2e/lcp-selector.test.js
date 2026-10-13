import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// The selector of the LCP element has to identify that one element: the DevTools extension of
// the project selects it in Elements with inspect(document.querySelector(selector)).
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

// Runs the snippet once the LCP paragraph is reported, and returns its result plus, for each
// selector it gives, how many elements the selector matches and whether the first is the LCP.
async function runAndResolve(path, pickSelectors) {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/lcp-paragraphs.html`, { waitUntil: "load" });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          new PerformanceObserver((list) => {
            if (list.getEntries().some((e) => e.element?.hasAttribute("data-lcp"))) resolve();
          }).observe({ type: "largest-contentful-paint", buffered: true });
        })
    );
    const result = await page.evaluate(loadSnippet(path).trim().replace(/;\s*$/, ""));
    const matches = await page.evaluate(
      (list) =>
        list.map((selector) => {
          const found = document.querySelectorAll(selector);
          return { selector, count: found.length, isLcp: found[0]?.hasAttribute("data-lcp") ?? false };
        }),
      pickSelectors(result)
    );
    return { result, matches };
  } finally {
    await page.close();
  }
}

describe("the selector of the LCP element matches only that element", () => {
  it("LCP", async () => {
    const { result, matches } = await runAndResolve("CoreWebVitals/LCP", (r) => [r.details.element]);
    expect(result.status).toBe("ok");
    expect(matches).toEqual([{ selector: result.details.element, count: 1, isLcp: true }]);
  });

  it("LCP-Subparts", async () => {
    const { result, matches } = await runAndResolve("CoreWebVitals/LCP-Subparts", (r) => [r.details.element]);
    expect(result.status).toBe("ok");
    expect(matches).toEqual([{ selector: result.details.element, count: 1, isLcp: true }]);
  });

  it("LCP-Trail, for the final element and every candidate", async () => {
    const { result, matches } = await runAndResolve("CoreWebVitals/LCP-Trail", (r) => [
      r.details.finalElement,
      ...r.details.candidates.map((c) => c.selector),
    ]);
    expect(result.status).toBe("ok");
    expect(matches[0]).toEqual({ selector: result.details.finalElement, count: 1, isLcp: true });
    for (const m of matches) expect(m).toMatchObject({ count: 1 });
  });
});
