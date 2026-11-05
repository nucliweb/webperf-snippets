import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";
import { cssOracle } from "../helpers/css-oracle.js";

// CSS-Complexity reads the CSSOM of every stylesheet of the page: linked, imported, inline, in an
// open shadow root and adopted. Its counts are checked against css-analyzer on the text of the same
// sheets, and a stylesheet of another origin without CORS is counted as unreadable.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/css-complexity");
const file = (name) => readFileSync(join(FIXTURES, name), "utf8");
const TYPES = { ".html": "text/html", ".css": "text/css" };

let main;
let other;
let baseUrl;
let otherUrl;
let browser;

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

beforeAll(async () => {
  // Another origin that serves a stylesheet without Access-Control-Allow-Origin
  other = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(".remote { color: red; }");
  });
  otherUrl = `http://127.0.0.1:${other.address().port}`;
  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/unreadable.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!DOCTYPE html><title>u</title><link rel="stylesheet" href="${otherUrl}/remote.css"><style>.local { color: blue; }</style><h1>u</h1>`);
    }
    if (path === "/empty.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<!DOCTYPE html><title>e</title><h1>No CSS</h1>");
    }
    try {
      const name = path.replace(/^\//, "");
      const body = file(name);
      res.writeHead(200, { "Content-Type": TYPES[name.slice(name.lastIndexOf("."))] ?? "text/plain" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  baseUrl = `http://127.0.0.1:${main.address().port}`;
  browser = await chromium.launch();
}, 30000);

afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => main.close(resolve));
  await new Promise((resolve) => other.close(resolve));
});

// The text of the <style> elements of the document and of its open shadow roots, and of the
// adopted sheets the fixture keeps in window.__css
const inlineTexts = (page) =>
  page.evaluate(() => {
    const roots = [document, ...[...document.querySelectorAll("*")].map((el) => el.shadowRoot).filter(Boolean)];
    const styles = roots.flatMap((root) => [...root.querySelectorAll("style")].map((s) => s.textContent));
    return [...styles, ...(window.__css?.adopted ? [window.__css.adopted] : [])];
  });

async function run(path) {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/${path}`, { waitUntil: "load" });
    const result = await page.evaluate(loadSnippet("Loading/CSS-Complexity").trim().replace(/;\s*$/, ""));
    return { result, inline: await inlineTexts(page) };
  } finally {
    await page.close();
  }
}

describe("CSS-Complexity", () => {
  it("counts the rules, selectors, declarations, embedded content, @import and empty rules of every sheet as css-analyzer does", async () => {
    const { result, inline } = await run("index.html");
    expect(result.script).toBe("CSS-Complexity");
    expect(result.status).toBe("ok");
    expect(result.corsLimitedAnalysis).toBe(false);

    const oracle = cssOracle([file("main.css"), file("imported.css"), ...inline]);
    expect(result.details).toMatchObject(oracle);
    // main.css, imported.css, the inline <style>, the one in the shadow root and the adopted sheet
    expect(result.details.stylesheetCount).toBe(5);
    expect(result.details.unreadableCount).toBe(0);
    expect(result.count).toBe(5);
    expect(result.items.map((i) => i.read)).toEqual(Array(5).fill("cssom"));
  }, 30000);

  it("lists each sheet with its rules, embedded bytes and @import, the heaviest first", async () => {
    const { result } = await run("index.html");
    const [first] = result.items;
    expect(first).toEqual({
      source: `${baseUrl}/main.css`,
      read: "cssom",
      ruleCount: 9,
      embeddedBytes: cssOracle([file("main.css")]).embeddedBytes,
      importCount: 1,
    });
    expect(result.items.map((i) => i.source)).toEqual(
      expect.arrayContaining([`${baseUrl}/imported.css`, "<style> #1", "<style> in the shadow root of div#host", "adopted stylesheet #1"])
    );
  }, 30000);

  it("reports the embedded font, the @import and the empty rules", async () => {
    const { result } = await run("index.html");
    const codes = result.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["embedded-font", "import", "empty-rules"]));
    expect(codes).not.toContain("embedded-content");
    expect(result.issues.find((i) => i.code === "embedded-font")).toMatchObject({ severity: "warning", target: `${baseUrl}/main.css` });
    expect(result.issues.find((i) => i.code === "import")).toMatchObject({ severity: "warning", target: `${baseUrl}/imported.css` });
    expect(result.issues.find((i) => i.code === "empty-rules")).toMatchObject({ severity: "info" });
    expect(result.issues.find((i) => i.code === "empty-rules").message).toMatch(/^4 empty rules/);
  }, 30000);

  it("warns when the embedded content is above the 90th percentile of The CSS Selection 2026", async () => {
    const { result, inline } = await run("embedded-large.html");
    expect(result.details.embeddedBytes).toBe(cssOracle(inline).embeddedBytes);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "embedded-content", severity: "warning" }));
    expect(result.issues.map((i) => i.code)).not.toContain("embedded-font");
  }, 30000);

  it("counts a stylesheet of another origin without CORS as unreadable, and the result as a lower bound", async () => {
    const { result } = await run("unreadable.html");
    expect(result.corsLimitedAnalysis).toBe(true);
    expect(result.details).toMatchObject({ stylesheetCount: 2, unreadableCount: 1, ruleCount: 1 });
    expect(result.items).toContainEqual({ source: `${otherUrl}/remote.css`, read: "unreadable" });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unreadable-stylesheets", severity: "info" }));
  }, 30000);

  it("answers with zeros on a page without CSS", async () => {
    const { result } = await run("empty.html");
    expect(result.status).toBe("ok");
    expect(result.count).toBe(0);
    expect(result.details).toMatchObject({ stylesheetCount: 0, ruleCount: 0, embeddedBytes: 0, importCount: 0 });
    expect(result.issues).toEqual([]);
  }, 30000);
});
