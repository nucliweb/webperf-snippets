import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// A preconnect opens a connection for one kind of request: without crossorigin, for requests that send
// credentials (images, classic scripts); with crossorigin, for those that do not (fonts, module scripts,
// scripts with crossorigin). Resource Timing does not say which connection a request used, so
// Resource-Hints infers the credentials mode of each request from the DOM. The reference is Chromium:
// CDP says which requests found an open connection. Every request of a page starts in the same tick,
// after the preconnects had time to open, so a request that found one used a preconnected connection.
//
// Chromium only preconnects in a profile that is not off the record, and in the full Chromium: a
// context of browser.newContext() and the headless shell ignore <link rel="preconnect">. Each case runs
// in a persistent context of its own, so that no connection is left from another case.

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT = readFileSync(resolve(HERE, "../fixtures/dm-sans-regular.woff2"));
const PNG = readFileSync(resolve(HERE, "../fixtures/hero.png"));

let page;
let other;
let pageBase;
let otherBase;

const PRECONNECT = {
  plain: (o) => `<link rel="preconnect" href="${o}">`,
  crossorigin: (o) => `<link rel="preconnect" href="${o}" crossorigin>`,
};

// The requests a case can make, all to the other origin. One per credentials mode at most, so that two
// requests never compete for one preconnected connection.
const REQUESTS = {
  img: (o) => `const i = new Image(); i.src = "${o}/a.png"; document.body.append(i);`,
  "script-crossorigin": (o) => `const s = document.createElement("script"); s.src = "${o}/co.js"; s.crossOrigin = "anonymous"; document.head.append(s);`,
  "script-module": (o) => `const s = document.createElement("script"); s.type = "module"; s.src = "${o}/mod.js"; document.head.append(s);`,
  // A font of a stylesheet: Resource Timing reports it with initiatorType "css"
  "css-font": (o) => `const st = document.createElement("style"); st.textContent = "@font-face{font-family:f;src:url(${o}/f.woff2)}p{font-family:f}"; document.head.append(st);`,
  // fetch() without credentials; the snippet cannot tell it from one with credentials
  fetch: (o) => `fetch("${o}/data.json").catch(() => {});`,
};

const CASES = {
  "both-img-module": { hints: ["plain", "crossorigin"], requests: ["img", "script-module"] },
  "both-img": { hints: ["plain", "crossorigin"], requests: ["img"] },
  "plain-module": { hints: ["plain"], requests: ["script-module"] },
  "plain-css-font": { hints: ["plain"], requests: ["css-font"] },
  "crossorigin-img": { hints: ["crossorigin"], requests: ["img"] },
  "crossorigin-script": { hints: ["crossorigin"], requests: ["script-crossorigin"] },
  "plain-fetch": { hints: ["plain"], requests: ["fetch"] },
};

const pageOf = ({ hints, requests }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>c</title>
${hints.map((h) => PRECONNECT[h](otherBase)).join("")}</head><body><p>text</p>
<script>setTimeout(() => { ${requests.map((r) => REQUESTS[r](otherBase)).join(" ")} }, 600);</script></body></html>`;

beforeAll(async () => {
  const listen = (handler) =>
    new Promise((res) => {
      const s = createServer(handler);
      s.listen(0, "127.0.0.1", () => res(s));
    });
  other = await listen((req, res) => {
    const headers = { "Timing-Allow-Origin": "*" };
    if (req.headers.origin) headers["Access-Control-Allow-Origin"] = req.headers.origin;
    if (req.url.endsWith(".woff2")) return res.writeHead(200, { ...headers, "Content-Type": "font/woff2" }), res.end(FONT);
    if (req.url.endsWith(".png")) return res.writeHead(200, { ...headers, "Content-Type": "image/png" }), res.end(PNG);
    if (req.url.endsWith(".json")) return res.writeHead(200, { ...headers, "Content-Type": "application/json" }), res.end("{}");
    res.writeHead(200, { ...headers, "Content-Type": "text/javascript" });
    res.end("window.__o = 1;");
  });
  otherBase = `http://127.0.0.1:${other.address().port}`;
  page = await listen((req, res) => {
    const name = req.url.slice(1).split("?")[0];
    if (!CASES[name]) return res.writeHead(404), res.end();
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(pageOf(CASES[name]));
  });
  pageBase = `http://127.0.0.1:${page.address().port}`;
}, 30000);

