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
// in a new tab; the headless shell shows every tab, so these tests launch the full one. Under Playwright
// that tab turns visible a few milliseconds later: what counts is the first visibility-state entry, and
// that one is "hidden".
const HERE = dirname(fileURLToPath(import.meta.url));
// The files the pages of these tests load, read once: the server answers only these names, so a path in
// a request never reaches the file system
const TYPES = { "observer-lcp.html": "text/html", "video-poster.html": "text/html", "hero.png": "image/png", "clip.webm": "video/webm" };
const FILES = new Map(Object.entries(TYPES).map(([name, type]) => [name, { type, body: readFileSync(join(HERE, "../fixtures", name)) }]));
const WEB_VITALS = readFileSync(join(dirname(createRequire(import.meta.url).resolve("web-vitals")), "web-vitals.attribution.iife.js"), "utf8");
const HIDDEN = /hidden before/i;

let server;
let base;
let context;
let profile;
let front;

beforeAll(async () => {
  server = createServer((req, res) => {
    const file = FILES.get(req.url.split("?")[0].replace(/^\//, ""));
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": file.type }).end(file.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  profile = mkdtempSync(join(tmpdir(), "hidden-page-"));
  context = await chromium.launchPersistentContext(profile, { channel: "chromium" });
  // The tab in front: a tab opened in the background before the first one has the focus opens visible
  front = context.pages()[0] ?? (await context.newPage());
  await front.goto("about:blank");
  await front.bringToFront();
  await context.addInitScript({ content: `${WEB_VITALS}\nwindow.webVitals = webVitals;` });
}, 30000);

afterAll(async () => {
  await context?.close();
  if (profile) rmSync(profile, { recursive: true, force: true });
  if (server) await new Promise((resolve) => server.close(resolve));
});

// Opens a fixture in a tab in the background. The first tabs Chrome opens in the background after it
// starts can open visible, so a tab that did not start hidden is closed and opened again, a few times
async function openHidden(url) {
  for (let attempt = 1; ; attempt++) {
    const cdp = await context.newCDPSession(front);
    const opened = context.waitForEvent("page");
    await cdp.send("Target.createTarget", { url, background: true });
    const page = await opened;
    await cdp.detach();
    await page.waitForLoadState("load");
    const first = await page.evaluate(() => performance.getEntriesByType("visibility-state")[0]?.name);
    if (first === "hidden" || attempt === 5) return { page, hiddenAtStart: first };
    await page.close();
  }
}

const asExpression = (snippet) => loadSnippet(snippet).trim().replace(/;\s*$/, "");

// The warnings of the console that say the page was hidden, from the time this is called
function hiddenWarnings(page) {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && HIDDEN.test(message.text())) warnings.push(message.text());
  });
  return warnings;
}

// Opens a fixture in a new tab in the background, waits for it to load and runs the snippet. The page
// records what web-vitals reports after the load, with every change, as a RUM script loaded late would.
async function inBackground(fixtureName, snippet) {
  const { page, hiddenAtStart } = await openHidden(`${base}/${fixtureName}`);
  try {
    await page.evaluate(() => {
      window.__reported = [];
      for (const metric of ["onLCP", "onFCP"]) window.webVitals[metric]((m) => window.__reported.push(m.name), { reportAllChanges: true });
    });
    await page.waitForTimeout(500);
    const warnings = hiddenWarnings(page);
    const result = await page.evaluate(asExpression(snippet));
    const reported = await page.evaluate(() => window.__reported);
    // The observers of the snippet that keep tracking after it returns
    await page.waitForTimeout(200);
    return { result, reported, hiddenAtStart, warnings };
  } finally {
    await page.close();
  }
}

// The visibility-state entries and the activationStart that a test sets, read by the snippets and by
// web-vitals as those of the browser. A page Playwright opens cannot be hidden and shown again, and a
// real prerender needs no CDP session on the page that starts it, so these tests give the entries a
// browser records in those cases. Until the test sets them, the real ones.
const VISIBILITY_STUB = () => {
  const real = performance.getEntriesByType.bind(performance);
  performance.getEntriesByType = (type) => {
    if (type === "visibility-state" && window.__visibility) return window.__visibility;
    if (type === "navigation" && window.__activationStart !== undefined) {
      const nav = real(type)[0];
      const get = (target, key) => (key === "activationStart" ? window.__activationStart : typeof target[key] === "function" ? target[key].bind(target) : target[key]);
      return [new Proxy(nav, { get })];
    }
    return real(type);
  };
};

// Opens a fixture in a tab in front, lets `setup` change what the page did, and runs the snippet. The
// page starts web-vitals after the setup, so it reads the same entries as the snippet.
async function inFront(fixtureName, snippet, setup) {
  const page = await context.newPage();
  try {
    await page.addInitScript(VISIBILITY_STUB);
    await page.goto(`${base}/${fixtureName}`);
    await page.waitForTimeout(300);
    const scenario = await page.evaluate(setup);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__reported = {};
      for (const metric of ["onLCP", "onFCP"]) window.webVitals[metric]((m) => (window.__reported[m.name] = m.value), { reportAllChanges: true });
    });
    await page.waitForTimeout(300);
    const visibility = await page.evaluate(() => document.visibilityState);
    const warnings = hiddenWarnings(page);
    const result = await page.evaluate(asExpression(snippet));
    const reported = await page.evaluate(() => window.__reported);
    const lcpTimes = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const times = [];
          const obs = new PerformanceObserver((list) => times.push(...list.getEntries().map((e) => e.startTime)));
          obs.observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => { obs.disconnect(); resolve(times); }, 100);
        })
    );
    return { result, reported, scenario, visibility, lcpTimes, warnings };
  } finally {
    await page.close();
  }
}

