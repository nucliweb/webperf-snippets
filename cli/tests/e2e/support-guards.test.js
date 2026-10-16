import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Snippets that read an API only some browsers have. Chromium has them all, so the tests take
// them away with an init script, the way the page would look in Firefox or Safari.
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

// Firefox and Safari have no Long Animation Frames
const withoutLoaf = () => {
  const types = PerformanceObserver.supportedEntryTypes.filter((t) => t !== "long-animation-frame");
  Object.defineProperty(PerformanceObserver, "supportedEntryTypes", { get: () => types });
};
// Only Chromium (107+) has renderBlockingStatus in Resource Timing
const withoutRenderBlockingStatus = () => {
  delete PerformanceResourceTiming.prototype.renderBlockingStatus;
};

async function run(path, name, { init, act } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    if (init) await page.addInitScript(init);
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const first = await page.evaluate(source(name));
    const second = act ? await act(page, first) : null;
    return { first, second };
  } finally {
    await page.close();
  }
}

describe("Long-Animation-Frames without the long-animation-frame entry type", () => {
  // A 200 ms task after the snippet runs: a browser with the API records a long frame
  const blockAndSummarize = async (page) => {
    await page.evaluate(() => {
      const end = performance.now() + 200;
      while (performance.now() < end) {}
    });
    await page.waitForTimeout(300);
    return page.evaluate("window.getLoAFSummary()");
  };

  it("returns unsupported at start and from getLoAFSummary(), not a count of 0", async () => {
    const { first, second } = await run("/behaviors", "Interaction/Long-Animation-Frames", {
      init: withoutLoaf,
      act: blockAndSummarize,
    });
    expect(first.status).toBe("unsupported");
    expect(first.error).toMatch(/long-animation-frame/);
    expect(first).not.toHaveProperty("count");
    expect(second.status).toBe("unsupported");
    expect(second.error).toMatch(/long-animation-frame/);
    expect(second).not.toHaveProperty("count");
  }, 30000);

  it("keeps tracking where the entry type exists", async () => {
    const { first, second } = await run("/behaviors", "Interaction/Long-Animation-Frames", { act: blockAndSummarize });
    expect(first.status).toBe("tracking");
    expect(second.status).toBe("ok");
    expect(second.count).toBeGreaterThan(0);
  }, 30000);
});

describe("FCP without renderBlockingStatus", () => {
  it("reports the render-blocking data as unavailable instead of 0 resources and all time as render delay", async () => {
    const { first: r } = await run("/seeded", "Loading/FCP", { init: withoutRenderBlockingStatus });
    expect(r.status).toBe("ok");
    expect(r.value).toBeGreaterThan(0);
    expect(r.details.renderBlockingSupported).toBe(false);
    expect(r.details.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(r.details.blockingResourceCount).toBeNull();
    expect(r.details.renderBlockingLoadMs).toBeNull();
    expect(r.details.renderDelayMs).toBeNull();
    expect(r.items).toEqual([]);
  }, 30000);

  it("keeps the breakdown in Chromium", async () => {
    const { first: r } = await run("/seeded", "Loading/FCP");
    expect(r.details.renderBlockingSupported).toBe(true);
    expect(r.details.blockingResourceCount).toBeGreaterThan(0);
    expect(r.items.some((i) => i.url === "style.css")).toBe(true);
    expect(r.details.ttfbMs + r.details.renderBlockingLoadMs + r.details.renderDelayMs).toBe(r.value);
  }, 30000);
});

describe("Third-Party-Impact-by-Domain without renderBlockingStatus", () => {
  it("reports render-blocking as unknown per domain and in details", async () => {
    const { first: r } = await run("/script-sources", "Loading/Third-Party-Impact-by-Domain", { init: withoutRenderBlockingStatus });
    expect(r.status).toBe("ok");
    expect(r.count).toBe(1);
    expect(r.details.renderBlockingSupported).toBe(false);
    expect(r.details.blockingDomains).toBeNull();
    expect(r.items.every((i) => i.renderBlocking === null)).toBe(true);
    expect(r.issues.some((i) => i.severity === "warning" && /render-blocking/.test(i.message))).toBe(false);
    expect(r.issues.some((i) => i.severity === "info" && /renderBlockingStatus/.test(i.message))).toBe(true);
  }, 30000);

  it("flags the render-blocking domain in Chromium", async () => {
    const { first: r } = await run("/script-sources", "Loading/Third-Party-Impact-by-Domain");
    expect(r.details.renderBlockingSupported).toBe(true);
    expect(r.details.blockingDomains).toBe(1);
    expect(r.items[0]).toEqual(expect.objectContaining({ domain: "localhost", renderBlocking: true }));
  }, 30000);
});

describe("First-And-Third-Party-Script-Info", () => {
  it("reports render-blocking as unknown without renderBlockingStatus", async () => {
    const { first: r } = await run("/script-sources", "Loading/First-And-Third-Party-Script-Info", { init: withoutRenderBlockingStatus });
    expect(r.status).toBe("ok");
    expect(r.details.renderBlockingSupported).toBe(false);
    expect(r.details.thirdPartyBlockingCount).toBeNull();
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.renderBlocking === null)).toBe(true);
    expect(r.issues.some((i) => i.severity === "error" && /render-blocking/.test(i.message))).toBe(false);
    expect(r.issues.some((i) => i.severity === "info" && /renderBlockingStatus/.test(i.message))).toBe(true);
  }, 30000);

  it("finds preloaded and modulepreloaded scripts, once each, and leaves out other preloads", async () => {
    const { first: r } = await run("/script-sources", "Loading/First-And-Third-Party-Script-Info");
    const names = r.items.map((i) => i.shortName).sort();
    expect(names).toEqual(["analytics.js", "blocking.js", "later.js", "module.js", "twice.js"]);
    expect(r.count).toBe(5);
    expect(r.details.thirdPartyCount).toBe(3);
    expect(r.details.firstPartyCount).toBe(2);
    expect(r.details.renderBlockingSupported).toBe(true);
    expect(r.details.thirdPartyBlockingCount).toBe(1);
    expect(r.items.find((i) => i.shortName === "blocking.js").renderBlocking).toBe(true);
    expect(r.items.find((i) => i.shortName === "analytics.js").renderBlocking).toBe(false);
    // Fetched twice: the entry of the <script> is the one kept, the one that blocks
    expect(r.items.find((i) => i.shortName === "twice.js").renderBlocking).toBe(true);
  }, 30000);
});
