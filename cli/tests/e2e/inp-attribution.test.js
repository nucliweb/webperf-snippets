import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// How INP, Interactions and Input-Latency-Breakdown attribute the phases of an interaction.
// A tap fires pointerdown, pointerup and click, which share an interactionId and usually the
// same rounded duration; the phases belong to the whole interaction, not to one of its events.
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

const SNIPPETS = {
  inp: { name: "CoreWebVitals/INP", getter: "getINP" },
  interactions: { name: "Interaction/Interactions", getter: "getInteractionSummary" },
  breakdown: { name: "Interaction/Input-Latency-Breakdown", getter: "getInputLatencyBreakdown" },
};
const source = (name) => loadSnippet(name).trim().replace(/;\s*$/, "");

async function withPage(fn, { path = "/slow-click", init } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    if (init) await page.addInitScript(init);
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    return await fn(page);
  } finally {
    await page.close();
  }
}

const runAll = async (page) => {
  const started = {};
  for (const [key, { name }] of Object.entries(SNIPPETS)) started[key] = await page.evaluate(source(name));
  return started;
};
const readAll = async (page) => {
  const out = {};
  for (const [key, { getter }] of Object.entries(SNIPPETS)) out[key] = await page.evaluate(`window.${getter}()`);
  return out;
};

// Event Timing entries reach the observers after the next frame, later on a loaded machine
const waitForInteractions = (page, n) =>
  page.waitForFunction(
    (n) =>
      window.getINP().details.totalInteractions >= n &&
      window.getInteractionSummary().count >= n &&
      window.getInputLatencyBreakdown().status === "ok",
    n,
    { timeout: 15000, polling: 100 }
  );

const dominantPhase = (phases) => Object.entries(phases).sort((a, b) => b[1] - a[1])[0][0];

// A tap held for 80 ms, as a person clicks, then a quick one
async function clickSlowTwice(page) {
  const box = await page.locator("#slow").boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.click("#slow");
}

describe("a click whose handler runs for 250 ms", () => {
  it("is attributed to processing, under the click event, by the three snippets", async () => {
    const results = await withPage(async (page) => {
      await page.waitForTimeout(300);
      await runAll(page);
      await clickSlowTwice(page);
      await page.waitForTimeout(400);
      await waitForInteractions(page, 2);
      await page.waitForTimeout(300);
      return readAll(page);
    });

    const { inp, interactions, breakdown } = results;
    expect(inp.status).toBe("ok");
    expect(inp.details.totalInteractions).toBe(2);
    expect(inp.details.worstEvent).toMatch(/^click /);
    expect(dominantPhase(inp.details.phases)).toBe("processingTime");
    expect(inp.details.phases.processingTime).toBeGreaterThanOrEqual(240);

    expect(interactions.count).toBe(2);
    expect(interactions.items.map((i) => i.type)).toEqual(["click", "click"]);

    expect(breakdown.items.map((i) => i.type)).toEqual(["click"]);
    const [click] = breakdown.items;
    expect(click.count).toBe(2);
    expect(click.processingMs).toBeGreaterThanOrEqual(240);
    expect(click.processingMs).toBeGreaterThan(click.inputDelayMs);
    expect(click.processingMs).toBeGreaterThan(click.presentationMs);
    expect(breakdown.issues.map((i) => i.message).join("\n")).toMatch(/Bottleneck: Processing\./);
  }, 45000);
});

describe("fast clicks", () => {
  it("stay small and good in the three snippets", async () => {
    const { inp, interactions, breakdown } = await withPage(async (page) => {
      await page.waitForTimeout(300);
      await runAll(page);
      for (let i = 0; i < 3; i++) await page.click("#fast");
      await page.waitForFunction(() => window.getInteractionSummary().count >= 3, null, { timeout: 15000, polling: 100 });
      await page.waitForTimeout(300);
      return readAll(page);
    });
    expect(inp.status).toBe("ok");
    expect(inp.rating).toBe("good");
    expect(inp.details.totalInteractions).toBe(3);
    expect(inp.details.worstEvent).toMatch(/^click /);
    expect(interactions.status).toBe("ok");
    expect(interactions.count).toBe(3);
    expect(interactions.details.worstMs).toBeLessThan(100);
    expect(interactions.items.every((i) => i.type === "click")).toBe(true);
    expect(breakdown.status).toBe("ok");
    expect(breakdown.items.map((i) => i.type)).toEqual(["click"]);
    expect(breakdown.items[0].p75Ms).toBeLessThan(100);
    expect(breakdown.issues).toEqual([]);
  }, 45000);
});

