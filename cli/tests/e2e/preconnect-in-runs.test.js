import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runSnippets } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";

// A measurement loads the page as a visitor's browser does, preconnects included. Chromium ignores
// <link rel="preconnect"> in a private profile, the one of browser.newContext(), so the runner measures
// in a persistent profile. The reference is the server: it records when each connection opened and
// when the request on it arrived. The image starts 1 s after the load, so a connection that opened
// well before its request is the preconnected one.

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG = readFileSync(resolve(HERE, "../fixtures/hero.png"));

let page;
let images;
let pageUrl;
const requests = [];

beforeAll(async () => {
  const listen = (handler) =>
    new Promise((res) => {
      const s = createServer(handler);
      s.listen(0, "127.0.0.1", () => res(s));
    });
  images = await listen((req, res) => {
    requests.push({ url: req.url, openedMsBefore: Date.now() - req.socket.openedAt });
    res.writeHead(200, { "Content-Type": "image/png", "Timing-Allow-Origin": "*" });
    res.end(PNG);
  });
  images.on("connection", (socket) => {
    socket.openedAt = Date.now();
  });
  const origin = `http://127.0.0.1:${images.address().port}`;
  page = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>p</title><link rel="preconnect" href="${origin}"></head>
<body><h1>Preconnect</h1><script>setTimeout(() => { const i = new Image(); i.src = "${origin}/late.png"; document.body.append(i); }, 1000);</script></body></html>`);
  });
  pageUrl = `http://127.0.0.1:${page.address().port}/`;
}, 30000);

afterAll(async () => {
  await Promise.all([page, images].map((s) => new Promise((r) => s.close(r))));
});

describe("a run of the CLI", () => {
  it("loads the page with its preconnects, as a visitor's browser does", async () => {
    const run = await runSnippets({
      url: pageUrl,
      waitMs: 2000,
      items: [{ id: "Resource-Hints", path: "Loading/Resource-Hints", source: loadSnippet("Loading/Resource-Hints") }],
    });
    // The server: the connection of the image was open long before the image was asked for
    const image = requests.find((r) => r.url === "/late.png");
    expect(image.openedMsBefore).toBeGreaterThan(500);
    // The snippet, from Resource Timing: the image found its connection open
    const result = run.results.find((r) => r.id === "Resource-Hints");
    const preconnect = result.items.find((i) => i.rel === "preconnect");
    expect(preconnect).toEqual(expect.objectContaining({ use: "used", firstUseConnection: "reused" }));
    expect(run.browser).toEqual(expect.objectContaining({ build: "chromium", profile: "persistent" }));
  }, 60000);
});
