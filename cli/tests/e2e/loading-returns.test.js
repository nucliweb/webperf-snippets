import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

let browser;
let servers;

beforeAll(async () => {
  browser = await launch();
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await browser.close();
  await servers.close();
});

const source = (name) => loadSnippet(name).trim().replace(/;\s*$/, "");

async function onPage(path, fn, { init } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    if (init) await page.addInitScript(init);
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    return await fn(page);
  } finally {
    await page.close();
  }
}

// Registers the service worker on one page, then opens the app page it controls.
async function controlledApp(fn) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${servers.base}/sw-register`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__swReady === true, null, { timeout: 15000 });
    await page.goto(`${servers.base}/sw-app`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    return await fn(page);
  } finally {
    await page.close();
  }
}

describe("Service-Worker-Analysis", () => {
  it("separates cache, network and unknown sources, and computes the hit rate over the known ones", async () => {
    const r = await controlledApp((page) => page.evaluate(source("Loading/Service-Worker-Analysis")));
    expect(r.status).toBe("ok");
    expect(r.count).toBe(1);
    expect(r.items[0]).toEqual(expect.objectContaining({ state: "active" }));
    const d = r.details;
    expect(d.controlled).toBe(true);
    expect(d.swIntercepted).toBe(3);
    expect(d.fromCache).toBe(1);
    expect(d.fromNetwork).toBe(1);
    expect(d.fromUnknown).toBe(1);
    // 1 cache hit out of the 2 resources whose source is known
    expect(d.cacheHitRate).toBe(50);
    expect(r.rating).toBe("needs-improvement");
    expect(r.issues.some((i) => /unknown/i.test(i.message) && i.severity === "info")).toBe(true);
  }, 60000);

  it("reports the bytes saved as a number of bytes", async () => {
    const r = await controlledApp((page) => page.evaluate(source("Loading/Service-Worker-Analysis")));
    expect(r.details.savedBytes).toBeGreaterThan(0);
    expect(r.details.savedKB).toBeUndefined();
  }, 60000);

  it("lists the caches, capped at 20", async () => {
    const r = await controlledApp(async (page) => {
      await page.evaluate(async () => {
        for (let i = 0; i < 25; i++) await caches.open(`extra-${i}`);
      });
      return page.evaluate(source("Loading/Service-Worker-Analysis"));
    });
    expect(r.details.cacheStorageCount).toBeGreaterThan(20);
    expect(r.details.cacheStorage.length).toBe(20);
  }, 60000);

  it("has no issue with a spaced em-dash", async () => {
    const r = await controlledApp((page) => page.evaluate(source("Loading/Service-Worker-Analysis")));
    expect(r.issues.every((i) => !i.message.includes(" — "))).toBe(true);
  }, 60000);

  it("returns an ok result with no items when nothing is registered", async () => {
    const r = await onPage("/empty", (page) => page.evaluate(source("Loading/Service-Worker-Analysis")));
    expect(r.status).toBe("ok");
    expect(r.count).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.issues.some((i) => i.severity === "info" && /No Service Workers/i.test(i.message))).toBe(true);
  }, 30000);

  it("returns unsupported when the browser has no Service Worker API", async () => {
    const r = await onPage(
      "/empty",
      (page) => page.evaluate(source("Loading/Service-Worker-Analysis")),
      { init: () => { delete Navigator.prototype.serviceWorker; } }
    );
    expect(r.status).toBe("unsupported");
    expect(typeof r.error).toBe("string");
  }, 30000);
});

describe("JS-Execution-Time-Breakdown", () => {
  it("returns the bundles over 1 MB as criticalBundles", async () => {
    const r = await onPage("/big", async (page) => {
      await page.waitForTimeout(300);
      return page.evaluate(source("Loading/JS-Execution-Time-Breakdown"));
    });
    expect(r.status).toBe("ok");
    const bundles = r.details.criticalBundles;
    expect(bundles).toHaveLength(1);
    expect(bundles[0].shortName).toBe("big.js");
    expect(bundles[0].decodedBytes).toBeGreaterThan(1024 * 1024);
    expect(Object.keys(bundles[0]).sort()).toEqual(
      ["decodedBytes", "estimatedParseDesktopMs", "estimatedParseMobileMs", "shortName", "transferBytes"]
    );
  }, 30000);

  it("returns an empty list, and does not throw, when no bundle is that large", async () => {
    const r = await onPage("/seeded", (page) => page.evaluate(source("Loading/JS-Execution-Time-Breakdown")));
    expect(r.status).toBe("ok");
    expect(r.details.criticalBundles).toEqual([]);
  }, 30000);

  it("has no issue with a spaced em-dash", async () => {
    const r = await onPage("/big", (page) => page.evaluate(source("Loading/JS-Execution-Time-Breakdown")));
    expect(r.issues.every((i) => !i.message.includes(" — "))).toBe(true);
  }, 30000);
});
