import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Without Timing-Allow-Origin the browser hides the phases of a cross-origin script (DNS,
// connection, request, response) and reports them as 0, but it still exposes the total.
// The snippet must not turn those hidden phases into numbers.
let browser;
let servers = [];
let pageUrl;

const listen = (handler) =>
  new Promise((res) => {
    const s = createServer(handler);
    s.listen(0, "127.0.0.1", () => {
      servers.push(s);
      res(s);
    });
  });

beforeAll(async () => {
  browser = await launch();
  const slow = (headers) => async (req, res) => {
    await new Promise((r) => setTimeout(r, 300));
    res.writeHead(200, { "Content-Type": "application/javascript", ...headers });
    res.end("window.__x = 1;");
  };
  const hidden = await listen(slow({}));
  const open = await listen(slow({ "Timing-Allow-Origin": "*" }));
  const main = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>` +
        `<script src="http://hidden.localhost:${hidden.address().port}/hidden.js" async></script>` +
        `<script src="http://open.localhost:${open.address().port}/open.js" async></script>` +
        `</head><body><h1>t</h1></body></html>`
    );
  });
  pageUrl = `http://www.app.localhost:${main.address().port}/`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

async function run() {
  const page = await browser.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);
    return await page.evaluate(loadSnippet("Loading/First-And-Third-Party-Script-Timings").trim().replace(/;\s*$/, ""));
  } finally {
    await page.close();
  }
}

describe("First-And-Third-Party-Script-Timings without Timing-Allow-Origin", () => {
  it("reports null phases and keeps the total for a script whose timings are hidden", async () => {
    const r = await run();
    const hidden = r.items.find((i) => i.shortName === "hidden.js");
    expect(hidden.hasTiming).toBe(false);
    expect(hidden.totalMs).toBeGreaterThan(250);
    expect(hidden).toMatchObject({ dnsMs: null, tcpMs: null, requestMs: null, responseMs: null });
  }, 30000);

  it("reports every phase, none of them above the total, for a script that exposes its timings", async () => {
    const r = await run();
    const open = r.items.find((i) => i.shortName === "open.js");
    expect(open.hasTiming).toBe(true);
    for (const phase of ["dnsMs", "tcpMs", "requestMs", "responseMs"]) {
      expect(open[phase]).toBeGreaterThanOrEqual(0);
      expect(open[phase]).toBeLessThanOrEqual(open.totalMs);
    }
    expect(open.requestMs).toBeGreaterThan(200);
  }, 30000);
});
