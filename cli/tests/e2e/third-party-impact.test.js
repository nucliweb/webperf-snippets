import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");

// The page lives on www.app.localhost (first party). Chromium resolves every *.localhost name to
// loopback, so one server answers for all the hosts and tells them apart by the Host header:
//   other.localhost         third party, sends Timing-Allow-Origin (sizes readable)
//   pixel.metrics.localhost third party, no Timing-Allow-Origin (sizes hidden)
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let server;
let pageBase;
let port;

beforeAll(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    const html = (body) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>${body}</head><body><h1>t</h1></body></html>`);
    };
    const tp = `http://other.localhost:${port}`;
    const hidden = `http://pixel.metrics.localhost:${port}`;

    if (host === "www.app.localhost") {
      if (path === "/") {
        return html(
          `<script src="/own.js"></script>` +
            `<script src="${tp}/blocking.js?ms=120"></script>` +
            `<script src="${hidden}/pixel.js" async></script>` +
            `<img src="${tp}/pic.png" alt="">`
        );
      }
      if (path === "/heavy") {
        return html(`<script src="${tp}/blocking.js?ms=180"></script><script src="${tp}/blocking.js?ms=180&n=2"></script>`);
      }
      if (path === "/first-party") return html(`<script src="/own.js"></script>`);
      if (path === "/hidden-only") return html(`<script src="${hidden}/pixel.js" async></script>`);
      if (path === "/async-only") return html(`<script src="${tp}/quiet.js" async></script>`);
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end("window.__own = 1;");
    }

    // Third-party hosts
    const headers = host === "other.localhost" ? { "Timing-Allow-Origin": "*" } : {};
    if (path === "/pic.png") {
      res.writeHead(200, { ...headers, "Content-Type": "image/png" });
      return res.end(PNG_1PX);
    }
    if (path === "/blocking.js") {
      const ms = Number(url.searchParams.get("ms"));
      res.writeHead(200, { ...headers, "Content-Type": "application/javascript" });
      return res.end(`(() => { const end = performance.now() + ${ms}; while (performance.now() < end) {} })();`);
    }
    res.writeHead(200, { ...headers, "Content-Type": "application/javascript" });
    res.end("window.__x = 1; // vendor code");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  pageBase = `http://www.app.localhost:${port}`;
}, 10000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

async function run(route, { withoutLoaf = false } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    if (withoutLoaf) {
      await page.addInitScript(() => {
        Object.defineProperty(PerformanceObserver, "supportedEntryTypes", { get: () => ["resource", "navigation"] });
      });
    }
    await page.goto(`${pageBase}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    return await page.evaluate(asExpression("Loading/Third-Party-Impact-by-Domain"));
  } finally {
    await browser.close();
  }
}

async function summaryLine(route) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const lines = [];
    page.on("console", (m) => lines.push(m.text()));
    await page.goto(`${pageBase}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.evaluate(asExpression("Loading/Third-Party-Impact-by-Domain"));
    return lines.find((l) => l.startsWith("Third-party domains:")) || "";
  } finally {
    await browser.close();
  }
}