// Replaces PerformanceObserver: observe({ type: "event" }) delivers window.__batches, one
// batch per callback, so a test can split the entries of one interaction across callbacks.
const FAKE_OBSERVER = (supported) => {
  class FakeObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe(opts) {
      if (opts.type !== "event") return;
      const batches = window.__batches ?? [];
      batches.forEach((batch, i) =>
        setTimeout(() => this.cb({ getEntries: () => batch.map((e) => ({ target: e.selector ? document.querySelector(e.selector) : null, ...e })) }), i * 20)
      );
    }
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  FakeObserver.supportedEntryTypes = supported;
  window.PerformanceObserver = FakeObserver;
};

const fakeEntry = (name, interactionId, startTime, processingStart, processingEnd, duration, selector = "#slow") => ({
  name,
  interactionId,
  startTime,
  processingStart,
  processingEnd,
  duration,
  selector,
});

describe("an interaction whose entries arrive in separate observer callbacks", () => {
  it("is counted once and measured over all its entries", async () => {
    const { inp, interactions, breakdown } = await withPage(
      async (page) => {
        await page.evaluate((batches) => (window.__batches = batches), [
          [fakeEntry("pointerdown", 1, 100, 101, 101.5, 264)],
          [fakeEntry("pointerup", 1, 102, 102.1, 102.3, 264), fakeEntry("click", 1, 102, 102.4, 352.4, 264)],
        ]);
        await runAll(page);
        await page.waitForTimeout(200);
        return readAll(page);
      },
      { init: `(${FAKE_OBSERVER})(["event"])` }
    );
    expect(inp.details.totalInteractions).toBe(1);
    expect(inp.details.worstEvent).toMatch(/^click /);
    expect(inp.details.phases).toEqual({ inputDelay: 1, processingTime: 251, presentationDelay: 12 });
    expect(interactions.count).toBe(1);
    expect(interactions.items).toEqual([{ type: "click", durationMs: 264, rating: "needs-improvement" }]);
    expect(breakdown.items).toEqual([
      { type: "click", count: 1, p75Ms: 264, inputDelayMs: 1, processingMs: 251, presentationMs: 12, rating: "needs-improvement" },
    ]);
  }, 30000);
});

describe("getINPDetails()", () => {
  it("returns at most 15 interactions as plain data, slowest first, with the target as a selector", async () => {
    const { details, matches } = await withPage(
      async (page) => {
        await page.evaluate((batches) => (window.__batches = batches), [
          Array.from({ length: 30 }, (_, i) => fakeEntry("click", i + 1, i * 1000, i * 1000 + 2, i * 1000 + 50 + i, 64 + i * 8, i % 2 ? "#slow" : "#fast")),
        ]);
        await page.evaluate(source(SNIPPETS.inp.name));
        await page.waitForTimeout(200);
        return page.evaluate(() => {
          const details = window.getINPDetails();
          const json = JSON.parse(JSON.stringify(details));
          return {
            details: json,
            matches: json.items.map((i) => document.querySelector(i.target)?.id ?? null),
          };
        });
      },
      { init: `(${FAKE_OBSERVER})(["event"])` }
    );
    expect(details.script).toBe("INP");
    expect(details.status).toBe("ok");
    expect(details.count).toBe(30);
    expect(details.items).toHaveLength(15);
    const durations = details.items.map((i) => i.duration);
    expect(durations).toEqual([...durations].sort((a, b) => b - a));
    expect(durations[0]).toBe(64 + 29 * 8);
    expect(Object.keys(details.items[0]).sort()).toEqual(["duration", "eventType", "formattedName", "phases", "startTime", "target"]);
    expect(matches).toEqual(details.items.map((_, i) => ((29 - i) % 2 ? "slow" : "fast")));
  }, 30000);

  it("returns an error with no items before any interaction", async () => {
    const details = await withPage(async (page) => {
      await page.evaluate(source(SNIPPETS.inp.name));
      return page.evaluate(() => window.getINPDetails());
    });
    expect(details).toEqual(expect.objectContaining({ script: "INP", status: "error", count: 0, items: [] }));
    expect(typeof details.error).toBe("string");
  }, 30000);
});

describe("a browser without event timing entries", () => {
  it.each(Object.values(SNIPPETS).map((s) => s.name))("%s returns unsupported", async (name) => {
    const result = await withPage(
      async (page) => page.evaluate(source(name)),
      { init: `(${FAKE_OBSERVER})([])` }
    );
    expect(result.status).toBe("unsupported");
    expect(result.error).toMatch(/event/);
  }, 30000);
});
