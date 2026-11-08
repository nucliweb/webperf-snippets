import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// A carousel that fills in its slides with JavaScript leaves <img> without src or srcset in the page.
// They load nothing yet, so the checks of one image (its format, its loading, its dimensions) say
// nothing about them, and one by one they buried the issues that matter. Image-Element-Audit counts
// them and names the practice once.
const HERE = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(HERE, "../fixtures/hero.png"));
const EMPTY_SLIDES = 30;

const slides = Array.from({ length: EMPTY_SLIDES }, (_, i) =>
  i % 3 === 0 ? `<img loading="lazy" data-src="/hero.png?slide=${i}" alt="">` : i % 3 === 1 ? `<img src="" loading="lazy" alt="">` : `<img loading="lazy" alt="">`
).join("");
const PAGE = `<!DOCTYPE html><html><head><title>Carousel</title></head><body>
<img id="hero" src="/hero.png" width="600" height="400" alt="hero">
<div style="height:1500px"></div>
<div class="carousel">${slides}</div>
<img id="srcset-only" srcset="/hero.png?srcset 1x" loading="lazy" width="300" height="200" alt="srcset">
<picture id="pic"><source srcset="/hero.png?source" type="image/png"><img loading="lazy" width="300" height="200" alt="picture"></picture>
</body></html>`;

let browser;
let server;
let base;

beforeAll(async () => {
  browser = await launch();
  server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      if (req.url.startsWith("/hero.png")) return res.writeHead(200, { "Content-Type": "image/png" }).end(png);
      res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

async function audit() {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForTimeout(600);
    return await page.evaluate(loadSnippet("Media/Image-Element-Audit").trim().replace(/;\s*$/, ""));
  } finally {
    await page.close();
  }
}

describe("Image-Element-Audit, images without src", () => {
  it("counts them in details and leaves them out of the images it audits one by one", async () => {
    const r = await audit();
    expect(r.details.totalImages).toBe(EMPTY_SLIDES + 3);
    expect(r.count).toBe(EMPTY_SLIDES + 3);
    expect(r.details.withoutSrc).toBe(EMPTY_SLIDES);
    expect(r.items.every((item) => item.url !== "")).toBe(true);
    expect(r.issues.filter((i) => i.message.startsWith("(no src)"))).toEqual([]);
  }, 30000);

  it("names the practice once, with how many there are", async () => {
    const r = await audit();
    const found = r.issues.filter((i) => i.code === "images-without-src");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "info", message: expect.stringMatching(new RegExp(`^${EMPTY_SLIDES} <img> .*src.*loading="lazy".*width`)) });
  }, 30000);

  it("still audits an image with only srcset, and one whose <picture> gives the URL", async () => {
    const r = await audit();
    const selectors = r.items.map((item) => item.selector);
    expect(selectors).toContain("#srcset-only");
    expect(selectors.some((s) => s.startsWith("#pic"))).toBe(true);
  }, 30000);
});
