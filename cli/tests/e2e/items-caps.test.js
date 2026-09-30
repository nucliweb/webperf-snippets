import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// The list a snippet returns holds at most 50 items, the most relevant ones; `count` and the
// totals in `details` cover the whole set, so nothing is lost by the cap.
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

async function runOn(path, name) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(600);
    return await page.evaluate(source(name));
  } finally {
    await page.close();
  }
}

describe("scripts", () => {
  it("Script-Loading keeps the render-blocking script that comes last, and counts all", async () => {
    const r = await runOn("/cap-scripts", "Loading/Script-Loading");
    expect(r.count).toBe(61);
    expect(r.items).toHaveLength(50);
    expect(r.items[0]).toEqual(expect.objectContaining({ shortName: "blocking.js", strategy: "blocking" }));
    expect(r.details.byStrategy.blocking + r.details.byStrategy.async).toBe(61);
  }, 60000);

  it("First-And-Third-Party-Script-Info keeps the render-blocking script first, and totals the whole set", async () => {
    const r = await runOn("/cap-scripts", "Loading/First-And-Third-Party-Script-Info");
    expect(r.count).toBe(61);
    expect(r.items).toHaveLength(50);
    expect(r.items[0]).toEqual(expect.objectContaining({ shortName: "blocking.js", renderBlocking: true }));
    expect(r.details.firstPartyCount + r.details.thirdPartyCount).toBe(61);
  }, 60000);

  it("First-And-Third-Party-Script-Timings lists the slowest first, and totals the whole set", async () => {
    const r = await runOn("/cap-scripts", "Loading/First-And-Third-Party-Script-Timings");
    expect(r.count).toBe(61);
    expect(r.items).toHaveLength(50);
    const totals = r.items.map((i) => i.totalMs);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(r.details.firstPartyCount + r.details.thirdPartyCount).toBe(61);
  }, 60000);

  it("TTFB-Resources lists the slowest first, and totals the whole set", async () => {
    const r = await runOn("/heavy", "Loading/TTFB-Resources");
    expect(r.count).toBeGreaterThan(50);
    expect(r.items).toHaveLength(50);
    const ttfb = r.items.map((i) => i.ttfbMs);
    expect(ttfb).toEqual([...ttfb].sort((a, b) => b - a));
    expect(r.details.maxTtfbMs).toBe(ttfb[0]);
  }, 60000);

  it("Inline-Script-Info-and-Size keeps 50 of the executable scripts and totals them all", async () => {
    const r = await runOn("/heavy", "Loading/Inline-Script-Info-and-Size");
    expect(r.details.executableCount).toBeGreaterThan(50);
    expect(r.items).toHaveLength(50);
  }, 60000);
});

describe("hints and resources", () => {
  it("Resource-Hints keeps the hint with an error that comes last, and counts all", async () => {
    const r = await runOn("/cap-hints", "Loading/Resource-Hints");
    expect(r.count).toBe(61);
    expect(r.items).toHaveLength(50);
    expect(r.items[0]).toEqual(expect.objectContaining({ rel: "preload" }));
    expect(r.details.byType["dns-prefetch"]).toBe(60);
  }, 60000);

  it("Cache-Strategy-Analysis keeps 50 items and reports how many were actionable", async () => {
    const r = await runOn("/heavy", "Loading/Cache-Strategy-Analysis");
    expect(r.items.length).toBeLessThanOrEqual(50);
    expect(r.details.actionableCount).toBeGreaterThan(50);
    expect(r.items).toHaveLength(50);
    expect(r.details.totalResources).toBe(r.count);
  }, 90000);
});

describe("media", () => {
  it("Image-Element-Audit keeps the image with an error that comes last, and counts all", async () => {
    const r = await runOn("/cap-images", "Media/Image-Element-Audit");
    expect(r.count).toBe(61);
    expect(r.details.totalImages).toBe(61);
    expect(r.items).toHaveLength(50);
    expect(r.items[0].url).toContain("?bad");
  }, 60000);

  it("LCP-Image-Entropy keeps 50 images and counts all", async () => {
    const r = await runOn("/heavy", "CoreWebVitals/LCP-Image-Entropy");
    expect(r.count).toBeGreaterThan(50);
    expect(r.details.totalImages).toBe(r.count);
    expect(r.items).toHaveLength(50);
  }, 60000);
});
