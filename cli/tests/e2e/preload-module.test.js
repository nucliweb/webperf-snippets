import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// A module script is fetched in CORS mode. A <link rel="preload" as="script"> without crossorigin
// is not, so Chromium does not use it for the module and fetches the file again. The reference is
// the number of requests Chromium makes for each file, read with CDP.
let browser;
let server;
let pageUrl;

const js = (name) => `/js/${name}.js`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Preloaded modules</title>
  <link rel="preload" as="script" href="${js("module")}">
  <link rel="preload" as="script" href="${js("module-async")}">
  <link rel="preload" as="script" href="${js("module-cors")}" crossorigin>
  <link rel="preload" as="script" href="${js("module-credentials")}" crossorigin="use-credentials">
  <link rel="preload" as="script" href="${js("classic-async")}">
  <script type="module" src="${js("module")}"></script>
  <script type="module" async src="${js("module-async")}"></script>
  <script type="module" src="${js("module-cors")}"></script>
  <script type="module" src="${js("module-credentials")}"></script>
  <script async src="${js("classic-async")}"></script>
</head>
<body><h1>Preloaded modules</h1></body>
</html>`;

beforeAll(async () => {
  browser = await launch();
  server = await new Promise((res) => {
    const s = createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(PAGE);
      }
      // No cache headers: a second fetch of the file goes to the network
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      res.end("window.__s = 1;");
    });
    s.listen(0, "127.0.0.1", () => res(s));
  });
  pageUrl = `http://127.0.0.1:${server.address().port}/`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((r) => server.close(r));
});

const source = loadSnippet("Loading/Validate-Preload-Async-Defer-Scripts").trim().replace(/;\s*$/, "");
const nameOf = (url) => new URL(url).pathname.replace(/^\/js\//, "").replace(/\.js$/, "");

// Loads the page, counts the requests for each script and runs the snippet
async function observe() {
  const page = await browser.newPage();
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = {};
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (!new URL(request.url).pathname.startsWith("/js/")) return;
      const name = nameOf(request.url);
      requests[name] = (requests[name] ?? 0) + 1;
    });
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const result = await page.evaluate(source);
    return { requests, result };
  } finally {
    await page.close();
  }
}

const targetsOf = (issues, code) => issues.filter((i) => i.code === code).map((i) => nameOf(i.target)).sort();

describe("Validate-Preload-Async-Defer-Scripts on module scripts", () => {
  it("flags exactly the preloaded modules that Chromium fetches twice", async () => {
    const { requests, result } = await observe();
    const modules = ["module", "module-async", "module-cors", "module-credentials"];
    const fetchedTwice = modules.filter((m) => requests[m] === 2).sort();
    // The reference: without crossorigin, or with another credentials mode, the preload is not used
    expect(fetchedTwice).toEqual(["module", "module-async", "module-credentials"]);
    expect(requests["module-cors"]).toBe(1);
    expect(targetsOf(result.issues, "module-preload")).toEqual(fetchedTwice);
  }, 30000);

  it("says the module fetches the file again, not that its priority rises", async () => {
    const { result } = await observe();
    const issue = result.issues.find((i) => i.code === "module-preload" && nameOf(i.target) === "module");
    expect(issue.severity).toBe("warning");
    expect(issue.message).toMatch(/twice|again/);
    expect(issue.message).toContain("modulepreload");
    expect(issue.message).not.toMatch(/priority/i);
  }, 30000);

  it("takes an async module as a module, not as an async script whose priority rises", async () => {
    const { result } = await observe();
    expect(targetsOf(result.issues, "async-defer-preload")).toEqual(["classic-async"]);
  }, 30000);

  it("reports no module at a low priority", async () => {
    const { result } = await observe();
    const moduleItems = result.items.filter((i) => i.url.startsWith("module"));
    expect(moduleItems.length).toBeGreaterThan(0);
    for (const item of moduleItems) expect(item.reviewNote).not.toMatch(/low/i);
  }, 30000);
});
