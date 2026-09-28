import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name));

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        try {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(fixture(req.url.replace(/^\//, "")));
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

const asExpression = (path) => loadSnippet(path).trim().replace(/;\s*$/, "");

// Reference CLS: largest session window (gap < 1s, window < 5s), ignoring
// shifts with recent input. Independent of the snippets under test.
function referenceCls(entries) {
  let cls = 0;
  let windowValue = 0;
  let first = null;
  let last = null;
  for (const e of entries) {
    if (e.hadRecentInput) continue;
    if (last && e.startTime - last.startTime < 1000 && e.startTime - first.startTime < 5000) {
      windowValue += e.value;
    } else {
      windowValue = e.value;
      first = e;
    }
    last = e;
    cls = Math.max(cls, windowValue);
  }
  return cls;
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    return await fn(await browser.newPage());
  } finally {
    await browser.close();
  }
}

describe("CLS uses session windows", () => {
  async function run(path, readValue) {
    return withBrowser(async (page) => {
      await page.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__shifts.push({ value: e.value, startTime: e.startTime, hadRecentInput: e.hadRecentInput });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${baseUrl}/cls-bursts.html`);
      await page.waitForTimeout(2800);
      const shifts = await page.evaluate(() => window.__shifts);
      const result = await page.evaluate(asExpressionInPage(path));
      return { shifts, value: readValue(result) };
    });
  }
  // page.evaluate takes a string expression
  const asExpressionInPage = (path) => asExpression(path);

  it("fixture produces two separate bursts", async () => {
    await withBrowser(async (page) => {
      await page.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__shifts.push({ value: e.value, startTime: e.startTime });
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${baseUrl}/cls-bursts.html`);
      await page.waitForTimeout(2800);
      const shifts = await page.evaluate(() => window.__shifts);
      expect(shifts.length).toBeGreaterThanOrEqual(2);
      expect(shifts.at(-1).startTime - shifts[0].startTime).toBeGreaterThan(1000);
    });
  }, 30000);

  it("CLS returns the largest window, not the sum of all shifts", async () => {
    const { shifts, value } = await run("CoreWebVitals/CLS", (r) => r.value);
    const sum = shifts.reduce((s, e) => s + e.value, 0);
    const expected = referenceCls(shifts);
    expect(sum).toBeGreaterThan(expected);
    expect(value).toBeCloseTo(expected, 3);
  }, 30000);

  it("Layout-Shift-Loading-and-Interaction returns the largest window", async () => {
    const { shifts, value } = await run(
      "Interaction/Layout-Shift-Loading-and-Interaction",
      (r) => r.value
    );
    const sum = shifts.reduce((s, e) => s + e.value, 0);
    const expected = referenceCls(shifts);
    expect(sum).toBeGreaterThan(expected);
    expect(value).toBeCloseTo(expected, 3);
  }, 30000);
});

// Replaces PerformanceObserver so a test can feed crafted "event" entries and
// record how the snippet calls observe().
const FAKE_OBSERVER = () => {
  window.__observeCalls = [];
  class FakeObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe(opts) {
      window.__observeCalls.push(opts);
      if (opts.type === "event" && window.__fakeEvents) {
        this.cb({ getEntries: () => window.__fakeEvents });
      }
    }
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  FakeObserver.supportedEntryTypes = ["event", "long-animation-frame", "layout-shift", "longtask"];
  window.PerformanceObserver = FakeObserver;
};

async function runInp({ events, interactionCount, consoleSink }) {
  return withBrowser(async (page) => {
    if (consoleSink) {
      page.on("console", (m) =>
        consoleSink.push({ text: m.text(), style: m.args()[1]?.jsonValue().catch(() => null) })
      );
    }
    await page.addInitScript(FAKE_OBSERVER);
    await page.addInitScript(
      ({ events, interactionCount }) => {
        window.__fakeEvents = events.map((e, i) => ({
          name: "click",
          interactionId: i + 1,
          startTime: i * 10,
          processingStart: i * 10 + 5,
          processingEnd: i * 10 + 20,
          target: null,
          ...e,
        }));
        if (interactionCount !== undefined) {
          Object.defineProperty(performance, "interactionCount", { value: interactionCount });
        }
      },
      { events, interactionCount }
    );
    await page.goto(`${baseUrl}/observer-lcp.html`);
    await page.evaluate(asExpression("CoreWebVitals/INP"));
    return page.evaluate(() => window.getINP());
  });
}

describe("INP", () => {
  it("picks the p98 index from performance.interactionCount, not only tracked interactions", async () => {
    // 60 tracked interactions (all > 16ms) out of 200 total: index = floor(200/50) = 4.
    const events = Array.from({ length: 60 }, (_, i) => ({ duration: 500 - i * 5 }));
    const result = await runInp({ events, interactionCount: 200 });
    expect(result.value).toBe(480);
  }, 30000);

  it("falls back to tracked interactions when interactionCount is unavailable", async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({ duration: 500 - i * 5 }));
    const result = await runInp({ events });
    expect(result.value).toBe(495);
  }, 30000);

  it("never reports a negative presentation delay", async () => {
    // processingEnd is later than startTime + duration.
    const result = await runInp({
      events: [{ duration: 100, startTime: 0, processingStart: 10, processingEnd: 150 }],
    });
    expect(result.details.phases.presentationDelay).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("styles the worst-interaction line with the rating color", async () => {
    const sink = [];
    await runInp({ events: [{ duration: 300 }], consoleSink: sink });
    const worst = sink.find((m) => m.text.includes("Worst Interaction"));
    expect(worst).toBeDefined();
    const style = await worst.style;
    expect(style).not.toContain("${color}");
    expect(style).toMatch(/color: #[0-9A-Fa-f]{6}/);
  }, 30000);
});

describe("Long Animation Frames event correlation", () => {
  it("observes event timing from 16ms so short interactions are correlated", async () => {
    const calls = await withBrowser(async (page) => {
      await page.addInitScript(FAKE_OBSERVER);
      await page.goto(`${baseUrl}/observer-lcp.html`);
      await page.evaluate(asExpression("Interaction/Long-Animation-Frames"));
      return page.evaluate(() => window.__observeCalls);
    });
    const eventCall = calls.find((c) => c.type === "event");
    expect(eventCall.durationThreshold).toBe(16);
  }, 30000);
});
