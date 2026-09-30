import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// The page lives on www.app.localhost. cdn.app.localhost shares its root domain (first party),
// other.localhost does not (third party). Chromium resolves every *.localhost name to loopback.
// Both servers send Timing-Allow-Origin so that cross-origin timings are readable.
let browser;
let servers = [];
let pageUrl;
let ipPageUrl;

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
  const asset = await listen((req, res) => {
    res.writeHead(200, {
      "Content-Type": req.url.endsWith(".woff2") ? "font/woff2" : "application/javascript",
      "Timing-Allow-Origin": "*",
      "Access-Control-Allow-Origin": "*",
    });
    res.end("window.__x = 1;");
  });
  const assetPort = asset.address().port;
  const main = await listen((req, res) => {
    const html = (body) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>${body}</head><body><h1>t</h1></body></html>`);
    };
    if (req.url === "/") {
      return html(
        `<script src="/own.js"></script>` +
          `<script src="http://cdn.app.localhost:${assetPort}/cdn.js" async></script>` +
          `<script src="http://other.localhost:${assetPort}/vendor.js" async></script>` +
          `<link rel="preload" as="font" type="font/woff2" crossorigin href="http://cdn.app.localhost:${assetPort}/f.woff2">` +
          `<link rel="preload" as="font" type="font/woff2" crossorigin href="http://other.localhost:${assetPort}/g.woff2">`
      );
    }
    if (req.url === "/ips") {
      // The page is on an IP: the same IP on another port is first party, a host name is not
      return html(
        `<script src="http://127.0.0.1:${assetPort}/same-ip.js" async></script><script src="http://localhost:${assetPort}/named.js" async></script>`
      );
    }
    res.writeHead(200, { "Content-Type": "application/javascript", "Timing-Allow-Origin": "*" });
    res.end("window.__own = 1;");
  });
  const port = main.address().port;
  pageUrl = `http://www.app.localhost:${port}/`;
  ipPageUrl = `http://127.0.0.1:${port}/ips`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

const source = (name) => loadSnippet(name).trim().replace(/;\s*$/, "");

async function run(name, url = pageUrl) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(400);
    return await page.evaluate(source(name));
  } finally {
    await page.close();
  }
}

describe("first and third party across snippets", () => {
  it("First-And-Third-Party-Script-Info groups subdomains of the page's root domain as first party", async () => {
    const r = await run("Loading/First-And-Third-Party-Script-Info");
    expect(r.details.firstPartyCount).toBe(2);
    expect(r.details.thirdPartyCount).toBe(1);
  }, 30000);

  it("First-And-Third-Party-Script-Timings agrees", async () => {
    const r = await run("Loading/First-And-Third-Party-Script-Timings");
    expect(r.details.firstPartyCount).toBe(2);
    expect(r.details.thirdPartyCount).toBe(1);
  }, 30000);

  it("Script-Loading agrees", async () => {
    const r = await run("Loading/Script-Loading");
    expect(r.details.byParty).toEqual({ firstParty: 2, thirdParty: 1 });
  }, 30000);

  it("TTFB-Resources agrees, where it used to compare the exact host name", async () => {
    const r = await run("Loading/TTFB-Resources");
    const party = (file) => r.items.find((i) => i.url.endsWith(file)).isThirdParty;
    expect(party("/own.js")).toBe(false);
    expect(party("/cdn.js")).toBe(false);
    expect(party("/vendor.js")).toBe(true);
  }, 30000);

  it("Fonts-Preloaded-Loaded-and-used-above-the-fold agrees, where it used to compare the exact host name", async () => {
    const r = await run("Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold");
    const third = (family) => r.details.preloadedFonts.find((f) => f.family === family).thirdParty;
    expect(third("f")).toBe(false);
    expect(third("g")).toBe(true);
  }, 30000);

  it("treats the page's own IP as first party and a host name as another party", async () => {
    const r = await run("Loading/First-And-Third-Party-Script-Info", ipPageUrl);
    expect(r.details.firstPartyCount).toBe(1);
    expect(r.details.thirdPartyCount).toBe(1);
  }, 30000);
});
