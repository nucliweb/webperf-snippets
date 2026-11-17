import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

// A page that loads in a background tab paints while nobody sees it, and its LCP and FCP say nothing
// of what a user waited for: web-vitals does not report them (onLCP and onFCP compare the paint with
// the first visibility-state entry "hidden"). The snippets that give those times say so instead of a
// number. The full Chromium opens a tab in the background hidden, as a browser does with a link opened
// in a new tab; the headless shell shows every tab, so these tests launch the full one.
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name));
const WEB_VITALS = readFileSync(join(dirname(createRequire(import.meta.url).resolve("web-vitals")), "web-vitals.attribution.iife.js"), "utf8");
const HIDDEN = /hidden before/i;

let server;
let base;
let context;
let profile;

beforeAll(async () => {
  server = createServer((req, res) => {
    const name = req.url.split("?")[0].replace(/^\//, "");
    try {
      const body = fixture(name);
      const type = name.endsWith(".png") ? "image/png" : name.endsWith(".webm") ? "video/webm" : "text/html";
      res.writeHead(200, { "Content-Type": type }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  profile = mkdtempSync(join(tmpdir(), "hidden-page-"));
  context = await chromium.launchPersistentContext(profile, { channel: "chromium" });
  await context.addInitScript({ content: `${WEB_VITALS}\nwindow.webVitals = webVitals;` });
}, 30000);

afterAll(async () => {
  await context?.close();
  if (profile) rmSync(profile, { recursive: true, force: true });
  if (server) await new Promise((resolve) => server.close(resolve));
});

// Opens a fixture in a new tab in the background, waits for it to load and runs the snippet. The page
// records what web-vitals reports from its start, with every change, as a RUM script would.
async function inBackground(fixtureName, snippet) {
  const front = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(front);
  const opened = context.waitForEvent("page");
  await cdp.send("Target.createTarget", { url: `${base}/${fixtureName}`, background: true });
  const page = await opened;
  try {
    await page.waitForLoadState("load");
    await page.evaluate(() => {
      window.__reported = [];
      for (const metric of ["onLCP", "onFCP"]) window.webVitals[metric]((m) => window.__reported.push(m.name), { reportAllChanges: true });
    });
    await page.waitForTimeout(500);
    const hiddenAtStart = await page.evaluate(() => performance.getEntriesByType("visibility-state")[0]?.name);
    const result = await page.evaluate(loadSnippet(snippet).trim().replace(/;\s*$/, ""));
    const reported = await page.evaluate(() => window.__reported);
    return { result, reported, hiddenAtStart };
  } finally {
    await page.close();
    await cdp.detach();
  }
}

describe("a page that loaded in a background tab", () => {
  it.each([
    ["CoreWebVitals/LCP", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Subparts", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Trail", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Video-Candidate", "video-poster.html"],
    ["Loading/FCP", "observer-lcp.html"],
  ])("%s gives no time, and says the page was hidden before it painted", async (snippet, page) => {
    const { result, reported, hiddenAtStart } = await inBackground(page, snippet);
    expect(hiddenAtStart, "the tab opened hidden").toBe("hidden");
    // web-vitals, the reference, reports neither LCP nor FCP for it
    expect(reported).toEqual([]);
    expect(result.status, JSON.stringify(result)).toBe("error");
    expect(result.error).toMatch(HIDDEN);
    expect(result).not.toHaveProperty("value");
  }, 30000);

  // The image of the LCP is the one the page shows, hidden or not: its entropy does not depend on time
  it("CoreWebVitals/LCP-Image-Entropy still checks the LCP image", async () => {
    const { result } = await inBackground("observer-lcp.html", "CoreWebVitals/LCP-Image-Entropy");
    expect(result.status, JSON.stringify(result)).toBe("ok");
  }, 30000);
});
