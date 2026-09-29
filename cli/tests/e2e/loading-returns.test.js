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

async function onPage(path, fn, { init, initArg } = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    if (init) await page.addInitScript(init, initArg);
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

// ── 6c-2: the rest of the Loading and Media snippets ────────────────────────────────
const keysOf = (o) => Object.keys(o).sort().join(",");
const runOn = (path, name, opts) =>
  onPage(
    path,
    async (page) => {
      await page.waitForTimeout(400);
      return page.evaluate(source(name));
    },
    opts
  );

describe("Priority-Hints-Audit and Validate-Preload-Async-Defer-Scripts", () => {
  it("Priority-Hints-Audit puts the fix inside the message", async () => {
    const r = await runOn("/priority", "Loading/Priority-Hints-Audit");
    expect(r.issues.length).toBeGreaterThan(0);
    for (const i of r.issues) expect(keysOf(i)).toBe("message,severity");
    expect(r.issues.some((i) => i.message.includes("Fix: "))).toBe(true);
    expect(r.issues.every((i) => !i.message.includes(" — "))).toBe(true);
  }, 30000);

  it("Validate-Preload-Async-Defer-Scripts returns one homogeneous item per script", async () => {
    const r = await runOn("/seeded", "Loading/Validate-Preload-Async-Defer-Scripts");
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(50);
    expect(new Set(r.items.map(keysOf)).size).toBe(1);
    expect(keysOf(r.items[0])).toBe("location,reviewNote,strategy,type,url");
    for (const i of r.issues) expect(keysOf(i)).toBe("message,severity");
  }, 30000);
});

describe("Resource-Hints-Validation", () => {
  it("returns the origins that need a hint, and the redundant ones", async () => {
    const missing = await runOn("/hints", "Loading/Resource-Hints-Validation");
    const add = missing.items.find((i) => i.action === "add-preconnect");
    expect(add).toBeDefined();
    expect(add.domain).toBe(servers.otherBase);
    expect(add.requestCount).toBe(6);
    expect(add.recommendedHint).toBe("preconnect");
    expect(new Set(missing.items.map(keysOf)).size).toBe(1);

    const redundant = await runOn("/hints-redundant", "Loading/Resource-Hints-Validation");
    const remove = redundant.items.find((i) => i.action === "remove-dns-prefetch");
    expect(remove).toBeDefined();
    expect(remove.domain).toBe(servers.otherBase);
  }, 60000);
});

describe("Resource-Hints", () => {
  it("returns the origins without preconnect, with their request data", async () => {
    const r = await runOn("/hints-host", "Loading/Resource-Hints");
    const list = r.details.missingPreconnects;
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(20);
    expect(keysOf(list[0])).toBe("origin,recommendedHint,requestCount,resourceTypes,sizeBytes");
    expect(list[0].origin).toBe(servers.otherBase.replace("127.0.0.1", "localhost"));
    expect(list[0].requestCount).toBe(3);
    expect(Array.isArray(list[0].resourceTypes)).toBe(true);
  }, 30000);

  it("caps the list at 20 origins and keeps the total", async () => {
    const stub = () => {
      const real = performance.getEntriesByType.bind(performance);
      const fake = Array.from({ length: 30 }, (_, i) => Array.from({ length: 2 }, (_, j) => ({
        name: `http://third-${i}.example/f${j}.js`, entryType: "resource", initiatorType: "script",
        transferSize: 100, encodedBodySize: 100, decodedBodySize: 100, duration: 10, startTime: 5,
        responseEnd: 15, responseStart: 10, requestStart: 8, workerStart: 0,
      }))).flat();
      performance.getEntriesByType = (t) => (t === "resource" ? fake : real(t));
    };
    const r = await runOn("/empty", "Loading/Resource-Hints", { init: stub });
    expect(r.details.missingPreconnectsCount).toBe(30);
    expect(r.details.missingPreconnects.length).toBe(20);
  }, 30000);
});

describe("FCP", () => {
  it("returns the render-blocking resources and the phases", async () => {
    const r = await runOn("/seeded", "Loading/FCP");
    expect(r.status).toBe("ok");
    expect(r.items.length).toBe(r.details.blockingResourceCount);
    expect(r.items.some((i) => i.type === "CSS" && i.url === "style.css")).toBe(true);
    expect(new Set(r.items.map(keysOf)).size).toBe(1);
    expect(r.details.ttfbMs).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("measures the phases from activationStart on a prerendered page", async () => {
    const r = await runOn("/seeded", "Loading/FCP", {
      init: () => {
        const nav = { activationStart: 500, startTime: 0, responseStart: 600 };
        const realByType = performance.getEntriesByType.bind(performance);
        const realByName = performance.getEntriesByName.bind(performance);
        performance.getEntriesByType = (t) => (t === "navigation" ? [nav] : realByType(t));
        performance.getEntriesByName = (n, t) =>
          n === "first-contentful-paint" ? [{ name: n, startTime: 1500 }] : realByName(n, t);
      },
    });
    expect(r.value).toBe(1000);
    expect(r.details.ttfbMs).toBe(100);
    const { ttfbMs, renderBlockingLoadMs, renderDelayMs } = r.details;
    expect(renderBlockingLoadMs).toBeGreaterThanOrEqual(0);
    expect(renderDelayMs).toBeGreaterThanOrEqual(0);
    expect(ttfbMs + renderBlockingLoadMs + renderDelayMs).toBe(1000);
  }, 30000);
});

describe("Fonts-Preloaded-Loaded-and-used-above-the-fold", () => {
  it("lists the preloaded fonts in details and keeps items and usedFonts as they were", async () => {
    const r = await runOn("/fonts", "Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold");
    const pre = r.details.preloadedFonts;
    expect(pre).toHaveLength(2);
    expect(keysOf(pre[0])).toBe("crossorigin,family,fontType,href,thirdParty");
    expect(pre.find((f) => f.family === "b").thirdParty).toBe(true);
    expect(pre.find((f) => f.family === "a").thirdParty).toBe(false);
    // The Visualizer reads items (loaded fonts) and usedFonts
    expect(Array.isArray(r.usedFonts)).toBe(true);
    for (const f of r.items) expect(Object.keys(f).sort()).toEqual(["display", "family", "style", "weight"]);
  }, 30000);
});

describe("SVG-Embedded-Bitmap-Analysis", () => {
  it("counts inline SVGs and flags a sprite opportunity", async () => {
    const many = await runOn("/svgs", "Media/SVG-Embedded-Bitmap-Analysis");
    expect(many.details).toEqual({
      externalSvgCount: 0,
      inlineSvgTotal: 7,
      svgsWithUse: 1,
      standaloneInlineSvgs: 6,
      spriteOpportunity: true,
    });
    const none = await runOn("/empty", "Media/SVG-Embedded-Bitmap-Analysis");
    expect(none.details.spriteOpportunity).toBe(false);
  }, 30000);
});

describe("Network-Bandwidth-Connection-Quality", () => {
  // addInitScript serializes the function, so the type travels as its argument
  const withConnection = (effectiveType) => ({
    init: (type) =>
      Object.defineProperty(navigator, "connection", {
        value: { effectiveType: type, downlink: 1.5, rtt: 300, saveData: false, addEventListener() {} },
      }),
    initArg: effectiveType,
  });
  it.each([["4g", "good"], ["3g", "needs-improvement"], ["2g", "poor"], ["slow-2g", "poor"]])(
    "rates %s as %s",
    async (type, rating) => {
      const r = await runOn("/empty", "Resources/Network-Bandwidth-Connection-Quality", {
        ...withConnection(type),
      });
      expect(r.rating).toBe(rating);
    },
    30000
  );
  it("has no rating for an unknown connection type", async () => {
    const r = await runOn("/empty", "Resources/Network-Bandwidth-Connection-Quality", {
      ...withConnection("5g"),
    });
    expect("rating" in r).toBe(false);
  }, 30000);
});

describe("SSR-Hydration-Data-Analysis", () => {
  it("returns props and islands as items of one shape, biggest first, capped at 30", async () => {
    const next = await runOn("/ssr", "Loading/SSR-Hydration-Data-Analysis");
    expect(new Set(next.items.map(keysOf)).size).toBe(1);
    expect(keysOf(next.items[0])).toBe("detail,flags,framework,kind,name,sizeBytes");
    expect(next.items[0].name).toBe("rows");
    expect(next.items[0].flags).toContain("large-array");
    const sizes = next.items.map((i) => i.sizeBytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(next.items.length).toBeLessThanOrEqual(30);
    expect(next.details.frameworks[0].name).toBe("Next.js");

    const astro = await runOn("/astro", "Loading/SSR-Hydration-Data-Analysis");
    const island = astro.items.find((i) => i.kind === "island" && i.name === "Counter.js");
    expect(island.detail).toBe("load");
    expect(keysOf(island)).toBe(keysOf(next.items[0]));
  }, 60000);

  it("names the sensitive-looking key as a warning", async () => {
    const r = await runOn("/ssr", "Loading/SSR-Hydration-Data-Analysis");
    const sensitive = r.issues.find((i) => /sensitive/i.test(i.message));
    expect(sensitive.severity).toBe("warning");
    expect(sensitive.message).toContain("session.token");
  }, 30000);

  it("does not flag a value that only contains the word token", async () => {
    const r = await runOn("/ssr-clean", "Loading/SSR-Hydration-Data-Analysis");
    expect(r.issues.some((i) => /sensitive/i.test(i.message))).toBe(false);
  }, 30000);
});

describe("CSS-Media-Queries-Analysis", () => {
  it("returns the performance impact as numbers, without printing the impact report", async () => {
    const lines = [];
    const r = await onPage("/mq", async (page) => {
      page.on("console", (m) => lines.push(m.text()));
      const result = await page.evaluate(source("Loading/CSS-Media-Queries-Analysis"));
      await page.waitForTimeout(300);
      return result;
    });
    expect(r.status).toBe("ok");
    const impact = r.details.performanceImpact;
    expect(impact.unnecessaryBytes).toBeGreaterThan(0);
    const devices = Object.values(impact.deviceImpact);
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) {
      expect(keysOf(d)).toBe("fcpImpactMs,inpOverheadMs,lcpImpactMs,renderBlockingTimeMs,runtimeOverheadMs");
      for (const v of Object.values(d)) expect(typeof v).toBe("number");
    }
    expect(JSON.stringify(impact)).not.toMatch(/KB|%"/);
    expect(lines.some((l) => l.includes("PERFORMANCE IMPACT ANALYSIS"))).toBe(false);
  }, 30000);
});

describe("running a snippet twice in the same console", () => {
  it.each(["Loading/CSS-Media-Queries-Analysis", "Loading/Content-Visibility"])(
    "%s does not fail the second time",
    async (name) => {
      const [a, b] = await onPage("/mq", async (page) => [
        await page.evaluate(source(name)),
        await page.evaluate(source(name)),
      ]);
      expect(b.status).toBe(a.status);
    },
    30000
  );
});

describe("Content-Visibility", () => {
  it("reports that nothing uses it as an information issue, with no filler items", async () => {
    const none = await runOn("/empty", "Loading/Content-Visibility");
    expect(none.count).toBe(0);
    expect(none.items).toEqual([]);
    expect(none.issues.some((i) => i.severity === "info" && /No content-visibility usage/i.test(i.message))).toBe(true);

    const used = await runOn("/cv", "Loading/Content-Visibility");
    expect(used.count).toBeGreaterThan(0);
    expect(used.issues.some((i) => /No content-visibility usage/i.test(i.message))).toBe(false);
  }, 60000);
});
