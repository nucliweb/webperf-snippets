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
const CORS_CSS = {
  "/cors.css": `/* A stylesheet of a CDN, loaded without crossorigin */
@import url("cors-imported.css");
.cdn { color: red !important; background: url("data:image/png;base64,iVBORw0KGgo=") no-repeat; }
.cdn-empty {}
@keyframes cdn-spin { to { transform: rotate(1turn); } }
.cdn-spinner { animation: cdn-spin 1s infinite; }`,
  "/cors-imported.css": ".cdn-imported { margin: 0; }",
};

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
  // Another origin: remote.css without Access-Control-Allow-Origin, and two stylesheets with it,
  // one importing the other
  other = await listen((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/cors.css" || path === "/cors-imported.css") {
      res.writeHead(200, { "Content-Type": "text/css", "Access-Control-Allow-Origin": "*" });
      return res.end(CORS_CSS[path]);
    }
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(".remote { color: red; }");
  });
  otherUrl = `http://127.0.0.1:${other.address().port}`;
  main = await listen((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/unreadable.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!DOCTYPE html><title>u</title><link rel="stylesheet" href="${otherUrl}/remote.css"><style>.local { color: blue; } @keyframes local-only { to { opacity: 0; } }</style><h1>u</h1>`);
    }
    if (path === "/cross-origin.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!DOCTYPE html><title>c</title><link rel="stylesheet" href="${otherUrl}/cors.css"><style>.local { color: blue; }</style><h1>c</h1>`);
    }
    if (path === "/extension-link.html") {
      // What a browser extension adds to the page: a <link> to a file of the extension
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end('<!DOCTYPE html><title>x</title><style>.page { color: red; }</style><link rel="stylesheet" href="chrome-extension://abcdefghijklmnopabcdefghijklmnop/inject.css"><h1>x</h1>');
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
      ruleCount: 12,
      embeddedBytes: cssOracle([file("main.css")]).embeddedBytes,
      importCount: 1,
      importantCount: 1,
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

  it("reports an unused @keyframes, and none of the thresholds of duplicates, !important or @font-face below them", async () => {
    const { result } = await run("index.html");
    expect(result.details.unusedKeyframes).toEqual(["fade-old"]);
    expect(result.issues.filter((i) => i.code === "unused-keyframes")).toEqual([
      expect.objectContaining({ severity: "info", target: "fade-old" }),
    ]);
    const codes = result.issues.map((i) => i.code);
    for (const code of ["duplicate-selectors", "important-ratio", "font-face-count"]) expect(codes).not.toContain(code);
  }, 30000);

  it("reports duplicate selectors, !important and @font-face above their thresholds, as css-analyzer counts them", async () => {
    const { result, inline } = await run("thresholds.html");
    const { unusedKeyframes, ...oracle } = cssOracle(inline);
    expect(result.details).toMatchObject(oracle);
    expect(result.details.selectorUniqueness).toBeLessThan(0.66);
    expect(result.details.importantPercent).toBeGreaterThan(13);
    expect(result.details.fontFaceCount).toBe(49);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["duplicate-selectors", "important-ratio", "font-face-count"]));
    for (const code of ["duplicate-selectors", "important-ratio", "font-face-count"]) {
      expect(result.issues.find((i) => i.code === code).severity).toBe("info");
    }
    // css-analyzer reads only the CSS; the snippet also sees the animation of the style attribute
    expect(unusedKeyframes).toEqual(["never", "pulse"]);
    expect(result.details.unusedKeyframes).toEqual(["never"]);
    // The selector above the 90th percentile of complexity, first among the most complex
    const complex = 'html body div#main.content > ul.list li.item:first-child a.link[target="_blank"]:not(.a, .b, .c, .d, .e, .f, .g, .h, .i, .j)::after';
    const complexity = cssOracle([`${complex} {}`]).maxSelectorComplexity;
    expect(complexity).toBeGreaterThan(29);
    expect(result.details.complexSelectors[0]).toEqual({ selectorText: complex, complexity });
    expect(result.issues.filter((i) => i.code === "selector-complexity")).toEqual([
      expect.objectContaining({ severity: "info", target: complex }),
    ]);
  }, 30000);

  // The complexity of css-analyzer for each selector: every part counts 1, a vendor prefix and an
  // attribute value 1 more, and :is(), :where(), :not(), :has() and :nth-child() add the selectors
  // they hold. The CSSOM drops the * of *::selection and writes a nested .b as & .b, so those differ.
  it.each([
    "a", "*", ".a", "#x", ".a .b", ".a > .b", ".a + .b ~ .c", "a[href]", 'a[href^="http"]', "::-webkit-scrollbar",
    "::before", "a:hover", "input:-webkit-autofill", ":where(#x > *)", ":is(.a, .b) .c", ":not(.a)", "img:has(> img)",
    ":has(+ .a)", "li:nth-child(2n+1)", "li:nth-child(2n+1 of .a)", "li:nth-of-type(2)", "li:nth-last-child(1)",
    ":lang(en)", ":dir(rtl)", ":host(.x)", "::slotted(.a)", "::part(label)", "&:hover", ".x\\:hover\\:bg-red:hover",
    '.nav > ul li:not(.a) a[href^="http"]', ":root", ":where(.a, .b, .c)", ".a:not(.b, .c)", "button:focus-visible",
    'html body div#main.content > ul.list li.item:first-child a.link[target="_blank"]::after',
    // Nested pseudo-classes: css-analyzer adds the selectors they hold once more
    ":where(select:is(.a))", ":is(:is(.a))", ":not(:not(.a))", ":where(select:is([multiple], [size])) optgroup option",
    ":host(:is(.a))", ":where(:host(.a))", ":not(:where(:is(.a)))", "li:nth-child(2n of :is(.a))", ":where(:not(.a, .b))",
  ])("gives %s the complexity css-analyzer gives it", async (selector) => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/empty.html`, { waitUntil: "load" });
      await page.evaluate((css) => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      }, `${selector} { color: red; }`);
      const result = await page.evaluate(loadSnippet("Loading/CSS-Complexity").trim().replace(/;\s*$/, ""));
      expect(result.details.ruleCount).toBe(1);
      expect(result.details.maxSelectorComplexity).toBe(cssOracle([`${selector} {}`]).maxSelectorComplexity);
    } finally {
      await page.close();
    }
  }, 30000);

  it("warns when the embedded content is above the 90th percentile of The CSS Selection 2026", async () => {
    const { result, inline } = await run("embedded-large.html");
    expect(result.details.embeddedBytes).toBe(cssOracle(inline).embeddedBytes);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "embedded-content", severity: "warning" }));
    expect(result.issues.map((i) => i.code)).not.toContain("embedded-font");
  }, 30000);

  it("reads a stylesheet of another origin without crossorigin with fetch, and the one it imports, as css-analyzer counts them", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/cross-origin.html`, { waitUntil: "load" });
      const result = await page.evaluate(loadSnippet("Loading/CSS-Complexity").trim().replace(/;\s*$/, ""));
      const inline = await inlineTexts(page);
      expect(result.corsLimitedAnalysis).toBe(false);
      expect(result.details).toMatchObject({ stylesheetCount: 3, fetchedCount: 2, unreadableCount: 0 });
      const { unusedKeyframes, ...oracle } = cssOracle([CORS_CSS["/cors.css"], CORS_CSS["/cors-imported.css"], ...inline]);
      expect(result.details).toMatchObject(oracle);
      expect(result.details.unusedKeyframes).toEqual(unusedKeyframes);
      expect(result.items).toContainEqual(expect.objectContaining({ source: `${otherUrl}/cors.css`, read: "fetched", importCount: 1, importantCount: 1 }));
      expect(result.items).toContainEqual(expect.objectContaining({ source: `${otherUrl}/cors-imported.css`, read: "fetched", ruleCount: 1 }));
      expect(result.issues).toContainEqual(expect.objectContaining({ code: "import", target: `${otherUrl}/cors-imported.css` }));
      expect(result.issues.map((i) => i.code)).not.toContain("unreadable-stylesheets");
      // The requests of the snippet carry the fragment that the resource snippets leave out
      const names = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("cors")));
      expect(names).toEqual(expect.arrayContaining([`${otherUrl}/cors.css#webperf-snippets`, `${otherUrl}/cors-imported.css#webperf-snippets`]));
    } finally {
      await page.close();
    }
  }, 30000);

  it("counts a stylesheet of another origin without CORS as unreadable, and the result as a lower bound", async () => {
    const { result } = await run("unreadable.html");
    expect(result.corsLimitedAnalysis).toBe(true);
    expect(result.details).toMatchObject({ stylesheetCount: 2, unreadableCount: 1, fetchedCount: 0, ruleCount: 1 });
    expect(result.items).toContainEqual({ source: `${otherUrl}/remote.css`, read: "unreadable" });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unreadable-stylesheets", severity: "info" }));
    // The unreadable sheet could use the @keyframes of the page, so none is reported as unused
    expect(result.details.unusedKeyframes).toEqual(["local-only"]);
    expect(result.issues.map((i) => i.code)).not.toContain("unused-keyframes");
  }, 30000);

  // Far above the 9,118 rules of the 90th percentile of homepages in The CSS Selection 2026, and
  // close to its largest homepage, with 210,695
  it("reads a page with 200,000 rules in a few seconds", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/empty.html`, { waitUntil: "load" });
      await page.evaluate((n) => {
        const rules = [];
        for (let i = 0; i < n; i++) {
          const selector = i % 7 === 0 ? `.nav-${i % 300} > ul li:not(.a-${i % 40}) a[href^="http"]` : i % 3 === 0 ? `:is(.btn-${i}, .link-${i}):hover` : `.c-${i}`;
          const rule = `${selector} { color: red; margin: ${i % 8}px auto; padding: 1px${i % 11 === 0 ? " !important" : ""}; }`;
          rules.push(i % 50 === 0 ? `@media (min-width: ${300 + (i % 900)}px) { ${rule} }` : rule);
        }
        const style = document.createElement("style");
        style.textContent = rules.join("\n");
        document.head.append(style);
      }, 200000);
      const { result, ms } = await page.evaluate(async (source) => {
        const start = performance.now();
        const result = await (0, eval)(source);
        return { result, ms: performance.now() - start };
      }, loadSnippet("Loading/CSS-Complexity").trim().replace(/;\s*$/, ""));
      expect(result.status).toBe("ok");
      expect(result.details.ruleCount).toBe(200000);
      expect(result.details.maxSelectorComplexity).toBe(11);
      // About 1.5 s on a laptop; the margin is for a loaded CI runner
      expect(ms).toBeLessThan(10000);
    } finally {
      await page.close();
    }
  }, 120000);

  it("leaves out the stylesheets of browser extensions, which are not part of the page", async () => {
    const { result } = await run("extension-link.html");
    expect(result.details).toMatchObject({ stylesheetCount: 1, extensionCount: 1, unreadableCount: 0, ruleCount: 1 });
    expect(result.corsLimitedAnalysis).toBe(false);
    expect(result.items.map((i) => i.source)).toEqual(["<style> #1"]);
    expect(result.issues.map((i) => i.code)).not.toContain("unreadable-stylesheets");
  }, 30000);

  it("answers with zeros on a page without CSS", async () => {
    const { result } = await run("empty.html");
    expect(result.status).toBe("ok");
    expect(result.count).toBe(0);
    expect(result.details).toMatchObject({ stylesheetCount: 0, extensionCount: 0, ruleCount: 0, embeddedBytes: 0, importCount: 0, selectorUniqueness: 1, importantCount: 0, importantPercent: 0, fontFaceCount: 0, keyframesCount: 0, unusedKeyframes: [], maxSelectorComplexity: 0, commonSelectorComplexity: 0, complexSelectors: [] });
    expect(result.issues).toEqual([]);
  }, 30000);
});
