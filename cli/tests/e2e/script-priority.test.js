import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Script-Loading estimates the network priority of each script from the DOM, since Resource
// Timing does not expose it. The reference is the priority Chromium gives each request, read
// with CDP: if Chromium changes how it prioritizes scripts, this test fails.
let browser;
let server;
let pageUrl;

const js = (name) => `/js/${name}.js`;

// One script per case. Every URL is unique, so each request maps to one script.
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Script priority</title>
  <link rel="preload" as="script" href="${js("preloaded-async")}">
  <link rel="preload" as="script" href="${js("preloaded-async-low")}" fetchpriority="low">
  <link rel="modulepreload" href="${js("modulepreloaded")}">
  <link rel="modulepreload" href="${js("modulepreloaded-low")}" fetchpriority="low">
  <script src="${js("head-blocking")}"></script>
  <script src="${js("head-blocking-low")}" fetchpriority="low"></script>
  <script src="${js("head-blocking-high")}" fetchpriority="high"></script>
  <script async src="${js("head-async")}"></script>
  <script async src="${js("head-async-low")}" fetchpriority="low"></script>
  <script async src="${js("head-async-high")}" fetchpriority="high"></script>
  <script defer src="${js("head-defer")}"></script>
  <script defer src="${js("head-defer-low")}" fetchpriority="low"></script>
  <script defer src="${js("head-defer-high")}" fetchpriority="high"></script>
  <script type="module" src="${js("head-module")}"></script>
  <script type="module" src="${js("head-module-low")}" fetchpriority="low"></script>
  <script type="module" async src="${js("head-module-async")}"></script>
  <script nomodule src="${js("nomodule")}"></script>
  <script async src="${js("preloaded-async")}"></script>
  <script async src="${js("preloaded-async-low")}"></script>
  <script type="module" src="${js("modulepreloaded")}"></script>
  <script type="module" src="${js("modulepreloaded-low")}"></script>
  <script>
    const a = document.createElement("script"); a.src = "${js("injected")}"; document.head.append(a);
    const b = document.createElement("script"); b.src = "${js("injected-high")}"; b.fetchPriority = "high"; document.head.append(b);
  </script>
</head>
<body>
  <h1>Script priority</h1>
  <script src="${js("body-blocking")}"></script>
  <script src="${js("body-blocking-low")}" fetchpriority="low"></script>
  <img src="/hero.png" width="10" height="10" alt="">
  <script src="${js("late-blocking")}"></script>
  <script src="${js("late-blocking-low")}" fetchpriority="low"></script>
  <script src="${js("late-blocking-high")}" fetchpriority="high"></script>
  <script async src="${js("late-async")}"></script>
  <script type="module" src="${js("late-module")}"></script>
</body>
</html>`;

// The page is on 127.0.0.1; the same server under the host name localhost is a third party.
const ISSUES_PAGE = (third) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Script priority issues</title>
  <link rel="modulepreload" href="${third}/js/vendor-modulepreloaded.js">
  <script type="module" src="${third}/js/vendor-module.js"></script>
  <script type="module" src="${third}/js/vendor-module-low.js" fetchpriority="low"></script>
  <script type="module" src="${third}/js/vendor-modulepreloaded.js" fetchpriority="low"></script>
  <script type="module" src="/js/own-module.js"></script>
  <script async src="${third}/js/vendor-async-high.js" fetchpriority="high"></script>
  <script defer src="${third}/js/vendor-defer-high.js" fetchpriority="high"></script>
  <script async src="${third}/js/vendor-async-low.js" fetchpriority="low"></script>
  <script async src="${third}/js/vendor-async.js"></script>
  <script async src="/js/own-async-high.js" fetchpriority="high"></script>
</head>
<body><h1>Script priority issues</h1></body>
</html>`;

