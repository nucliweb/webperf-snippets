import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { runSnippets } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, "../fixtures", name));

// Chrome only exposes these entry types through a PerformanceObserver, so
// performance.getEntriesByType() returns [] for them. The snippets must read
// them with a buffered observer to return real data.
let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        const name = req.url.replace(/^\//, "") || "index.html";
        try {
          const type = name.endsWith(".png") ? "image/png" : name.endsWith(".webm") ? "video/webm" : "text/html";
          res.writeHead(200, { "Content-Type": type });
          res.end(fixture(name));
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

async function run(path, fixtureName) {
  const { results } = await runSnippets({
    url: `${baseUrl}/${fixtureName}`,
    items: [{ id: path, path, source: loadSnippet(path) }],
    waitMs: 1500,
  });
  return results[0];
}

// Runs a snippet once the video of the page has presented its first frame, and Chrome has had two
// frames to report it as an LCP candidate. A fixed wait after the load is not enough on a busy
// machine, where the frame comes later and the LCP is still the text of the page.
async function runAfterFirstFrame(path, fixtureName, appearsWithinMs = 2000) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/${fixtureName}`, { waitUntil: "load" });
    await page.waitForSelector("video", { state: "attached", timeout: appearsWithinMs });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const video = document.querySelector("video");
          video.requestVideoFrameCallback(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })
    );
    return await page.evaluate(loadSnippet(path).trim().replace(/;\s*$/, ""));
  } finally {
    await browser.close();
  }
}

describe("snippets that read observer-only entry types", () => {
  it("LCP-Trail returns the LCP candidates", async () => {
    const r = await run("CoreWebVitals/LCP-Trail", "observer-lcp.html");
    expect(r.status).toBe("ok");
    expect(r.details.candidateCount).toBeGreaterThan(0);
  }, 30000);

  it("LCP-Image-Entropy detects the LCP element", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "observer-lcp.html");
    expect(r.status).toBe("ok");
    expect(r.details.lcpImage).not.toBeNull();
  }, 30000);

  it("LCP-Image-Entropy says when the LCP is text, not an image, and keeps the images of the page", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "index.html");
    expect(r.status).toBe("ok");
    expect(r.details.lcpElement).toMatch(/^(h1|p)$/);
    expect(r.details.lcpImage).toBeNull();
    expect(r.issues).toContainEqual({
      severity: "info",
      message: `The LCP element is <${r.details.lcpElement}>, text and not an image, so its entropy does not apply. Run the LCP snippet to measure it.`,
    });
  }, 30000);

  it("LCP-Image-Entropy says when the LCP image is not an <img>, such as a CSS background", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "lcp-background.html");
    expect(r.details.lcpElement).toBe("div");
    expect(r.issues).toContainEqual({
      severity: "info",
      message:
        "The LCP is the image of a <div>, such as a CSS background or a video poster, and this snippet reads <img> elements only. Run the LCP snippet to measure it.",
    });
  }, 30000);

  it("LCP-Image-Entropy says when the size of the LCP <img> cannot be read", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "lcp-data-image.html");
    expect(r.details.lcpElement).toBe("img");
    expect(r.issues).toContainEqual({
      severity: "info",
      message:
        "The LCP <img> has no file size to read, as with a data: URL or a cross-origin image without Timing-Allow-Origin, so its entropy cannot be computed.",
    });
  }, 30000);

  it("LCP-Image-Entropy adds no such issue when the LCP is an <img>", async () => {
    const r = await run("CoreWebVitals/LCP-Image-Entropy", "observer-lcp.html");
    expect(r.details.lcpElement).toBe("img");
    expect(r.issues.map((i) => i.message).join(" ")).not.toMatch(/Run the LCP snippet/);
  }, 30000);

  it("LCP-Video-Candidate finds an LCP entry", async () => {
    const r = await run("CoreWebVitals/LCP-Video-Candidate", "observer-lcp.html");
    expect(r.error).not.toBe("No LCP entries found");
  }, 30000);

  it("LCP-Video-Candidate gives no LCP value when the LCP is not a video, and points to the LCP snippet", async () => {
    const r = await run("CoreWebVitals/LCP-Video-Candidate", "observer-lcp.html");
    expect(r.status).toBe("ok");
    expect(r).not.toHaveProperty("value");
    expect(r).not.toHaveProperty("rating");
    expect(r.details).toEqual({ isVideo: false, lcpElement: "img", lcpUrl: expect.stringMatching(/\/hero\.png$/) });
    expect(r.issues).toEqual([
      {
        severity: "info",
        message: "The LCP element is <img>, not a <video>. Run the LCP snippet to measure it, and LCP Subparts to see its phases.",
      },
    ]);
  }, 30000);

  it("LCP-Video-Candidate tells the first frame of a video from its poster", async () => {
    const frame = await runAfterFirstFrame("CoreWebVitals/LCP-Video-Candidate", "video-first-frame.html");
    expect(frame.details.lcpSource).toBe("first-frame");
    expect(frame.details.posterUrl).toBeNull();
    expect(frame.details.videoUrl).toMatch(/\/clip\.webm$/);
    expect(frame.issues.map((i) => i.message)).toContain(
      "LCP is the first video frame — adding a poster gives explicit control over the LCP image"
    );

    const poster = await run("CoreWebVitals/LCP-Video-Candidate", "video-poster.html");
    expect(poster.details.lcpSource).toBe("poster");
    expect(poster.details.posterUrl).toMatch(/\/hero\.png$/);
    expect(poster.details.videoUrl).toBeNull();
  }, 30000);

  it("LCP-Video-Candidate warns when the LCP rendered long after the load", async () => {
    const late = await runAfterFirstFrame("CoreWebVitals/LCP-Video-Candidate", "video-late.html", 13000);
    expect(late.details.lcpSource).toBe("first-frame");
    expect(late.issues.map((i) => i.message).join(" ")).toMatch(/rendered \d+ s after the page loaded/);

    const early = await runAfterFirstFrame("CoreWebVitals/LCP-Video-Candidate", "video-first-frame.html");
    expect(early.issues.map((i) => i.message).join(" ")).not.toMatch(/after the page loaded/);
  }, 40000);

  it("LongTask counts buffered long tasks", async () => {
    const r = await run("Interaction/LongTask", "observer-longtask.html");
    expect(r.count).toBeGreaterThan(0);
    expect(r.details.worstTaskMs).toBeGreaterThanOrEqual(50);
  }, 30000);

  it("Layout-Shift-Loading-and-Interaction returns buffered shifts", async () => {
    const r = await run("Interaction/Layout-Shift-Loading-and-Interaction", "observer-shift.html");
    expect(r.value).toBeGreaterThan(0);
    expect(r.details.shiftCount).toBeGreaterThan(0);
  }, 30000);
});

describe("snippets on browsers without the required entry type", () => {
  const cases = [
    ["CoreWebVitals/CLS", "layout-shift"],
    ["CoreWebVitals/INP", "event"],
    ["CoreWebVitals/LCP", "largest-contentful-paint"],
    ["CoreWebVitals/LCP-Trail", "largest-contentful-paint"],
    ["CoreWebVitals/LCP-Image-Entropy", "largest-contentful-paint"],
    ["CoreWebVitals/LCP-Subparts", "largest-contentful-paint"],
    ["CoreWebVitals/LCP-Video-Candidate", "largest-contentful-paint"],
    ["Interaction/LongTask", "longtask"],
    ["Interaction/Layout-Shift-Loading-and-Interaction", "layout-shift"],
  ];

  it.each(cases)("%s reports unsupported instead of a false 'good'", async (path) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(PerformanceObserver, "supportedEntryTypes", {
          get: () => ["paint", "navigation", "resource"],
        });
      });
      await page.goto(`${baseUrl}/observer-lcp.html`);
      const src = loadSnippet(path).trim().replace(/;\s*$/, "");
      const result = await page.evaluate(src);
      expect(result.status).toBe("unsupported");
    } finally {
      await browser.close();
    }
  }, 30000);
});
