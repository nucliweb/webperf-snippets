import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { runSnippets } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name));

// Chrome only exposes these entry types through a PerformanceObserver, so
// performance.getEntriesByType() returns [] for them. The snippets must read
// them with a buffered observer to return real data.
let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        const name = req.url.replace(/^\//, "") || "index.html";
        try {
          const type = name.endsWith(".png") ? "image/png" : "text/html";
          res.writeHead(200, { "Content-Type": type });
          res.end(fixture(name));
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function run(path, fixtureName) {
  const { results } = await runSnippets({
    url: `${baseUrl}/${fixtureName}`,
    items: [{ id: path, path, source: loadSnippet(path) }],
    waitMs: 1500,
  });
  return results[0];
}

describe("snippets that read observer-only entry types", () => {
  it("LCP-Trail returns the LCP candidates", async () => {
    const r = await run("CoreWebVitals/LCP-Trail", "observer-lcp.html");
    expect(r.status).toBe("ok");
    expect(r.details.candidateCount).toBeGreaterThan(0);
  }, 30000);

  it("LCP-Image-Entropy detects the LCP element", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "observer-lcp.html");
    expect(r.status).toBe("ok");
    expect(r.details.lcpImage).not.toBeNull();
  }, 30000);

  it("LCP-Video-Candidate finds an LCP entry", async () => {
    const r = await run("CoreWebVitals/LCP-Video-Candidate", "observer-lcp.html");
    expect(r.error).not.toBe("No LCP entries found");
  }, 30000);

  it("LongTask counts buffered long tasks", async () => {
    const r = await run("Interaction/LongTask", "observer-longtask.html");
    expect(r.count).toBeGreaterThan(0);
    expect(r.details.worstTaskMs).toBeGreaterThanOrEqual(50);
  }, 30000);

  it("Layout-Shift-Loading-and-Interaction returns buffered shifts", async () => {
    const r = await run("Interaction/Layout-Shift-Loading-and-Interaction", "observer-shift.html");
    expect(r.value).toBeGreaterThan(0);
    expect(r.details.shiftCount).toBeGreaterThan(0);
  }, 30000);
});

describe("snippets on browsers without the required entry type", () => {
  const cases = [
    ["CoreWebVitals/CLS", "layout-shift"],
    ["CoreWebVitals/INP", "event"],
    ["CoreWebVitals/LCP", "largest-contentful-paint"],
    ["Interaction/LongTask", "longtask"],
    ["Interaction/Layout-Shift-Loading-and-Interaction", "layout-shift"],
  ];

  it.each(cases)("%s reports unsupported instead of a false 'good'", async (path) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(PerformanceObserver, "supportedEntryTypes", {
          get: () => ["paint", "navigation", "resource"],
        });
      });
      await page.goto(`${baseUrl}/observer-lcp.html`);
      const src = loadSnippet(path).trim().replace(/;\s*$/, "");
      const result = await page.evaluate(src);
      expect(result.status).toBe("unsupported");
    } finally {
      await browser.close();
    }
  }, 30000);
});
