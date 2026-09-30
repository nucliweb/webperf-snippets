import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name));

let server;
let baseUrl;
let browser;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      const name = req.url.replace(/^\//, "");
      try {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(fixture(name));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  browser = await chromium.launch();
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

async function run(fixtureName) {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/${fixtureName}`, { waitUntil: "load" });
    const source = loadSnippet("Interaction/DOM-Size-and-Depth").trim().replace(/;\s*$/, "");
    return await page.evaluate(source);
  } finally {
    await page.close();
  }
}

describe("DOM-Size-and-Depth", () => {
  it("measures nodes, depth and the widest parent, crossing open shadow roots", async () => {
    const r = await run("dom-size.html");
    expect(r.script).toBe("DOM-Size-and-Depth");
    expect(r.status).toBe("ok");
    // 10 document elements + 40 nested + 80 list items + 41 inside the open shadow root
    // + 1 host of a closed shadow root (its content is not reachable)
    expect(r.details.totalElements).toBe(172);
    expect(r.details.shadowRoots).toBe(1);
    // html(1) > body(2) > main(3) > #deep(4) > 40 levels
    expect(r.details.maxDepth).toBe(44);
    expect(r.details.maxChildren).toBe(80);
    expect(r.details.widestParent).toBe("ul#wide");
    expect(r.details.deepestElement).toContain("div.level");
  }, 30000);

  it("reports depth and children issues but no node count issue on a small page", async () => {
    const r = await run("dom-size.html");
    const messages = r.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("depth"))).toBe(true);
    expect(messages.some((m) => m.includes("children"))).toBe(true);
    expect(messages.some((m) => m.includes("nodes"))).toBe(false);
    expect(r.issues.every((i) => ["error", "warning", "info"].includes(i.severity))).toBe(true);
    expect(r.issues.every((i) => !i.message.includes(" — "))).toBe(true);
  }, 30000);

  it("returns serializable, homogeneous items ordered by children, with selectors instead of nodes", async () => {
    const r = await run("dom-size.html");
    expect(r.count).toBe(r.items.length);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(50);
    expect(new Set(r.items.map((i) => Object.keys(i).sort().join(","))).size).toBe(1);
    expect(r.items[0]).toMatchObject({ selector: "ul#wide", children: 80 });
    expect(r.items.every((i, n) => n === 0 || r.items[n - 1].children >= i.children)).toBe(true);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  }, 30000);

  it("flags a huge DOM as an error and survives a 5000-deep tree without recursion", async () => {
    const r = await run("dom-size-huge.html");
    expect(r.status).toBe("ok");
    expect(r.details.totalElements).toBeGreaterThan(6400);
    expect(r.details.maxDepth).toBeGreaterThan(5000);
    const nodeIssue = r.issues.find((i) => i.message.includes("nodes"));
    expect(nodeIssue.severity).toBe("error");
    expect(r.details.deepestElement.length).toBeLessThan(500);
  }, 60000);

  it("reports no issues on a small flat page", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent("<!DOCTYPE html><html><body><p>a</p><p>b</p></body></html>");
      const source = loadSnippet("Interaction/DOM-Size-and-Depth").trim().replace(/;\s*$/, "");
      const r = await page.evaluate(source);
      expect(r.issues).toEqual([]);
      expect(r.details.totalElements).toBe(5);
    } finally {
      await page.close();
    }
  }, 30000);
});
