import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Image-Element-Audit judges "the LCP image", so it has to follow the element the browser
// reports as the Largest Contentful Paint, not the largest image in the viewport.
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

async function runOn(path) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(600);
    return await page.evaluate(source("Media/Image-Element-Audit"));
  } finally {
    await page.close();
  }
}

const lcpIssues = (r) => r.issues.filter((i) => /LCP image/.test(i.message));

describe("Image-Element-Audit, LCP image", () => {
  it("audits the image that is the LCP element", async () => {
    const r = await runOn("/lcp-image");
    expect(r.details.lcpCandidate).not.toBeNull();
    expect(r.items.filter((i) => i.isLCP)).toHaveLength(1);
    expect(r.items[0].isLCP).toBe(true);
    expect(lcpIssues(r).length).toBeGreaterThan(0);
  }, 60000);

  it("names no LCP image when the LCP element is text, even if an image is in the viewport", async () => {
    const r = await runOn("/lcp-text");
    expect(r.details.lcpCandidate).toBeNull();
    expect(r.items.some((i) => i.isLCP)).toBe(false);
    expect(lcpIssues(r)).toEqual([]);
    expect(r.issues.some((i) => i.severity === "info" && /LCP element is not an <img>/.test(i.message))).toBe(true);
  }, 60000);

  it("names no LCP image when the LCP element is a CSS background", async () => {
    const r = await runOn("/lcp-background");
    expect(r.details.lcpCandidate).toBeNull();
    expect(r.items.some((i) => i.isLCP)).toBe(false);
    expect(lcpIssues(r)).toEqual([]);
  }, 60000);
});
