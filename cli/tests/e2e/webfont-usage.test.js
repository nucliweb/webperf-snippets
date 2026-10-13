import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launch } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const html = readFileSync(join(FIXTURES, "webfonts.html"));
const font = readFileSync(join(FIXTURES, "dm-sans-regular.woff2"));

let browser;
let server;
let other;
let base;
let otherBase;
let source;

beforeAll(async () => {
  source = loadSnippet("Loading/Webfont-Usage-Analyzer").trim().replace(/;\s*$/, "");
  browser = await launch();
  // Second origin: the font loads (CORS allowed) but sends no Timing-Allow-Origin, so its size reads as zero
  other = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "font/woff2", "Access-Control-Allow-Origin": "*" });
    res.end(font);
  });
  await new Promise((r) => other.listen(0, "127.0.0.1", r));
  otherBase = `http://127.0.0.1:${other.address().port}`;
  server = createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/font.woff2") {
      res.writeHead(200, { "Content-Type": "font/woff2" });
      return res.end(font);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    if (path === "/cross-origin") {
      return res.end(
        `<!DOCTYPE html><html><head><title>c</title><style>@font-face { font-family: "Remote"; src: url("${otherBase}/font.woff2") format("woff2"); font-display: swap; } body { font-family: "Remote", sans-serif }</style></head><body><h1>Remote font</h1></body></html>`
      );
    }
    if (path === "/duplicates") {
      // Two stylesheets declare the same faces with different files, as when a page and a shared header
      // each bring their own copy. "Shadowed" only loads its later declaration; "Twice" loads all three,
      // since the script loads the earlier two directly, and those two share a file; "Unneeded" is
      // declared twice and nothing uses it
      return res.end(`<!DOCTYPE html><html><head><title>d</title>
<style>
@font-face { font-family: "Shadowed"; src: url("/font.woff2?shadowed-first") format("woff2"); }
@font-face { font-family: "Twice"; src: url("/font.woff2?twice-first") format("woff2"); }
@font-face { font-family: "Twice"; src: url("/font.woff2?twice-first") format("woff2"); }
@font-face { font-family: "Unneeded"; src: url("/font.woff2?unneeded-first") format("woff2"); }
</style>
<style>
@font-face { font-family: "Shadowed"; src: url("/font.woff2?shadowed-second") format("woff2"); }
@font-face { font-family: "Twice"; src: url("/font.woff2?twice-second") format("woff2"); }
@font-face { font-family: "Unneeded"; src: url("/font.woff2?unneeded-second") format("woff2"); }
h1 { font-family: "Shadowed", sans-serif } h2 { font-family: "Twice", sans-serif }
</style></head><body><h1>Shadowed text</h1><h2>Twice text</h2>
<script>[...document.fonts].filter((f) => f.family === "Twice").slice(0, 2).forEach((f) => f.load());</script>
</body></html>`);
    }
    if (path === "/empty") {
      return res.end("<!DOCTYPE html><html><head><title>e</title></head><body><h1>No web fonts</h1></body></html>");
    }
    res.end(html);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((r) => server.close(r));
  await new Promise((r) => other.close(r));
});

async function run(path) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(source);
  } finally {
    await page.close();
  }
}

const face = (r, family, extra = {}) =>
  r.items.find((i) => i.family === family && Object.entries(extra).every(([k, v]) => i[k] === v));

