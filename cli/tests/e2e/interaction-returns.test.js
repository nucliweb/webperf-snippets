import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// What the Interaction snippets return, for the value read right after the snippet runs
// and for the value of the function that tracking snippets expose.
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
const keys = (o) => Object.keys(o).sort().join(",");
const noSpacedDash = (issues) => issues.every((i) => !i.message.includes(" — "));

// Opens the fixture, runs the snippet, lets `act` interact, and returns both values.
async function session(name, { query = "", wait = 900, act, getter } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${servers.base}/behaviors${query}`, { waitUntil: "load" });
    await page.waitForTimeout(wait);
    const first = await page.evaluate(source(name));
    if (act) await act(page);
    const second = getter ? await page.evaluate(`window.${getter}()`) : null;
    return { first, second };
  } finally {
    await page.close();
  }
}

describe("Input-Latency-Breakdown", () => {
  it("returns one item per event type and an issue for each slow one", async () => {
    const { second } = await session("Interaction/Input-Latency-Breakdown", {
      getter: "getInputLatencyBreakdown",
      act: async (page) => {
        await page.click("#slow");
        await page.click("#slow");
        await page.waitForTimeout(400);
      },
    });
    // Chrome may attribute the delay to pointerdown or click; check the shape, not the type
    const slowest = [...second.items].sort((a, b) => b.p75Ms - a.p75Ms)[0];
    expect(slowest.count).toBeGreaterThanOrEqual(2);
    expect(typeof slowest.p75Ms).toBe("number");
    expect(slowest.rating).not.toBe("good");
    expect(new Set(second.items.map(keys)).size).toBe(1);
    expect(second.items.length).toBe(second.count);
    expect(second.issues.some((i) => i.message.startsWith(`${slowest.type} `))).toBe(true);
    expect(noSpacedDash(second.issues)).toBe(true);
  }, 30000);
});

describe("Interactions", () => {
  it("returns issues for slow interactions and keeps byRating nested", async () => {
    const { second } = await session("Interaction/Interactions", {
      getter: "getInteractionSummary",
      act: async (page) => {
        for (let i = 0; i < 3; i++) await page.click("#slow");
        await page.waitForTimeout(400);
      },
    });
    expect(second.details.byRating).toEqual(
      expect.objectContaining({ good: expect.any(Number), poor: expect.any(Number) })
    );
    expect(second.issues.length).toBeGreaterThanOrEqual(1);
    expect(second.issues.length).toBeLessThanOrEqual(10);
    expect(noSpacedDash(second.issues)).toBe(true);
  }, 60000);

  it("caps items at 50, slowest first, and keeps the total in count", async () => {
    const { second } = await session("Interaction/Interactions", {
      getter: "getInteractionSummary",
      act: async (page) => {
        for (let i = 0; i < 58; i++) await page.click("#mid");
        await page.waitForTimeout(600);
      },
    });
    expect(second.count).toBeGreaterThan(50);
    expect(second.items.length).toBe(50);
    const durations = second.items.map((i) => i.durationMs);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
  }, 90000);
});

describe("Long-Animation-Frames-Script-Attribution", () => {
  it("lists the slowest functions of each file", async () => {
    const { first } = await session("Interaction/Long-Animation-Frames-Script-Attribution");
    const withFunctions = first.items.filter((i) => i.functions?.length);
    expect(withFunctions.length).toBeGreaterThan(0);
    for (const item of first.items) {
      expect(item.functions.length).toBeLessThanOrEqual(5);
      for (const fn of item.functions) expect(keys(fn)).toBe("durationMs,invoker,name");
    }
  }, 30000);
});

describe("Forced-Synchronous-Layout", () => {
  it("groups events by property and element, with an issue per property", async () => {
    const { second } = await session("Interaction/Forced-Synchronous-Layout", {
      getter: "getFSLSummary",
      act: async (page) => {
        await page.click("#fsl");
        await page.waitForTimeout(200);
      },
    });
    expect(second.count).toBeGreaterThanOrEqual(30);
    expect(second.details.fslEvents).toBeUndefined();
    expect(second.items.length).toBeGreaterThan(0);
    expect(second.items.length).toBeLessThanOrEqual(50);
    expect(new Set(second.items.map(keys)).size).toBe(1);
    expect(keys(second.items[0])).toBe("accessType,count,element,fastestSinceLastMutationMs,property");
    expect(second.issues.some((i) => i.severity === "error")).toBe(true);
    expect(noSpacedDash(second.issues)).toBe(true);
  }, 30000);

  it("returns the same shape when nothing was detected", async () => {
    const { second } = await session("Interaction/Forced-Synchronous-Layout", {
      getter: "getFSLSummary",
    });
    expect(second.count).toBe(0);
    expect(second.items).toEqual([]);
    expect(second.issues).toEqual([]);
  }, 30000);
});

describe("Long-Animation-Frames", () => {
  it("returns frames with the same item shape at start and in the summary", async () => {
    const { first, second } = await session("Interaction/Long-Animation-Frames", {
      getter: "getLoAFSummary",
    });
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items.length).toBeLessThanOrEqual(20);
    const shapes = new Set([...first.items, ...second.items].map(keys));
    expect(shapes.size).toBe(1);
    for (const item of [...first.items, ...second.items]) {
      expect(item.scripts.length).toBeLessThanOrEqual(10);
      for (const s of item.scripts) expect(keys(s)).toBe("durationMs,forcedStyleAndLayoutMs,invoker,source");
    }
    const blocking = second.items.map((i) => i.blockingDurationMs);
    expect(blocking).toEqual([...blocking].sort((a, b) => b - a));
  }, 30000);
});

describe("LongTask", () => {
  it("returns the tasks it collected, with the same shape in both values", async () => {
    const { first, second } = await session("Interaction/LongTask", { getter: "getLongTaskSummary" });
    expect(first.count).toBeGreaterThan(0);
    expect(first.items.length).toBe(first.count);
    expect(Math.max(...first.items.map((i) => i.durationMs))).toBeGreaterThanOrEqual(100);
    expect(new Set([...first.items, ...second.items].map(keys)).size).toBe(1);
  }, 30000);

  it("caps items at 50 and keeps the total in count", async () => {
    const { second } = await session("Interaction/LongTask", {
      query: "?tasks=60",
      wait: 6500,
      getter: "getLongTaskSummary",
    });
    expect(second.count).toBeGreaterThan(50);
    expect(second.items.length).toBe(50);
    const durations = second.items.map((i) => i.durationMs);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
  }, 60000);
});

describe("Layout-Shift-Loading-and-Interaction", () => {
  it("returns the elements that shifted the most, the same at start and in the summary", async () => {
    const { first, second } = await session("Interaction/Layout-Shift-Loading-and-Interaction", {
      getter: "getLayoutShiftSummary",
    });
    const top = first.details.topElements;
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.some((e) => e.selector === "#late" || e.selector === "#banner")).toBe(true);
    expect(second.details.topElements).toEqual(top);
  }, 30000);
});

describe("Scroll-Performance", () => {
  it("lists non-passive listeners and CSS findings as items, and keeps the counts", async () => {
    const { first, second } = await session("Interaction/Scroll-Performance", {
      getter: "getScrollSummary",
      act: async (page) => {
        await page.evaluate(() => window.addEventListener("wheel", function () {}));
      },
    });
    for (const result of [second]) {
      expect(typeof result.details.nonPassiveListeners).toBe("number");
      expect(result.details.nonPassiveListeners).toBeGreaterThanOrEqual(1);
      expect(typeof result.details.cssAudit.willChangeElements).toBe("number");
      const kinds = new Set(result.items.map((i) => i.kind));
      expect(kinds).toEqual(new Set(["non-passive-listener", "will-change", "overscroll"]));
      expect(new Set(result.items.map(keys)).size).toBe(1);
      expect(result.items.length).toBeLessThanOrEqual(50);
      expect(result.issues.some((i) => /non-passive/i.test(i.message))).toBe(true);
    }
    expect(first.status).toBe("tracking");
  }, 30000);
});
