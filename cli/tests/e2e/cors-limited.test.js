import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// A snippet that reads sizes or timings of cross-origin resources returns a top-level
// `corsLimitedAnalysis`: true when a resource without Timing-Allow-Origin left part of the
// set unmeasured (so the totals are a lower bound), false when everything was measured.
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

// "/hints-host" loads three scripts from another host with no Timing-Allow-Origin header;
// "/cap-scripts" loads only scripts of its own origin.
const SCRIPT_SNIPPETS = [
  "Loading/JS-Execution-Time-Breakdown",
  "Loading/Cache-Strategy-Analysis",
  "Loading/TTFB-Resources",
  "Loading/First-And-Third-Party-Script-Info",
  "Loading/First-And-Third-Party-Script-Timings",
  "Loading/Script-Loading",
  "Loading/Resource-Hints",
];

describe("corsLimitedAnalysis", () => {
  it.each(SCRIPT_SNIPPETS)("%s is true when a cross-origin resource hides its data", async (name) => {
    const r = await runOn("/hints-host", name);
    expect(r.corsLimitedAnalysis).toBe(true);
  }, 90000);

  it.each(SCRIPT_SNIPPETS)("%s is false when every resource is measured", async (name) => {
    const r = await runOn("/cap-scripts", name);
    expect(r.corsLimitedAnalysis).toBe(false);
  }, 90000);

  it("Image-Element-Audit is true when the format of a cross-origin image can only be guessed from its URL", async () => {
    const r = await runOn("/cors-images", "Media/Image-Element-Audit");
    expect(r.details.formatGuessedCount).toBe(1);
    expect(r.corsLimitedAnalysis).toBe(true);
  }, 60000);

  it("Image-Element-Audit is false when every format was read from the response", async () => {
    const r = await runOn("/priority", "Media/Image-Element-Audit");
    expect(r.details.formatGuessedCount).toBe(0);
    expect(r.corsLimitedAnalysis).toBe(false);
  }, 60000);

  it("Image-Element-Audit is false with no image", async () => {
    const r = await runOn("/empty", "Media/Image-Element-Audit");
    expect(r.corsLimitedAnalysis).toBe(false);
  }, 60000);

  it("TTFB-Resources reports it even when nothing could be measured", async () => {
    const r = await runOn("/hints-host", "Loading/TTFB-Resources");
    expect(r.corsLimitedAnalysis).toBe(true);
  }, 60000);

  it("Resource-Hints counts the third-party resources whose size is hidden", async () => {
    const r = await runOn("/hints-host", "Loading/Resource-Hints");
    expect(r.details.sizeUnknownCount).toBe(3);
  }, 60000);
});
