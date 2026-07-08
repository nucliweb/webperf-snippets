import { chromium } from "playwright";
import { loadSnippet } from "./load-snippet.js";
import { runInteractions } from "./interactions.js";

export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

const DEFAULT_NAV_TIMEOUT = 30000;
const DEFAULT_EVALUATE_TIMEOUT = 10000;

// Snippets are IIFEs. Playwright evaluates a string as an expression, so we
// trim trailing semicolons to keep the IIFE call as a single expression and
// recover its return value in Node.
function toExpression(source) {
  return source.trim().replace(/;\s*$/, "");
}

async function evaluateItems(page, items, timeout = DEFAULT_EVALUATE_TIMEOUT) {
  const results = [];
  for (const item of items) {
    try {
      const result = await Promise.race([
        page.evaluate(toExpression(item.source)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Snippet evaluation timed out")), timeout)
        ),
      ]);
      if (result && typeof result === "object") {
        results.push({ id: item.id, ...result });
      } else {
        results.push({
          id: item.id,
          status: "error",
          error: "Snippet did not return an object — check the IIFE return statement",
        });
      }
    } catch (err) {
      results.push({ id: item.id, status: "error", error: err.message });
    }
  }
  return results;
}

export async function runSnippets({
  url,
  items,
  waitMs = 3000,
  headless = true,
  viewport = VIEWPORT_PRESETS.mobile,
  navTimeout = DEFAULT_NAV_TIMEOUT,
  evaluateTimeout = DEFAULT_EVALUATE_TIMEOUT,
  interactScript,
}) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    const navStart = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: navTimeout });
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const navMs = Date.now() - navStart;
    if (interactScript) await runInteractions(page, interactScript);
    const results = await evaluateItems(page, items, evaluateTimeout);
    return { url, navMs, results, pageErrors };
  } finally {
    await browser.close();
  }
}

export async function runMeasurement({
  url,
  workflow,
  rules = [],
  waitMs = 3000,
  headless = true,
  viewport = VIEWPORT_PRESETS.mobile,
  navTimeout = DEFAULT_NAV_TIMEOUT,
  evaluateTimeout = DEFAULT_EVALUATE_TIMEOUT,
  interactScript,
}) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const navStart = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: navTimeout });
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const navMs = Date.now() - navStart;
    if (interactScript) await runInteractions(page, interactScript);

    const items = workflow.steps.map((step) => ({
      id: step.id,
      path: step.path,
      source: loadSnippet(step.path),
    }));
    const initialResults = await evaluateItems(page, items, evaluateTimeout);

    const followUps = [];
    for (const result of initialResults) {
      for (const rule of rules) {
        if (rule.when(result)) followUps.push({ ...rule.append, reason: rule.reason });
      }
    }

    let followUpResults = [];
    if (followUps.length > 0) {
      const followItems = followUps.map((f) => ({
        id: f.id,
        path: f.path,
        source: loadSnippet(f.path),
      }));
      const raw = await evaluateItems(page, followItems, evaluateTimeout);
      followUpResults = raw.map((r) => {
        const f = followUps.find((x) => x.id === r.id);
        return f ? { ...r, reason: f.reason } : r;
      });
    }

    return { url, navMs, results: [...initialResults, ...followUpResults], pageErrors };
  } finally {
    await browser.close();
  }
}