describe("Third-Party-Impact-by-Domain", () => {
  it("shows the transfer total as a lower bound when some sizes are hidden", async () => {
    expect(await summaryLine("/")).toMatch(/transfer: ≥ \d/);
  }, 30000);

  it("shows the transfer total as unknown, not 0 B, when every size is hidden", async () => {
    const line = await summaryLine("/hidden-only");
    expect(line).toMatch(/transfer: unknown/);
    expect(line).not.toMatch(/0 B/);
  }, 30000);

  it("shows the plain transfer total when every size is known", async () => {
    const line = await summaryLine("/async-only");
    expect(line).toMatch(/transfer: \d/);
    expect(line).not.toMatch(/≥|unknown/);
  }, 30000);

  it("groups third-party requests by root domain and leaves out first party", async () => {
    const r = await run("/");
    expect(r.script).toBe("Third-Party-Impact-by-Domain");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(2);
    expect(r.items.map((i) => i.domain).sort()).toEqual(["metrics.localhost", "other.localhost"]);
    const other = r.items.find((i) => i.domain === "other.localhost");
    expect(other.requests).toBe(2);
    expect(other.transferBytes).toBeGreaterThan(0);
    expect(r.details.firstPartyRequests).toBe(1); // own.js; the document is a navigation entry, not a resource
    expect(r.details.thirdPartyRequests).toBe(3);
  }, 30000);

  it("flags render-blocking domains and sorts them first", async () => {
    const r = await run("/");
    expect(r.items[0].domain).toBe("other.localhost");
    expect(r.items[0].renderBlocking).toBe(true);
    const metrics = r.items.find((i) => i.domain === "metrics.localhost");
    expect(metrics.renderBlocking).toBe(false);
    expect(r.details.blockingDomains).toBe(1);
    expect(r.issues.some((i) => i.severity === "warning" && /render-blocking/.test(i.message) && /other\.localhost/.test(i.message))).toBe(true);
  }, 30000);

  it("attributes Long Animation Frame time to the domain of the script", async () => {
    const r = await run("/");
    expect(r.details.loafSupported).toBe(true);
    const other = r.items.find((i) => i.domain === "other.localhost");
    expect(other.loafMs).toBeGreaterThanOrEqual(100);
    expect(other.loafMs).toBeLessThan(400);
    const metrics = r.items.find((i) => i.domain === "metrics.localhost");
    expect(metrics.loafMs).toBe(0);
  }, 30000);

  it("warns when one domain holds a large share of main-thread time", async () => {
    const r = await run("/heavy");
    const other = r.items.find((i) => i.domain === "other.localhost");
    expect(other.loafMs).toBeGreaterThan(250);
    expect(r.issues.some((i) => i.severity === "warning" && /main-thread/.test(i.message))).toBe(true);
    const light = await run("/");
    expect(light.issues.some((i) => /main-thread/.test(i.message))).toBe(false);
  }, 60000);

  it("counts domains whose sizes are hidden and sets corsLimitedAnalysis", async () => {
    const r = await run("/");
    expect(r.corsLimitedAnalysis).toBe(true);
    expect(r.details.sizeUnknownCount).toBe(1);
    const metrics = r.items.find((i) => i.domain === "metrics.localhost");
    expect(metrics.sizeUnknownCount).toBe(1);
    expect(metrics.transferBytes).toBe(0);
    expect(r.issues.some((i) => i.severity === "info" && /Timing-Allow-Origin/.test(i.message))).toBe(true);
  }, 30000);

  it("leaves corsLimitedAnalysis false when every size is known", async () => {
    const r = await run("/async-only");
    expect(r.corsLimitedAnalysis).toBe(false);
    expect(r.details.sizeUnknownCount).toBe(0);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].renderBlocking).toBe(false);
    expect(r.details.blockingDomains).toBe(0);
  }, 30000);

  it("reports no third parties on a first-party page", async () => {
    const r = await run("/first-party");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.corsLimitedAnalysis).toBe(false);
    expect(r.details.thirdPartyRequests).toBe(0);
  }, 30000);

  it("reports loafSupported false and null time when Long Animation Frames are unavailable", async () => {
    const r = await run("/", { withoutLoaf: true });
    expect(r.status).toBe("ok");
    expect(r.details.loafSupported).toBe(false);
    expect(r.items.every((i) => i.loafMs === null)).toBe(true);
    expect(r.count).toBe(2);
  }, 30000);

  it("returns serializable output with a homogeneous item shape", async () => {
    const r = await run("/");
    expect(() => JSON.stringify(r)).not.toThrow();
    const keys = (o) => Object.keys(o).sort().join();
    expect(new Set(r.items.map(keys)).size).toBe(1);
  }, 30000);
});