describe("Webfont-Usage-Analyzer", () => {
  it("classifies every declared face as used, loaded but unused, or never loaded", async () => {
    const r = await run("/");
    expect(r.script).toBe("Webfont-Usage-Analyzer");
    expect(r.status).toBe("ok");
    // Items are the faces that downloaded; the ones that never loaded cost nothing and are only named
    expect(r.count).toBe(5);
    expect(r.items).toHaveLength(5);
    expect(r.items.every((i) => i.status === "loaded")).toBe(true);
    expect(face(r, "Used Sans")).toEqual(expect.objectContaining({ status: "loaded", used: true }));
    expect(face(r, "Loaded Only")).toEqual(expect.objectContaining({ status: "loaded", used: false, note: "loaded but not used" }));
    expect(face(r, "Never Used")).toBeUndefined();
    expect(r.details.neverLoaded).toEqual(["Never Used 400 normal", "Split 400 normal (U+400-4FF)"]);
    expect(face(r, "Auto Display")).toEqual(expect.objectContaining({ status: "loaded", used: true, weight: "700" }));
    // Only ::before uses it, so text scanning alone would call it unused
    expect(face(r, "Icons")).toEqual(expect.objectContaining({ status: "loaded", used: true }));
    expect(r.details.usedCount).toBe(4);
    expect(r.details.loadedUnusedCount).toBe(1);
    expect(r.details.neverLoadedCount).toBe(2);
  }, 60000);

  it("reports which unicode-range subsets loaded", async () => {
    const r = await run("/");
    // Chrome serializes the declared ranges without leading zeros
    const latin = face(r, "Split", { unicodeRange: "U+0-FF" });
    expect(latin).toEqual(expect.objectContaining({ status: "loaded", used: true }));
    expect(r.details.unicodeRangeFamilies).toEqual([{ family: "Split", subsets: 2, loadedSubsets: 1 }]);
    // An unused subset is expected, not a problem
    expect(r.issues.some((i) => /Split/.test(i.message) && i.severity !== "info")).toBe(false);
  }, 60000);

  it("flags a loaded face nothing uses, and a face without font-display", async () => {
    const r = await run("/");
    expect(r.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", message: expect.stringContaining("Loaded Only") }),
        expect.objectContaining({ severity: "warning", message: expect.stringContaining("Auto Display") }),
      ])
    );
    expect(face(r, "Auto Display").display).toBe("auto");
    expect(face(r, "Used Sans").display).toBe("swap");
  }, 60000);

  it("sums the bytes of the font files that loaded", async () => {
    const r = await run("/");
    expect(r.details.bytesReadable).toBe(true);
    // 5 faces loaded, the same file each
    expect(r.details.totalFontBytes).toBeGreaterThanOrEqual(font.length * 5);
    expect(r.details.totalFontBytes).toBeLessThan(font.length * 7);
    expect(face(r, "Used Sans").bytes).toBeGreaterThan(0);
    expect(face(r, "Split", { unicodeRange: "U+0-FF" }).bytes).toBeGreaterThan(0);
    expect(r.details.loadedUnusedBytes).toBe(face(r, "Loaded Only").bytes);
  }, 60000);

  it("sets corsLimitedAnalysis when a cross-origin font hides its size", async () => {
    const r = await run("/cross-origin");
    expect(r.details.bytesReadable).toBe(false);
    expect(r.corsLimitedAnalysis).toBe(true);
    const same = await run("/");
    expect(same.corsLimitedAnalysis).toBe(false);
  }, 60000);

  it("reports the file of each declaration when two stylesheets declare the same face", async () => {
    const r = await run("/duplicates");
    expect(face(r, "Shadowed", { url: `${base}/font.woff2?shadowed-first` })).toBeUndefined();
    expect(face(r, "Shadowed", { status: "loaded" })).toEqual(
      expect.objectContaining({ url: `${base}/font.woff2?shadowed-second`, used: true })
    );
    const twice = r.items.filter((i) => i.family === "Twice");
    expect(twice.map((i) => i.url).sort()).toEqual([`${base}/font.woff2?twice-first`, `${base}/font.woff2?twice-second`]);
    expect(twice.every((i) => i.status === "loaded" && i.bytes > 0)).toBe(true);
  }, 60000);

  it("lists each face and file once, with how many rules declare it and why it is not used", async () => {
    const r = await run("/duplicates");
    expect(face(r, "Twice", { url: `${base}/font.woff2?twice-first` })).toEqual(
      expect.objectContaining({ declarations: 2, used: false, note: "declared again later" })
    );
    expect(face(r, "Twice", { url: `${base}/font.woff2?twice-second` })).toEqual(expect.objectContaining({ declarations: 1, used: true, note: "" }));
    // 7 rules: 3 face and file pairs loaded, and "Unneeded", the only face nothing needed, named once
    expect(r.count).toBe(3);
    expect(r.items).toHaveLength(3);
    expect(r.details.declarationCount).toBe(7);
    expect(r.details.neverLoaded).toEqual(["Unneeded normal normal"]);
    expect(r.details.neverLoadedCount).toBe(1);
  }, 60000);

  it("flags a face downloaded twice, and only the later declaration as used", async () => {
    const r = await run("/duplicates");
    const first = face(r, "Twice", { url: `${base}/font.woff2?twice-first` });
    expect(first.used).toBe(false);
    expect(face(r, "Twice", { url: `${base}/font.woff2?twice-second` }).used).toBe(true);
    // Two declarations share the file, which downloads once
    expect(r.details.loadedUnusedBytes).toBe(first.bytes);
    const warnings = r.issues.filter((i) => i.severity === "warning" && /declared again.*Twice/.test(i.message));
    expect(warnings).toHaveLength(1);
  }, 60000);

  it("tells a shadowed declaration apart from a face nothing needs", async () => {
    const r = await run("/duplicates");
    const neverNeeded = r.issues.find((i) => /nothing on this page needed them/.test(i.message));
    expect(neverNeeded?.message ?? "").not.toMatch(/Shadowed/);
    const shadowed = r.issues.find((i) => /more than once/.test(i.message));
    expect(shadowed).toEqual(expect.objectContaining({ severity: "info", message: expect.stringMatching(/Shadowed/) }));
    // No declaration of "Unneeded" loaded, so it is a face nothing needs, listed once
    expect(shadowed.message).not.toMatch(/Unneeded/);
    expect(neverNeeded.message).toMatch(/\(1\); nothing on this page needed them: Unneeded normal normal$/);
  }, 60000);

  it("counts the faces it names in the font-display warning", async () => {
    const r = await run("/duplicates");
    const display = r.issues.find((i) => /font-display is auto or block/.test(i.message));
    const named = display.message.split(": ").pop().split(", ");
    expect(display.message).toContain(`on ${named.length} face(s)`);
  }, 60000);

  it("returns an empty result on a page without web fonts", async () => {
    const r = await run("/empty");
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.details.totalFontBytes).toBe(0);
  }, 60000);

  it("returns only JSON-serializable data", async () => {
    const r = await run("/");
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(JSON.stringify(r)).not.toMatch(/ — /);
  }, 60000);
});
