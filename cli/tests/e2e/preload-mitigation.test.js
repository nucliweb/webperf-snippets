import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// A <link rel="preload"> fetches the script before the <script> asks for it, so the priority is the
// one of the link: fetchpriority="low" on the <script> does not lower it. The reference is the
// priority Chromium gives each request, read with CDP.
let browser;
let server;
let pageUrl;

const js = (name) => `/js/${name}.js`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Preloaded async and defer scripts</title>
  <link rel="preload" as="script" href="${js("async")}">
  <link rel="preload" as="script" href="${js("async-low-on-script")}">
  <link rel="preload" as="script" href="${js("async-low-on-link")}" fetchpriority="low">
  <link rel="preload" as="script" href="${js("async-low-on-both")}" fetchpriority="low">
  <link rel="preload" as="script" href="${js("defer-low-on-script")}">
  <link rel="preload" as="script" href="${js("defer-low-on-link")}" fetchpriority="low">
  <script async src="${js("async")}"></script>
  <script async src="${js("async-low-on-script")}" fetchpriority="low"></script>
  <script async src="${js("async-low-on-link")}"></script>
  <script async src="${js("async-low-on-both")}" fetchpriority="low"></script>
  <script defer src="${js("defer-low-on-script")}" fetchpriority="low"></script>
  <script defer src="${js("defer-low-on-link")}"></script>
</head>
<body><h1>Preloaded async and defer scripts</h1></body>
</html>`;

beforeAll(async () => {
  browser = await launch();
  server = await new Promise((res) => {
    const s = createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(PAGE);
      }
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
// A URL, or the file name items give
const nameOf = (url) => new URL(url, pageUrl).pathname.split("/").pop().replace(/\.js$/, "");

// Loads the page, records the first priority Chromium gives each script and runs the snippet
async function observe() {
  const page = await browser.newPage();
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const priority = {};
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (!new URL(request.url).pathname.startsWith("/js/")) return;
      const name = nameOf(request.url);
      if (!(name in priority)) priority[name] = request.initialPriority;
    });
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const result = await page.evaluate(source);
    return { priority, result };
  } finally {
    await page.close();
  }
}

describe("Validate-Preload-Async-Defer-Scripts and fetchpriority", () => {
  it("flags exactly the preloaded async and defer scripts that Chromium fetches at high priority", async () => {
    const { priority, result } = await observe();
    const high = Object.keys(priority).filter((n) => priority[n] === "High").sort();
    // The reference: only fetchpriority="low" on the preload lowers it
    expect(high).toEqual(["async", "async-low-on-script", "defer-low-on-script"]);
    const flagged = result.issues.filter((i) => i.code === "async-defer-preload").map((i) => nameOf(i.target)).sort();
    expect(flagged).toEqual(high);
  }, 30000);

  it("takes as mitigated the scripts whose preload has fetchpriority=\"low\"", async () => {
    const { priority, result } = await observe();
    const low = Object.keys(priority).filter((n) => priority[n] === "Low").sort();
    expect(low).toEqual(["async-low-on-both", "async-low-on-link", "defer-low-on-link"]);
    const mitigated = result.items.filter((i) => i.type === "mitigated").map((i) => nameOf(i.url)).sort();
    expect(mitigated).toEqual(low);
  }, 30000);

  it("tells to put fetchpriority=\"low\" on the preload, not on the script", async () => {
    const { result } = await observe();
    const issue = result.issues.find((i) => i.code === "async-defer-preload" && nameOf(i.target) === "async-low-on-script");
    expect(issue.message).toMatch(/fetchpriority="low" to the <link rel="preload">/);
    expect(issue.message).not.toMatch(/to the <script>/);
  }, 30000);
});
