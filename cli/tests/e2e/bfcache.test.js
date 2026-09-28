import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const expression = loadSnippet("Loading/Back-Forward-Cache").trim().replace(/;\s*$/, "");

let server;
let base;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        const path = req.url.split("?")[0];
        const headers = { "Content-Type": "text/html" };
        if (path === "/no-store") headers["Cache-Control"] = "no-store";
        res.writeHead(200, headers);
        const pages = {
          "/clean": "<h1>clean</h1>",
          "/unload-prop": "<h1>unload</h1><script>window.onunload = () => {};</script>",
          "/iframe": '<h1>iframe</h1><iframe src="/frame-clean"></iframe>',
          "/no-store": "<h1>no-store</h1>",
          "/blocked": '<h1>blocked</h1><script>addEventListener("unload", () => {});</script><iframe src="/frame-blocked"></iframe>',
          "/frame-clean": "<p>frame</p>",
          "/frame-blocked": '<p>frame</p><script>addEventListener("unload", () => {});</script>',
        };
        res.end(pages[path] ?? "<h1>other</h1>");
      });
      server.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function withPage(fn, { init } = {}) {
  // Playwright disables bfcache by default; enable it so notRestoredReasons is realistic.
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--disable-back-forward-cache"] });
  try {
    const page = await browser.newPage();
    if (init) await page.addInitScript(init);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const runFresh = (path, opts) =>
  withPage(async (page) => {
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    return page.evaluate(expression);
  }, opts);

describe("Back-Forward-Cache detection", () => {
  it("reports no blockers on a clean page instead of guessing from API availability", async () => {
    const r = await runFresh("/clean");
    expect(r.details.eligibility).toBe("no-blockers-detected");
    expect(r.issues).toEqual([]);
  }, 30000);

  it("treats an onunload handler as a likely blocker", async () => {
    const r = await runFresh("/unload-prop");
    expect(r.details.eligibility).toBe("likely-blocked");
    expect(r.issues.some((i) => i.severity === "error" && /unload/i.test(i.message))).toBe(true);
  }, 30000);

  it("detects Cache-Control: no-store from the response headers", async () => {
    const r = await runFresh("/no-store");
    expect(r.details.eligibility).toBe("likely-blocked");
    expect(r.issues.some((i) => /no-store/i.test(i.message))).toBe(true);
  }, 30000);

  it("only mentions iframes as information, not as a blocker", async () => {
    const r = await runFresh("/iframe");
    expect(r.details.eligibility).toBe("no-blockers-detected");
    expect(r.issues.every((i) => i.severity === "info")).toBe(true);
    expect(r.issues.some((i) => /iframe/i.test(i.message))).toBe(true);
  }, 30000);

  it("does not treat a prerender activation as a bfcache restore", async () => {
    const r = await runFresh("/clean", {
      init: () => {
        const real = performance.getEntriesByType.bind(performance);
        performance.getEntriesByType = (t) =>
          t === "navigation" ? [{ type: "back_forward", activationStart: 500, duration: 100 }] : real(t);
      },
    });
    expect(r.details.wasRestored).toBe(false);
  }, 30000);

  it("returns the notRestoredReasons of the page and of its frames after a back navigation", async () => {
    const r = await withPage(async (page) => {
      await page.goto(`${base}/blocked`);
      await page.goto(`${base}/other`);
      await page.goBack();
      await page.waitForTimeout(500);
      return page.evaluate(expression);
    });
    const nrr = r.details.notRestoredReasons;
    expect(nrr.reasons).toContain("unload-listener");
    expect(nrr.children[0].reasons).toContain("unload-listener");
    expect(r.details.eligibility).toBe("blocked");
    expect(r.issues.some((i) => i.severity === "error" && /unload-listener/.test(i.message) && /frame-blocked/.test(i.message))).toBe(true);
  }, 30000);
});
