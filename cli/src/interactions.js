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

// The browser reports the timing of an event after the frame that follows it, and an observer gets it
// in a task after that frame. Reading a snippet right after the last step can miss that step, so this
// waits for two frames and a task, which takes a few milliseconds on a page that renders. A page that
// never renders a frame stops the wait at `limitMs`, and a page that is gone is not an error here: the
// evaluation that follows reports it.
export async function settle(page, limitMs = 1000) {
  try {
    await page.evaluate(
      (limit) =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, limit);
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              setTimeout(() => {
                clearTimeout(timer);
                resolve();
              }, 0)
            )
          );
        }),
      limitMs
    );
  } catch {
    // the page navigated or closed
  }
}
