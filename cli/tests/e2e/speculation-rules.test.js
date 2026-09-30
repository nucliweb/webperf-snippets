import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name), "utf8");
const PAGES = {
  "/rules": fixture("speculation-rules.html"),
  "/invalid": fixture("speculation-invalid.html"),
  "/none": fixture("speculation-none.html"),
};

const source = loadSnippet("Loading/Speculation-Rules-Inspector").trim().replace(/;\s*$/, "");

let browser;
let server;
let base;

beforeAll(async () => {
  browser = await chromium.launch();
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      const html = PAGES[req.url.split("?")[0]];
      res.writeHead(html ? 200 : 404, { "Content-Type": "text/html" });
      res.end(html ?? "not found");
    });
    server.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

async function run(path) {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    return await page.evaluate(source);
  } finally {
    await page.close();
  }
}

describe("Speculation-Rules-Inspector", () => {
  it("parses the rules of the page into one item per rule", async () => {
    const r = await run("/rules");
    expect(r.script).toBe("Speculation-Rules-Inspector");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(3);
    expect(r.items).toEqual([
      expect.objectContaining({ action: "prerender", source: "list", eagerness: "moderate", urls: ["/next", "/other"] }),
      expect.objectContaining({ action: "prefetch", source: "document", eagerness: "conservative" }),
      expect.objectContaining({ action: "prefetch", source: "list", urls: ["/a", "/b", "/c"] }),
    ]);
    expect(r.details.scriptCount).toBe(1);
    expect(r.details.actions).toEqual({ prerender: 1, prefetch: 2 });
    expect(r.details.prerendering).toBe(false);
    expect(r.details.activationStart).toBe(0);
    expect(r.details.deliveryType).toBe("");
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  }, 60000);

  it("reports an invalid rules script as an error issue", async () => {
    const r = await run("/invalid");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.details.scriptCount).toBe(1);
    expect(r.issues.some((i) => i.severity === "error" && /not valid JSON/i.test(i.message))).toBe(true);
  }, 60000);

  it("reports a page without rules as info", async () => {
    const r = await run("/none");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.details.scriptCount).toBe(0);
    expect(r.issues).toEqual([{ severity: "info", message: expect.stringMatching(/no speculation rules/i) }]);
  }, 60000);

  it("tracks a prerendering page and reports the activation through the getter", async () => {
    const init = () => {
      let prerendering = true;
      Object.defineProperty(document, "prerendering", { configurable: true, get: () => prerendering });
      window.__activate = () => {
        prerendering = false;
        document.dispatchEvent(new Event("prerenderingchange"));
      };
    };
    const page = await browser.newPage();
    try {
      await page.addInitScript(init);
      await page.goto(`${base}/rules`, { waitUntil: "load" });
      const first = await page.evaluate(source);
      expect(first.status).toBe("tracking");
      expect(first.getDataFn).toBe("getSpeculationRulesInspection");
      const before = await page.evaluate("getSpeculationRulesInspection()");
      expect(before.status).toBe("ok");
      expect(before.details.prerendering).toBe(true);
      expect(before.details.activated).toBe(false);
      await page.evaluate(() => window.__activate());
      const after = await page.evaluate("getSpeculationRulesInspection()");
      expect(after.details.prerendering).toBe(false);
      expect(after.details.activated).toBe(true);
      expect(after.count).toBe(3);
    } finally {
      await page.close();
    }
  }, 60000);
});