afterAll(async () => {
  await Promise.all([page, other].map((s) => new Promise((r) => s.close(r))));
});

const source = loadSnippet("Loading/Resource-Hints").trim().replace(/;\s*$/, "");

// Runs a case: the snippet's result, and the URLs of the requests to the other origin that, according
// to CDP, found an open connection
async function observe(name) {
  const dir = mkdtempSync(join(tmpdir(), "webperf-preconnect-"));
  const context = await chromium.launchPersistentContext(dir, { channel: "chromium" });
  try {
    const tab = context.pages()[0] ?? (await context.newPage());
    const cdp = await context.newCDPSession(tab);
    await cdp.send("Network.enable");
    const reused = new Set();
    cdp.on("Network.responseReceived", ({ response }) => {
      if (response.url.startsWith(otherBase) && response.timing?.connectStart === -1) reused.add(response.url);
    });
    await tab.goto(`${pageBase}/${name}`, { waitUntil: "load" });
    await tab.waitForTimeout(1500);
    const result = await tab.evaluate(source);
    return { result, reused };
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const preconnects = (result) => result.items.filter((i) => i.rel === "preconnect");
const byCrossorigin = (result) => Object.fromEntries(preconnects(result).map((i) => [i.crossorigin ? "crossorigin" : "plain", i]));
const codes = (result) => result.issues.map((i) => i.code);

describe("Resource-Hints, which request uses each preconnect", () => {
  it.each(Object.keys(CASES))("%s: a preconnect is used by the request that Chromium gave its connection to", async (name) => {
    const { result, reused } = await observe(name);
    const used = preconnects(result).filter((i) => i.use === "used").map((i) => i.firstUseUrl);
    expect(new Set(used)).toEqual(reused);
  }, 60000);

  it("tells the two preconnects of an origin apart by the requests each one serves", async () => {
    const { result } = await observe("both-img-module");
    const { plain, crossorigin } = byCrossorigin(result);
    expect(plain).toEqual(expect.objectContaining({ use: "used", firstUseUrl: `${otherBase}/a.png` }));
    expect(crossorigin).toEqual(expect.objectContaining({ use: "used", firstUseUrl: `${otherBase}/mod.js` }));
    expect(plain.firstUseMs).toBeGreaterThan(0);
    expect(codes(result)).not.toContain("preconnect-no-crossorigin");
    expect(codes(result)).not.toContain("unused-preconnect");
  }, 60000);

  it("calls a crossorigin preconnect unused when only requests with credentials go to its origin", async () => {
    const { result } = await observe("both-img");
    const { crossorigin } = byCrossorigin(result);
    expect(crossorigin).toEqual(expect.objectContaining({ use: "unused", firstUseUrl: null, firstUseMs: null }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unused-preconnect", target: `${otherBase}/` }));
  }, 60000);

  it("warns when requests without credentials have no crossorigin preconnect", async () => {
    for (const name of ["plain-module", "plain-css-font"]) {
      const { result } = await observe(name);
      expect(byCrossorigin(result).plain.use).toBe("unused");
      const issues = result.issues.filter((i) => i.code === "preconnect-no-crossorigin");
      expect(issues).toHaveLength(1);
      expect(codes(result)).not.toContain("unused-preconnect");
    }
  }, 120000);

  it("warns when requests with credentials have only a crossorigin preconnect", async () => {
    const { result } = await observe("crossorigin-img");
    expect(byCrossorigin(result).crossorigin.use).toBe("unused");
    expect(codes(result)).toContain("preconnect-crossorigin-only");
    expect(codes(result)).not.toContain("unused-preconnect");
  }, 60000);

  it("does not judge a preconnect when the only requests to its origin are fetch() calls", async () => {
    const { result } = await observe("plain-fetch");
    expect(byCrossorigin(result).plain).toEqual(expect.objectContaining({ use: "unknown", firstUseUrl: null }));
    expect(codes(result).filter((c) => c.startsWith("preconnect") || c === "unused-preconnect")).toEqual([]);
  }, 60000);
});
