import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const SNIPPET = "Media/Oversized-Images";
const source = loadSnippet(SNIPPET).trim().replace(/;\s*$/, "");

// Builds a grayscale PNG of random noise, so that its transfer size grows with its pixel count.
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    randomBytes(width).copy(raw, y * (width + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const IMAGES = {
  "/img/1600.png": png(1600, 1200),
  "/img/800.png": png(800, 600),
  "/img/400.png": png(400, 300),
  "/img/200.png": png(200, 150),
  "/img/100.png": png(100, 75),
};

const page = (body, head = "") =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title><style>body{margin:0}${head}</style></head><body>${body}</body></html>`;

const PAGES = {
  "/mixed": page(`
    <img id="big" src="/img/1600.png" style="width:200px;height:150px">
    <img id="ok" src="/img/200.png" style="width:200px;height:150px">
    <img id="blurry" src="/img/100.png" style="width:400px;height:300px">
    <img id="srcset-ok" srcset="/img/200.png 200w, /img/1600.png 1600w" sizes="200px" style="width:200px;height:150px">
    <img id="srcset-bad" srcset="/img/400.png 400w, /img/1600.png 1600w" sizes="100vw" style="width:200px;height:150px">
    <img id="density" srcset="/img/400.png 2x" style="width:200px;height:150px">
    <img id="hidden" src="/img/1600.png?h" style="display:none">
    <img id="zero" src="/img/1600.png?z" style="width:0;height:0">
    <img id="lazy" src="/img/1600.png?l" loading="lazy" style="margin-top:20000px;width:200px;height:150px">
  `),
  "/fit": page(`
    <img id="cover" src="/img/800.png" style="width:200px;height:200px;object-fit:cover">
    <img id="contain" src="/img/800.png" style="width:200px;height:200px;object-fit:contain">
  `),
  "/many": page(
    Array.from({ length: 60 }, (_, i) => `<img src="/img/${i % 2 ? 400 : 800}.png?n=${i}" style="width:50px;height:38px">`).join("")
  ),
  "/none": page('<h1>no images</h1>'),
  "/clean": page('<img id="ok" src="/img/200.png" style="width:200px;height:150px">'),
};

let server;
let base;
let browser;

beforeAll(async () => {
  browser = await chromium.launch();
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      const path = req.url.split("?")[0];
      if (IMAGES[path]) {
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(IMAGES[path]);
      }
      if (PAGES[path]) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(PAGES[path]);
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}, 60000);

afterAll(async () => {
  await browser.close();
  await new Promise((r) => server.close(r));
});

async function run(path, { dpr = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: dpr });
  const p = await context.newPage();
  try {
    await p.goto(`${base}${path}`, { waitUntil: "load" });
    await p.waitForTimeout(200);
    return await p.evaluate(source);
  } finally {
    await context.close();
  }
}

const byId = (r, needle) => r.items.find((i) => i.url.includes(needle) || i.selector.includes(needle));

describe("Oversized-Images", () => {
  it("flags an image far larger than its rendered size, with the pixels wasted", async () => {
    const r = await run("/mixed");
    expect(r.script).toBe("Oversized-Images");
    expect(r.status).toBe("ok");
    const big = byId(r, "#big");
    expect(big.verdict).toBe("oversized");
    expect(big.naturalWidth).toBe(1600);
    expect(big.naturalHeight).toBe(1200);
    expect(big.neededWidth).toBe(200);
    expect(big.neededHeight).toBe(150);
    expect(big.ratio).toBe(8);
    expect(big.wastedPixels).toBe(1600 * 1200 - 200 * 150);
    expect(r.issues.some((i) => i.severity === "warning" && i.message.includes("1600.png"))).toBe(true);
  }, 60000);

  it("does not report a correctly sized image, nor hidden, zero-size or unloaded ones", async () => {
    const r = await run("/mixed");
    expect(byId(r, "#ok")).toBeUndefined();
    expect(byId(r, "#hidden")).toBeUndefined();
    expect(byId(r, "#zero")).toBeUndefined();
    expect(byId(r, "#lazy")).toBeUndefined();
    expect(r.details.skippedHidden).toBe(2);
    expect(r.details.skippedNotLoaded).toBe(1);
  }, 60000);

  it("flags an undersized (blurry) image and wastes no pixels on it", async () => {
    const r = await run("/mixed");
    const blurry = byId(r, "#blurry");
    expect(blurry.verdict).toBe("undersized");
    expect(blurry.ratio).toBe(0.25);
    expect(blurry.wastedPixels).toBe(0);
    expect(blurry.wastedBytes).toBe(0);
    expect(r.details.undersized).toBe(1);
  }, 60000);

  it("uses the file that srcset and sizes picked", async () => {
    const r = await run("/mixed");
    expect(byId(r, "#srcset-ok")).toBeUndefined();
    const bad = byId(r, "#srcset-bad");
    expect(bad.url).toContain("/img/1600.png");
    expect(bad.hasSrcset).toBe(true);
    expect(bad.hasSizes).toBe(true);
  }, 60000);

  it("counts the pixels of the file, not the density-corrected natural size", async () => {
    const one = await run("/mixed", { dpr: 1 });
    const d1 = byId(one, "#density");
    expect(d1.naturalWidth).toBe(400);
    expect(d1.ratio).toBe(2);
    const two = await run("/mixed", { dpr: 2 });
    expect(byId(two, "#density")).toBeUndefined();
  }, 60000);

  it("multiplies the rendered size by devicePixelRatio", async () => {
    const r = await run("/mixed", { dpr: 2 });
    const big = byId(r, "#big");
    expect(big.neededWidth).toBe(400);
    expect(big.ratio).toBe(4);
    expect(r.details.devicePixelRatio).toBe(2);
  }, 60000);

  it("estimates wasted bytes from the transfer size", async () => {
    const r = await run("/mixed");
    const big = byId(r, "#big");
    expect(big.transferBytes).toBeGreaterThan(1_000_000);
    // 1 - (200*150)/(1600*1200) of the file is waste
    expect(big.wastedBytes).toBeGreaterThan(big.transferBytes * 0.98);
    expect(big.wastedBytes).toBeLessThan(big.transferBytes);
    expect(r.details.wastedBytes).toBeGreaterThanOrEqual(big.wastedBytes);
    expect(typeof r.details.wastedBytes).toBe("number");
  }, 60000);

  it("takes object-fit into account", async () => {
    const r = await run("/fit");
    // 800x600 in a 200x200 box: cover scales by 1/3 (max), contain by 1/4 (min)
    const cover = byId(r, "#cover");
    const contain = byId(r, "#contain");
    expect(cover.neededWidth).toBe(267);
    expect(cover.neededHeight).toBe(200);
    expect(contain.neededWidth).toBe(200);
    expect(contain.neededHeight).toBe(150);
  }, 60000);

  it("sorts by waste, caps items at 50 and totals over the whole set", async () => {
    const r = await run("/many");
    expect(r.items.length).toBe(50);
    expect(r.count).toBe(60);
    const wastes = r.items.map((i) => i.wastedPixels);
    expect(wastes).toEqual([...wastes].sort((a, b) => b - a));
    expect(r.details.oversized).toBe(60);
    expect(r.details.wastedPixels).toBe(30 * (800 * 600 - 50 * 38) + 30 * (400 * 300 - 50 * 38));
  }, 60000);

  it("returns items with one shape and no DOM nodes", async () => {
    const r = await run("/mixed");
    const shapes = new Set(r.items.map((i) => Object.keys(i).sort().join(",")));
    expect(shapes.size).toBe(1);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  }, 60000);

  it("reports an ok result with no items on a page without images or with only right-sized ones", async () => {
    for (const path of ["/none", "/clean"]) {
      const r = await run(path);
      expect(r.status).toBe("ok");
      expect(r.count).toBe(0);
      expect(r.items).toEqual([]);
      expect(r.details.wastedBytes).toBe(0);
    }
  }, 60000);

  it("has no issue with a spaced em-dash", async () => {
    const r = await run("/mixed");
    expect(JSON.stringify(r)).not.toContain(" — ");
  }, 60000);
});
