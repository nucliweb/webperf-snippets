import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// The page lives on www.app.localhost. cdn.app.localhost shares its root domain (first party),
// other.localhost does not. Listing other.localhost in OWN_DOMAINS makes it first party, the way
// a site's own CDN on another root domain (bbc.co.uk and bbci.co.uk) has to be declared.
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
  const asset = await listen((req, res) => {
    // /notao/ answers without Timing-Allow-Origin, so the browser hides its sizes (a CORS-limited resource)
    const headers = {
      "Content-Type": req.url.endsWith(".woff2") ? "font/woff2" : "application/javascript",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    };
    if (!req.url.startsWith("/notao/")) headers["Timing-Allow-Origin"] = "*";
    res.writeHead(200, headers);
    res.end("window.__x = 1;");
  });
  const assetPort = asset.address().port;
  const main = await listen((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title>` +
          `<script src="/own.js"></script>` +
          `<script src="http://cdn.app.localhost:${assetPort}/cdn.js" async></script>` +
          `<script src="http://other.localhost:${assetPort}/vendor.js" async></script>` +
          `<script src="http://other.localhost:${assetPort}/notao/hidden.js" async></script>` +
          `<link rel="preload" as="font" type="font/woff2" crossorigin href="http://other.localhost:${assetPort}/g.woff2">` +
          `</head><body><h1>t</h1></body></html>`
      );
    }
    res.writeHead(200, { "Content-Type": "application/javascript", "Timing-Allow-Origin": "*" });
    res.end("window.__own = 1;");
  });
  pageUrl = `http://www.app.localhost:${main.address().port}/`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

// Runs the snippet with OWN_DOMAINS set to `own`, and returns the result with every console line
async function run(name, own) {
  const source = loadSnippet(name).trim().replace(/;\s*$/, "");
  expect(source).toContain("const OWN_DOMAINS = [];");
  const page = await browser.newPage();
  try {
    const lines = [];
    page.on("console", (m) => lines.push(m.text()));
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const result = await page.evaluate(source.replace("const OWN_DOMAINS = [];", `const OWN_DOMAINS = ${JSON.stringify(own)};`));
    return { result, lines };
  } finally {
    await page.close();
  }
}

const OWN = ["https://Other.Localhost/assets/"];

const CASES = [
  {
    name: "Loading/First-And-Third-Party-Script-Info",
    parties: (r) => ({ first: r.details.firstPartyCount, third: r.details.thirdPartyCount }),
  },
  {
    name: "Loading/First-And-Third-Party-Script-Timings",
    parties: (r) => ({ first: r.details.firstPartyCount, third: r.details.thirdPartyCount }),
  },
  {
    name: "Loading/Script-Loading",
    parties: (r) => ({ first: r.details.byParty.firstParty, third: r.details.byParty.thirdParty }),
  },
  {
    name: "Loading/TTFB-Resources",
    parties: (r) => ({
      first: r.items.filter((i) => !i.isThirdParty).length,
      third: r.items.filter((i) => i.isThirdParty).length,
    }),
  },
  {
    name: "Loading/Cache-Strategy-Analysis",
    // A third-party resource without Timing-Allow-Origin counts as CORS-limited, a first-party one does not
    parties: (r) => ({ first: -r.details.corsRestricted, third: r.details.corsRestricted }),
  },
  {
    name: "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold",
    parties: (r) => ({
      first: r.details.preloadedFonts.filter((f) => !f.thirdParty).length,
      third: r.details.preloadedFonts.filter((f) => f.thirdParty).length,
    }),
  },
];

describe.each(CASES)("$name", ({ name, parties }) => {
  it("counts the domains listed in OWN_DOMAINS as first party, accepting URLs and mixed case", async () => {
    const before = parties((await run(name, [])).result);
    const after = parties((await run(name, OWN)).result);
    expect(before.third).toBeGreaterThan(0);
    expect(after.third).toBeLessThan(before.third);
    expect(after.first).toBeGreaterThan(before.first);
    expect(after.first + after.third).toBe(before.first + before.third);
  }, 60000);

  it("explains how to set OWN_DOMAINS when the list is empty and a third party exists", async () => {
    const { lines } = await run(name, []);
    const message = lines.find((l) => l.includes("OWN_DOMAINS is empty"));
    expect(message).toBeDefined();
    expect(message).toMatch(/const OWN_DOMAINS = \[/);
  }, 60000);

  it("drops the message once the domain is listed", async () => {
    const { lines } = await run(name, OWN);
    expect(lines.some((l) => l.includes("OWN_DOMAINS is empty"))).toBe(false);
  }, 60000);
});