// A prerendered page: hidden from its start until its activation, then shown, with every paint after
// the activation
const PRERENDERED = () => {
  const fcp = performance.getEntriesByName("first-contentful-paint")[0].startTime;
  window.__activationStart = Math.round(fcp / 2);
  window.__visibility = [
    { name: "hidden", entryType: "visibility-state", startTime: 0 },
    { name: "visible", entryType: "visibility-state", startTime: window.__activationStart },
  ];
  return { activationStart: window.__activationStart };
};

// The user switched to another tab and back after the page painted, and then the page painted a larger
// element: the candidate after the page was hidden is not the LCP, the one before it is
const HIDDEN_THEN_LARGER = () => {
  const hiddenAt = performance.now();
  window.__visibility = [
    { name: "visible", entryType: "visibility-state", startTime: 0 },
    { name: "hidden", entryType: "visibility-state", startTime: hiddenAt },
    { name: "visible", entryType: "visibility-state", startTime: hiddenAt + 1 },
  ];
  const larger = document.createElement("p");
  larger.style.cssText = "font-size:64px;line-height:1.1;margin:0";
  larger.textContent = "A paragraph that paints after the page was hidden and shown again, larger than anything before it.";
  document.body.prepend(larger);
  return { hiddenAt };
};

const within1ms = (actual, expected) => expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(1);

describe("a page that loaded in a background tab", () => {
  it.each([
    ["CoreWebVitals/LCP", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Subparts", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Trail", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Video-Candidate", "video-poster.html"],
    ["Loading/FCP", "observer-lcp.html"],
  ])("%s gives no time, and says the page was hidden before it painted", async (snippet, page) => {
    const { result, reported, hiddenAtStart, warnings } = await inBackground(page, snippet);
    expect(hiddenAtStart, "the tab opened hidden").toBe("hidden");
    // web-vitals, the reference, reports neither LCP nor FCP for it
    expect(reported).toEqual([]);
    expect(result.status, JSON.stringify(result)).toBe("error");
    // A field the reports read, so the result counts as not measured rather than as a failure
    expect(result.hiddenBeforePaint).toBe(true);
    expect(result.error).toMatch(HIDDEN);
    expect(result).not.toHaveProperty("value");
    // The console says it once, however many candidates the page painted
    expect(warnings).toHaveLength(1);
  }, 30000);

  // The image of the LCP is the one the page shows, hidden or not: its entropy does not depend on time
  it("CoreWebVitals/LCP-Image-Entropy still checks the LCP image", async () => {
    const { result, hiddenAtStart } = await inBackground("observer-lcp.html", "CoreWebVitals/LCP-Image-Entropy");
    expect(hiddenAtStart, "the tab opened hidden").toBe("hidden");
    expect(result.status, JSON.stringify(result)).toBe("ok");
  }, 30000);
});

describe("a prerendered page, hidden until its activation", () => {
  it.each([
    ["CoreWebVitals/LCP", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Subparts", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Trail", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Video-Candidate", "video-poster.html"],
  ])("%s gives the LCP from the activation, as web-vitals does", async (snippet, page) => {
    const { result, reported, visibility } = await inFront(page, snippet, PRERENDERED);
    expect(visibility).toBe("visible");
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(reported.LCP, "web-vitals reports an LCP").toBeGreaterThan(0);
    within1ms(result.value, reported.LCP);
  }, 30000);

  it("Loading/FCP gives the FCP from the activation, as web-vitals does", async () => {
    const { result, reported } = await inFront("observer-lcp.html", "Loading/FCP", PRERENDERED);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(reported.FCP, "web-vitals reports an FCP").toBeGreaterThan(0);
    within1ms(result.value, reported.FCP);
  }, 30000);
});

describe("a page hidden and shown again after it painted, that then paints a larger element", () => {
  it.each([
    ["CoreWebVitals/LCP", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Subparts", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Trail", "observer-lcp.html"],
    ["CoreWebVitals/LCP-Video-Candidate", "video-poster.html"],
  ])("%s gives the last candidate painted before the page was hidden, as web-vitals does", async (snippet, page) => {
    const { result, reported, scenario, lcpTimes, warnings } = await inFront(page, snippet, HIDDEN_THEN_LARGER);
    expect(lcpTimes.at(-1), "the larger element painted after the page was hidden").toBeGreaterThan(scenario.hiddenAt);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(reported.LCP, "web-vitals reports an LCP").toBeLessThan(scenario.hiddenAt);
    within1ms(result.value, reported.LCP);
    // The console leaves out the candidate after the page was hidden, without a warning
    expect(warnings).toEqual([]);
  }, 30000);

  it("CoreWebVitals/LCP-Trail lists only the candidates painted before the page was hidden", async () => {
    const { result, scenario, lcpTimes } = await inFront("observer-lcp.html", "CoreWebVitals/LCP-Trail", HIDDEN_THEN_LARGER);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(result.details.candidates.length).toBe(lcpTimes.filter((t) => t < scenario.hiddenAt).length);
  }, 30000);

  it("Loading/FCP still gives the FCP", async () => {
    const { result, reported } = await inFront("observer-lcp.html", "Loading/FCP", HIDDEN_THEN_LARGER);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    within1ms(result.value, reported.FCP);
  }, 30000);
});
