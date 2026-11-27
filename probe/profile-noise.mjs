// Probe, not part of the repository: how much the browser profile of the CLI moves its timings on a
// GitHub runner. Each worker measures the LCP of two local pages, in turns, with Chromium in a private
// profile (browser.newContext, the CLI up to 1.19), in a persistent profile on disk (the CLI 1.20, under
// os.tmpdir()) and in a persistent profile in /dev/shm (memory). Every mode sees the same machine, since
// the modes alternate. Usage: node profile-noise.mjs <runs> <label>, one JSON line per measurement.
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const runs = Number(process.argv[2] ?? 10);
const label = process.argv[3] ?? "w";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// late: a heading that appears after a 2.7 s timer, as the fixture of mcp-workflow.test.js; its LCP
// moves with the main thread. product: an image, as the /product page of mcp-baseline.test.js.
const server = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    if (req.url === "/late") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end('<!DOCTYPE html><title>late</title><p>.</p><script>setTimeout(() => { document.body.innerHTML = \'<h1 style="font-size:80px">A late heading</h1>\'; }, 2700);</script>');
    }
    if (req.url === "/product") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end('<!DOCTYPE html><title>Product</title><h1>Product</h1><img src="/hero.png" width="600" height="400" alt="">');
    }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    res.end(PNG);
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
const lcp = () =>
  new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      resolve(entries[entries.length - 1].startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

async function open(mode) {
  if (mode === "private") {
    const browser = await chromium.launch({ channel: "chromium" });
    const context = await browser.newContext();
    return { page: await context.newPage(), close: () => browser.close() };
  }
  const dir = mkdtempSync(join(mode === "shm" ? "/dev/shm" : tmpdir(), "webperf-probe-"));
  const context = await chromium.launchPersistentContext(dir, { channel: "chromium" });
  return {
    page: context.pages()[0] ?? (await context.newPage()),
    close: async () => {
      await context.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const MODES = ["private", "disk", "shm"];
for (let i = 0; i < runs; i++) {
  // A different mode goes first in each round
  const order = MODES.map((_, k) => MODES[(i + k) % MODES.length]);
  for (const mode of order) {
    for (const path of ["/late", "/product"]) {
      const started = Date.now();
      const { page, close } = await open(mode);
      const launchMs = Date.now() - started;
      await page.goto(base + path, { waitUntil: "load" });
      await page.waitForTimeout(path === "/late" ? 3500 : 500);
      const value = await page.evaluate(lcp);
      await close();
      console.log(JSON.stringify({ label, mode, page: path.slice(1), launchMs, lcp: Math.round(value) }));
    }
  }
}
server.close();
