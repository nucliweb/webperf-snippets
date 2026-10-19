import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// The Resource Load Time of LCP-Subparts splits into the wait for the server and the download of
// the image: a slow server and a heavy image take the same time, and need different fixes.
const HERE = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const DELAY = 600;
let browser;
let main;
let other;
let base;

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
const close = (server) => new Promise((resolve) => server.close(resolve));
const page = (src) =>
  `<!DOCTYPE html><html><head><title>p</title></head><body><img src="${src}" width="600" height="400" alt="Product photo"></body></html>`;

beforeAll(async () => {
  // Another origin, which sends no Timing-Allow-Origin: Resource Timing hides when its response starts
  other = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(png);
  });
  const otherBase = `http://127.0.0.1:${other.address().port}`;
  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/slow-server") return res.writeHead(200, { "Content-Type": "text/html" }).end(page("/waiting.png"));
    if (path === "/slow-download") return res.writeHead(200, { "Content-Type": "text/html" }).end(page("/trickle.png"));
    if (path === "/cross-origin") return res.writeHead(200, { "Content-Type": "text/html" }).end(page(`${otherBase}/image.png`));
    // The server waits before it answers
    if (path === "/waiting.png") return setTimeout(() => res.writeHead(200, { "Content-Type": "image/png" }).end(png), DELAY);
    // The server answers at once and sends the body in pieces
    if (path === "/trickle.png") {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length });
      const pieces = 6;
      const size = Math.ceil(png.length / pieces);
      let sent = 0;
      const next = () => {
        res.write(png.subarray(sent * size, (sent + 1) * size));
        if (++sent < pieces) setTimeout(next, DELAY / pieces);
        else res.end();
      };
      return next();
    }
    res.writeHead(404).end();
  });
  base = `http://127.0.0.1:${main.address().port}`;
  browser = await launch();
}, 30000);

afterAll(async () => {
  await browser?.close();
  await Promise.all([main, other].filter(Boolean).map(close));
});

// Runs LCP-Subparts once the image is the LCP, and returns its result and the console lines
async function run(path) {
  const tab = await browser.newPage();
  const lines = [];
  tab.on("console", (m) => lines.push(m.text()));
  try {
    await tab.goto(`${base}${path}`, { waitUntil: "load" });
    await tab.evaluate(
      () =>
        new Promise((resolve) => {
          new PerformanceObserver((list) => {
            if (list.getEntries().some((e) => e.element?.localName === "img")) resolve();
          }).observe({ type: "largest-contentful-paint", buffered: true });
        })
    );
    const result = await tab.evaluate(loadSnippet("CoreWebVitals/LCP-Subparts").trim().replace(/;\s*$/, ""));
    await expect.poll(() => lines.some((l) => l.includes("Slowest phase")), { timeout: 5000 }).toBe(true);
    const focus = lines.slice(lines.findIndex((l) => l.includes("Slowest phase")));
    return { result, focus: focus.slice(0, 4).join("\n") };
  } finally {
    await tab.close();
  }
}

describe("LCP-Subparts splits the Resource Load Time", () => {
  it("into a long wait and a short download when the server is slow", async () => {
    const { result, focus } = await run("/slow-server");
    const load = result.details.subParts.resourceLoadTime;
    expect(result.details.slowestPhase).toBe("resourceLoadTime");
    expect(load.waiting).toBeGreaterThanOrEqual(DELAY - 50);
    expect(load.download).toBeLessThan(100);
    expect(Math.abs(load.waiting + load.download - load.value)).toBeLessThanOrEqual(1);
    expect(focus).toMatch(/server/i);
    expect(focus).not.toMatch(/compress/i);
  }, 30000);

  it("into a short wait and a long download when the image arrives slowly", async () => {
    const { result, focus } = await run("/slow-download");
    const load = result.details.subParts.resourceLoadTime;
    expect(result.details.slowestPhase).toBe("resourceLoadTime");
    expect(load.download).toBeGreaterThanOrEqual(DELAY - 150);
    expect(load.waiting).toBeLessThan(100);
    expect(focus).toMatch(/compress/i);
  }, 30000);

  it("not at all when another origin hides its timing", async () => {
    const { result } = await run("/cross-origin");
    const load = result.details.subParts.resourceLoadTime;
    expect(load).not.toHaveProperty("waiting");
    expect(load).not.toHaveProperty("download");
  }, 30000);
});
