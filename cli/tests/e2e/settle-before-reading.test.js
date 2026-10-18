import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { runSnippets, VIEWPORT_PRESETS } from "../../src/runner.js";
import { settle } from "../../src/interactions.js";
import { loadSnippet } from "../../src/load-snippet.js";

// The browser reports the timing of an interaction after the frame that follows it, so the data of a
// snippet read right after the last step of a script can miss that step. The runner waits for it.
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body>
<button id="work">Work</button> <a id="away" href="/other">Away</a>
<script>
  document.getElementById("work").addEventListener("click", () => {
    const end = performance.now() + 120;
    while (performance.now() < end) {}
  });
</script></body></html>`;

// The same page on a machine where the browser delivers Event Timing entries late: every observer
// callback arrives 400 ms after the entries, longer than the frames the runner waits for.
const LATE_PAGE = PAGE.replace(
  "<script>",
  `<script>
  const NativeObserver = window.PerformanceObserver;
  window.PerformanceObserver = class extends NativeObserver {
    constructor(callback) {
      super((list, observer) => {
        const entries = list.getEntries();
        const late = {
          getEntries: () => entries,
          getEntriesByType: (type) => entries.filter((e) => e.entryType === type),
          getEntriesByName: (name) => entries.filter((e) => e.name === name),
        };
        setTimeout(() => callback(late, observer), 400);
      });
    }
  };
`
);

let server;
let url;
let browser;

beforeAll(async () => {
  await new Promise((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      if (req.url === "/other") res.end("<!DOCTYPE html><title>other</title><p>other</p>");
      else res.end(req.url === "/late" ? LATE_PAGE : PAGE);
    });
    server.listen(0, "127.0.0.1", () => {
      url = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  browser = await chromium.launch();
}, 30000);

afterAll(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

const item = (id, path) => ({ id, path, source: loadSnippet(path) });
const run = (items, interactions, path = "/") =>
  runSnippets({ url: url + path, items, interactions, waitMs: 300, viewport: VIEWPORT_PRESETS.desktop });

const ENDS_ON_CLICK = [{ action: "click", selector: "#work" }];

describe("a script that ends on a click", () => {
  it("records that click for the tracking snippets, without a final wait step", async () => {
    // Three runs: the wait has to hold every time, not on average
    for (let i = 0; i < 3; i++) {
      const { results } = await run(
        [item("interactions", "Interaction/Interactions"), item("latency", "Interaction/Input-Latency-Breakdown")],
        ENDS_ON_CLICK
      );
      for (const r of results) {
        expect(r.status, `run ${i + 1}, ${r.id}: ${r.error}`).toBe("ok");
        expect(r.count).toBeGreaterThanOrEqual(1);
      }
    }
  }, 90000);

  it("gives INP a value, which it reads after the steps like the other snippets", async () => {
    const { results } = await run([item("INP", "CoreWebVitals/INP")], ENDS_ON_CLICK);
    expect(results[0].status).toBe("ok");
    expect(results[0].value).toBeGreaterThan(0);
  }, 60000);

  it("records that click when the browser delivers its timing late", async () => {
    const { results } = await run(
      [item("interactions", "Interaction/Interactions"), item("latency", "Interaction/Input-Latency-Breakdown"), item("INP", "CoreWebVitals/INP")],
      ENDS_ON_CLICK,
      "/late"
    );
    for (const r of results) {
      expect(r.status, `${r.id}: ${r.error}`).toBe("ok");
    }
    expect(results.find((r) => r.id === "INP").value).toBeGreaterThan(0);
  }, 60000);

  it("still returns a result when the click navigates away", async () => {
    const { results } = await run([item("dom", "Interaction/DOM-Size-and-Depth")], [{ action: "click", selector: "#away" }]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("dom");
  }, 60000);
});

describe("settle", () => {
  const withPage = async (fn) => {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "load" });
      return await fn(page);
    } finally {
      await page.close();
    }
  };

  it("returns within a few frames on a page that renders", async () => {
    const ms = await withPage(async (page) => {
      const start = Date.now();
      await settle(page);
      return Date.now() - start;
    });
    expect(ms).toBeLessThan(500);
  }, 30000);

  it("gives up at the limit when the page never renders a frame", async () => {
    const ms = await withPage(async (page) => {
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      const start = Date.now();
      await settle(page, 300);
      return Date.now() - start;
    });
    expect(ms).toBeGreaterThanOrEqual(290);
    expect(ms).toBeLessThan(1500);
  }, 30000);

  it("does not throw when the page is gone", async () => {
    await withPage(async (page) => {
      await page.close();
      await expect(settle(page)).resolves.toBeUndefined();
    });
  }, 30000);
});
