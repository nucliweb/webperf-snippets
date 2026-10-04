import { chromium } from "playwright";
import { loadSnippet } from "./load-snippet.js";
import { runInteractions, loadInteractionSteps, isInputStep, settle } from "./interactions.js";
import { isTrackingSnippet } from "./tracking.js";
import { nextSteps } from "./decision-tree.js";

export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

const DEFAULT_NAV_TIMEOUT = 30000;

// Snippets are IIFEs. Playwright evaluates a string as an expression, so we
// trim trailing semicolons to keep the IIFE call as a single expression and
// recover its return value in Node.
function toExpression(source) {
  return source.trim().replace(/;\s*$/, "");
}

async function evaluateItems(page, items) {
  const results = [];
  for (const item of items) {
    try {
      const result = await page.evaluate(toExpression(item.source));
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

// Runs the items around a set of interactions. A tracking snippet is installed first, so it sees
// the interactions, and answers through its getDataFn afterwards. The other items run after the
// interactions, as before. The browser reports the timing of an interaction after the frame that
// follows it, so the runner lets it settle before it reads anything. Results keep the order of the
// items. Without interactions every item runs once, as it always did.
async function evaluateAroundInteractions(page, items, interactions) {
  if (!interactions) return evaluateItems(page, items);

  const tracking = items.filter((item) => isTrackingSnippet(item.path ?? "", item.source));
  const installed = await evaluateItems(page, tracking);
  await runInteractions(page, interactions);
  await settle(page);
  const others = await evaluateItems(
    page,
    items.filter((item) => !tracking.includes(item))
  );
  const collected = [];
  for (const result of installed) collected.push(await collectTrackingData(page, result));

  const byId = new Map([...collected, ...others].map((r) => [r.id, r]));
  return items.map((item) => byId.get(item.id));
}

async function collectTrackingData(page, result) {
  if (result.status !== "tracking" || !result.getDataFn) return result;
  try {
    const data = await page.evaluate(`(async () => await ${result.getDataFn}())()`);
    if (data && typeof data === "object") return { id: result.id, ...data };
    return { id: result.id, status: "error", error: `${result.getDataFn}() did not return an object` };
  } catch (err) {
    return { id: result.id, status: "error", error: `${result.getDataFn}() failed: ${err.message}` };
  }
}

export async function runSnippets({
  url,
  items,
  waitMs = 3000,
  headless = true,
  viewport = VIEWPORT_PRESETS.mobile,
  navTimeout = DEFAULT_NAV_TIMEOUT,
  interactScript,
  interactions = interactScript,
  storageState,
}) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ viewport, storageState });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    const navStart = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: navTimeout });
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const navMs = Date.now() - navStart;
    const results = await evaluateAroundInteractions(page, items, interactions);
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
  interactScript,
  interactions = interactScript,
  storageState,
}) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ viewport, storageState });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const navStart = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: navTimeout });
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const navMs = Date.now() - navStart;

    // The steps of the user's script, or the workflow's own. A step that needs a click or a key press
    // is skipped when the interactions have none, so it does not fail for lack of data.
    const steps = interactions ?? workflow.defaultInteractions;
    const hasInput = steps ? loadInteractionSteps(steps).some(isInputStep) : false;
    const skip = (step) => step.needsInput && !hasInput;

    const items = workflow.steps
      .filter((step) => !skip(step))
      .map((step) => ({
        id: step.id,
        path: step.path,
        source: loadSnippet(step.path),
      }));
    const measured = await evaluateAroundInteractions(page, items, steps);
    const initialResults = workflow.steps.map(
      (step) =>
        measured.find((r) => r.id === step.id) ?? {
          id: step.id,
          status: "skipped",
          reason: "The interactions have no click or type step; add one with --interact-script",
        }
    );

    const followUps = nextSteps(
      initialResults,
      rules,
      workflow.steps.map((step) => step.path)
    );

    let followUpResults = [];
    if (followUps.length > 0) {
      const followItems = followUps.map((f) => ({
        id: f.id,
        path: f.path,
        source: loadSnippet(f.path),
      }));
      const raw = await evaluateItems(page, followItems);
      // A tracking snippet answers through its data function, which is read right away here
      const collected = [];
      for (const r of raw) collected.push(await collectTrackingData(page, r));
      followUpResults = collected.map((r) => {
        const f = followUps.find((x) => x.id === r.id);
        return f ? { ...r, reason: f.reason } : r;
      });
    }

    return { url, navMs, results: [...initialResults, ...followUpResults], pageErrors };
  } finally {
    await browser.close();
  }
}