beforeAll(async () => {
  browser = await launch();
  server = await new Promise((res) => {
    const s = createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(PAGE);
      }
      if (req.url === "/issues") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(ISSUES_PAGE(`http://localhost:${s.address().port}`));
      }
      if (req.url === "/hero.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(Buffer.alloc(16));
      }
      res.writeHead(200, { "Content-Type": "text/javascript" });
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

const source = loadSnippet("Loading/Script-Loading").trim().replace(/;\s*$/, "");

// The five levels of Chromium, in the three the snippet reports
const LEVEL = { VeryHigh: "high", High: "high", Medium: "medium", Low: "low", VeryLow: "low" };
const nameOf = (url) => new URL(url).pathname.replace(/^\/js\//, "").replace(/\.js$/, "");

// Loads the page, records the first priority Chromium gives each script request and runs the
// snippet. Returns both, keyed by the name of the script.
async function observe() {
  const page = await browser.newPage();
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const actual = {};
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (!new URL(request.url).pathname.startsWith("/js/")) return;
      const name = nameOf(request.url);
      if (!(name in actual)) actual[name] = LEVEL[request.initialPriority];
    });
    await page.goto(pageUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const result = await page.evaluate(source);
    return { actual, result };
  } finally {
    await page.close();
  }
}

describe("Script-Loading priority", () => {
  it("estimates the priority Chromium gives each script it fetches", async () => {
    const { actual, result } = await observe();
    const estimated = Object.fromEntries(
      result.items.filter((i) => i.url.includes("/js/") && nameOf(i.url) in actual).map((i) => [nameOf(i.url), i.priority])
    );
    // Every script the page fetched is in the result, and nomodule is never fetched
    expect(Object.keys(actual).sort()).toEqual(
      result.items.map((i) => nameOf(i.url)).filter((n) => n !== "nomodule").sort()
    );
    expect(estimated).toEqual(actual);
  }, 30000);

  it("gives no priority to a script the browser never fetches", async () => {
    const { result } = await observe();
    expect(result.items.find((i) => nameOf(i.url) === "nomodule").priority).toBeNull();
  }, 30000);

  it("reports the fetchpriority attribute of each script", async () => {
    const { result } = await observe();
    const byName = Object.fromEntries(result.items.map((i) => [nameOf(i.url), i.fetchpriority]));
    expect(byName["head-module-low"]).toBe("low");
    expect(byName["head-async-high"]).toBe("high");
    expect(byName["injected-high"]).toBe("high");
    expect(byName["head-module"]).toBeNull();
  }, 30000);

  it("counts the scripts of each priority under the Chromium model", async () => {
    const { result } = await observe();
    const count = (p) => result.items.filter((i) => i.priority === p).length;
    expect(result.details.priorityModel).toBe("chromium");
    expect(result.details.byPriority).toEqual({ high: count("high"), medium: count("medium"), low: count("low") });
    expect(result.details.byPriority.high).toBeGreaterThan(0);
  }, 30000);
});

describe("Script-Loading priority issues", () => {
  async function issuesOf() {
    const page = await browser.newPage();
    try {
      await page.goto(`${pageUrl}issues`, { waitUntil: "load" });
      await page.waitForTimeout(400);
      return (await page.evaluate(source)).issues;
    } finally {
      await page.close();
    }
  }
  const targetsOf = (issues, code) => issues.filter((i) => i.code === code).map((i) => nameOf(i.target)).sort();

  it("flags a third-party module script fetched at high priority, one issue per script", async () => {
    const issues = await issuesOf();
    expect(targetsOf(issues, "third-party-module-high-priority")).toEqual(["vendor-module", "vendor-modulepreloaded"]);
    for (const issue of issues.filter((i) => i.code === "third-party-module-high-priority")) {
      expect(issue.severity).toBe("warning");
      expect(issue.message).toContain('fetchpriority="low"');
    }
  }, 30000);

  it("tells to lower the modulepreload of a preloaded module, which sets its priority", async () => {
    const issues = await issuesOf();
    const preloaded = issues.find((i) => i.code === "third-party-module-high-priority" && nameOf(i.target) === "vendor-modulepreloaded");
    expect(preloaded.message).toContain("modulepreload");
  }, 30000);

  it('flags fetchpriority="high" on a third-party async or defer script', async () => {
    const issues = await issuesOf();
    expect(targetsOf(issues, "non-blocking-high-priority")).toEqual(["vendor-async-high", "vendor-defer-high"]);
    for (const issue of issues.filter((i) => i.code === "non-blocking-high-priority")) {
      expect(issue.severity).toBe("warning");
    }
  }, 30000);

  it('says nothing of first-party scripts, nor of a fetchpriority="low" that changes nothing', async () => {
    const issues = await issuesOf();
    const named = issues.filter((i) => i.target).map((i) => nameOf(i.target));
    expect(named).not.toContain("own-module");
    expect(named).not.toContain("own-async-high");
    expect(named).not.toContain("vendor-async-low");
    expect(named).not.toContain("vendor-module-low");
  }, 30000);
});
