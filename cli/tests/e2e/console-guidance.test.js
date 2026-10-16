import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { launch, startContractServers } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// What the snippets tell the reader in the console has to be true: a hint that sends the reader
// the wrong way (reloading a page discards what the snippet measured) is a bug of the snippet.
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

async function withConsole(path, run) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const lines = [];
  page.on("console", (m) => lines.push(m.text()));
  try {
    await page.goto(`${servers.base}${path}`, { waitUntil: "load" });
    await run(page, lines);
    return lines;
  } finally {
    await page.close();
  }
}

describe("LCP-Subparts", () => {
  it("does not ask to reload the page to see the measures it adds", async () => {
    const lines = await withConsole("/seeded", async (page, lines) => {
      await page.evaluate(source("CoreWebVitals/LCP-Subparts"));
      await page.waitForFunction(() => performance.getEntriesByType("measure").length >= 4, null, { timeout: 15000 });
      await expect.poll(() => lines.some((l) => l.includes("Measures added")), { timeout: 5000 }).toBe(true);
    });
    const hint = lines.slice(lines.findIndex((l) => l.includes("Measures added")))[1];
    expect(hint).not.toMatch(/reload/i);
    expect(hint).toContain('performance.getEntriesByType("measure")');
  }, 30000);
});

describe("Interactions", () => {
  it("does not present the p75 of one page view as its INP", async () => {
    const lines = await withConsole("/behaviors", async (page) => {
      await page.waitForTimeout(500);
      await page.evaluate(source("Interaction/Interactions"));
      for (let i = 0; i < 3; i++) await page.click("#slow");
      await page.waitForFunction(() => window.getInteractionSummary().count >= 3, null, { timeout: 15000, polling: 200 });
      await page.evaluate(() => window.getInteractionSummary());
    });
    expect(lines.some((l) => /P75 \(INP\)/.test(l))).toBe(false);
    expect(lines.some((l) => /^\s*P75: /.test(l))).toBe(true);
    expect(lines.some((l) => /^\s*Worst \(approximates INP\): /.test(l))).toBe(true);
  }, 60000);
});
