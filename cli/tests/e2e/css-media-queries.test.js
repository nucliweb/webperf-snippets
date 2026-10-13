import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Two stylesheets and a <style> tag. Only min-width queries above 768px count: the max-width and
// print rules are left out
const SHEETS = {
  "/a.css":
    "@media (min-width: 1024px){.a{color:red}}" +
    "@media (min-width: 1024px){.b{color:red;margin:0}}" +
    "@media (min-width: 1200px){.c{padding:1px}}" +
    "@media (max-width: 600px){.m{color:blue}}" +
    "@media print{.p{color:#000}}",
  "/b.css": "@media (min-width: 1024px){.d{color:red}}",
};
const PAGES = {
  "/": `<!DOCTYPE html><html><head><title>mq</title><link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"><style>@media (min-width: 900px){.e{color:red}}</style></head><body><p class="a">x</p></body></html>`,
  "/many": `<!DOCTYPE html><html><head><title>many</title><style>${Array.from({ length: 60 }, (_, i) => `@media (min-width: ${800 + i}px){.x${i}{color:red}}`).join("")}</style></head><body><p>x</p></body></html>`,
  "/none": "<!DOCTYPE html><html><head><title>none</title><style>p{color:red}</style></head><body><p>x</p></body></html>",
};

let browser;
let server;
let base;
let source;

beforeAll(async () => {
  source = loadSnippet("Loading/CSS-Media-Queries-Analysis").trim().replace(/;\s*$/, "");
  browser = await launch();
  server = createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (SHEETS[path]) {
      res.writeHead(200, { "Content-Type": "text/css" });
      return res.end(SHEETS[path]);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGES[path] ?? PAGES["/"]);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((r) => server.close(r));
});

async function run(path) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    const result = await page.evaluate(source);
    const leftover = await page.evaluate(() => typeof window.analyzeCSSPerformanceImpact);
    return { ...result, leftover };
  } finally {
    await page.close();
  }
}

const query = (r, q) => r.items.find((i) => i.mediaQuery === q);

describe("CSS-Media-Queries-Analysis", () => {
  it("lists each distinct query once, with how many rules and stylesheets use it", async () => {
    const r = await run("/");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(3);
    expect(r.items).toHaveLength(3);
    expect(Object.keys(r.items[0]).sort()).toEqual(["bytes", "classes", "files", "mediaQuery", "properties", "rules"]);
    expect(query(r, "(min-width: 1024px)")).toEqual(expect.objectContaining({ rules: 3, files: 2, classes: 3 }));
    expect(query(r, "(min-width: 1200px)")).toEqual(expect.objectContaining({ rules: 1, files: 1 }));
    expect(query(r, "(min-width: 900px)")).toEqual(expect.objectContaining({ rules: 1, files: 1 }));
    // Largest first
    expect(r.items.map((i) => i.bytes)).toEqual([...r.items.map((i) => i.bytes)].sort((a, b) => b - a));
  }, 30000);

  it("sums the rules, distinct queries and bytes, and breaks them down by stylesheet", async () => {
    const r = await run("/");
    const d = r.details;
    expect(d.minWidth).toBe(768);
    expect(d.rules).toBe(5);
    expect(d.totalUnique).toBe(3);
    expect(d.uniquenessRatio).toBe(0.6);
    expect(d.bytes).toBe(r.items.reduce((sum, i) => sum + i.bytes, 0));
    expect(d.bySource).toEqual([
      expect.objectContaining({ source: `${base}/a.css`, inline: false, rules: 2 + 1 }),
      expect.objectContaining({ source: `${base}/b.css`, inline: false, rules: 1 }),
      expect.objectContaining({ source: expect.stringMatching(/<style>/), inline: true, rules: 1 }),
    ]);
    expect(d.corsBlockedCount).toBe(0);
  }, 30000);

  it("reports what it measured, with no estimated impact", async () => {
    const r = await run("/");
    expect(r.details).not.toHaveProperty("performanceImpact");
    expect(r.leftover).toBe("undefined");
    expect(r.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/5 @media rules.*wider than 768px/) })])
    );
    expect(JSON.stringify(r)).not.toMatch(/ — |conversion|Ms"/);
  }, 30000);

  it("keeps at most 50 items and counts all of them", async () => {
    const r = await run("/many");
    expect(r.count).toBe(60);
    expect(r.items).toHaveLength(50);
    expect(r.details.totalUnique).toBe(60);
  }, 30000);

  it("says so when no rule targets wider viewports", async () => {
    const r = await run("/none");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.issues).toEqual([expect.objectContaining({ severity: "info", message: expect.stringMatching(/No @media rules/) })]);
  }, 30000);
});
