import { readFileSync, existsSync } from "node:fs";

// How long a step waits for its element. Playwright waits 30 s, which is a long silence for a selector
// with a typo; the pages the MCP server keeps open wait the same 5 s (mcp/sessions.js)
export const STEP_TIMEOUT_MS = 5000;

export async function executeStep(page, step) {
  const timeout = { timeout: STEP_TIMEOUT_MS };
  switch (step.action) {
    case "scroll":
      await page.evaluate((y) => window.scrollBy(0, y), step.y ?? 300);
      break;
    case "click":
      await page.click(step.selector, timeout);
      break;
    case "hover":
      await page.hover(step.selector, timeout);
      break;
    case "type":
      await page.type(step.selector, step.text, timeout);
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

const ACTIONS = "click, hover, type, scroll or wait";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// What each action needs, as the schema of the steps of the MCP server (mcp/steps.js), which a test
// keeps in agreement with this
const STEP_PROBLEM = {
  click: (step) => typeof step.selector !== "string" && 'needs a "selector", the CSS selector of its element',
  hover: (step) => STEP_PROBLEM.click(step),
  type: (step) => STEP_PROBLEM.click(step) || (typeof step.text !== "string" && 'needs a "text", the text to type'),
  scroll: (step) => step.y !== undefined && !Number.isInteger(step.y) && 'takes "y" as a whole number of pixels',
  wait: (step) => !(Number.isInteger(step.ms) && step.ms >= 0) && 'needs "ms", a whole number of milliseconds of at least 0',
};

// What is wrong in a list of steps, or null: the first problem, naming its step from 1
export function stepsProblem(steps) {
  if (!Array.isArray(steps)) return 'it needs a list of steps, as { "interactions": [{ "action": "click", "selector": "#buy" }] }';
  if (steps.length === 0) return "it has no steps";
  for (const [i, step] of steps.entries()) {
    const name = `step ${i + 1}`;
    if (!isObject(step)) return `${name} is not an object, such as { "action": "click", "selector": "#buy" }`;
    if (step.action === undefined) return `${name} has no action. Use ${ACTIONS}`;
    if (!Object.hasOwn(STEP_PROBLEM, step.action)) return `${name} has the unknown action ${JSON.stringify(step.action)}. Use ${ACTIONS}`;
    const problem = STEP_PROBLEM[step.action](step);
    if (problem) return `${name} (${step.action}) ${problem}`;
  }
  return null;
}

// The steps of the file of --interact-script, checked: an error here is one of usage, known before
// the browser opens, and its message names the file and the step
export function readInteractionScript(path) {
  if (!existsSync(path)) throw new Error(`Interaction script not found: ${path}`);
  let content;
  try {
    content = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Invalid --interact-script ${path}: it is not valid JSON (${err.message})`);
  }
  const problem = stepsProblem(isObject(content) ? content.interactions : undefined);
  if (problem) throw new Error(`Invalid --interact-script ${path}: ${problem}`);
  return content.interactions;
}

// A step that the page did not take: an element that is not there, hidden or covered. The page is the
// cause, not the CLI, so the report is its message, without a stack
export class InteractionError extends Error {}

// A click or a key press creates the events that Interactions and Input-Latency-Breakdown measure;
// a scroll, a hover and a wait do not.
export function isInputStep(step) {
  return step.action === "click" || step.action === "type";
}

export async function runInteractions(page, source) {
  for (const [i, step] of loadInteractionSteps(source).entries()) {
    try {
      await executeStep(page, step);
    } catch (err) {
      const target = step.selector === undefined ? step.action : `${step.action} ${JSON.stringify(step.selector)}`;
      // The first line: Playwright adds its call log after it
      throw new InteractionError(`Step ${i + 1} of the interactions (${target}) failed: ${err.message.split("\n")[0]}`, { cause: err });
    }
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
