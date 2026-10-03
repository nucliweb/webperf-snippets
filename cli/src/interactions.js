import { readFileSync } from "node:fs";

export async function executeStep(page, step) {
  switch (step.action) {
    case "scroll":
      await page.evaluate((y) => window.scrollBy(0, y), step.y ?? 300);
      break;
    case "click":
      await page.click(step.selector);
      break;
    case "hover":
      await page.hover(step.selector);
      break;
    case "type":
      await page.type(step.selector, step.text);
      break;
    case "wait":
      await page.waitForTimeout(step.ms);
      break;
    default:
      throw new Error(`Unknown interaction action: "${step.action}"`);
  }
}

// `source` is the path of a JSON file ({ "interactions": [...] }) or the list of steps itself.
export function loadInteractionSteps(source) {
  return Array.isArray(source) ? source : JSON.parse(readFileSync(source, "utf8")).interactions;
}

// A click or a key press creates the events that Interactions and Input-Latency-Breakdown measure;
// a scroll, a hover and a wait do not.
export function isInputStep(step) {
  return step.action === "click" || step.action === "type";
}

export async function runInteractions(page, source) {
  for (const step of loadInteractionSteps(source)) {
    await executeStep(page, step);
  }
}
