import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeStep, runInteractions, stepsProblem, readInteractionScript, STEP_TIMEOUT_MS } from "../../src/interactions.js";
import { Step } from "../../src/mcp/steps.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "../fixtures");

function mockPage() {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("executeStep", () => {
  let page;

  beforeEach(() => {
    page = mockPage();
  });

  it("scroll — calls page.evaluate with the given y value", async () => {
    await executeStep(page, { action: "scroll", y: 500 });
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 500);
  });

  it("scroll — defaults y to 300 when omitted", async () => {
    await executeStep(page, { action: "scroll" });
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 300);
  });

  it("click — calls page.click with the selector", async () => {
    await executeStep(page, { action: "click", selector: "#btn" });
    expect(page.click).toHaveBeenCalledWith("#btn", { timeout: STEP_TIMEOUT_MS });
  });

  it("hover — calls page.hover with the selector", async () => {
    await executeStep(page, { action: "hover", selector: ".menu" });
    expect(page.hover).toHaveBeenCalledWith(".menu", { timeout: STEP_TIMEOUT_MS });
  });

  it("type — calls page.type with selector and text", async () => {
    await executeStep(page, { action: "type", selector: "input", text: "hello" });
    expect(page.type).toHaveBeenCalledWith("input", "hello", { timeout: STEP_TIMEOUT_MS });
  });

  it("wait — calls page.waitForTimeout with the given ms", async () => {
    await executeStep(page, { action: "wait", ms: 500 });
    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it("unknown action — throws with a clear message", async () => {
    await expect(executeStep(page, { action: "fly" })).rejects.toThrow(
      'Unknown interaction action: "fly"'
    );
  });

  it("unknown action — no page methods are called before throwing", async () => {
    await expect(executeStep(page, { action: "teleport" })).rejects.toThrow();
    expect(page.click).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();
  });
});

describe("runInteractions", () => {
  it("reads the JSON file and executes all steps in order", async () => {
    const page = mockPage();
    const calls = [];
    page.evaluate.mockImplementation(() => { calls.push("scroll"); });
    page.waitForTimeout.mockImplementation(() => { calls.push("wait"); });

    await runInteractions(page, join(FIXTURES, "interactions.json"));

    expect(calls).toEqual(["scroll", "wait"]);
  });

  it("throws when the file does not exist", async () => {
    const page = mockPage();
    await expect(
      runInteractions(page, join(FIXTURES, "nonexistent.json"))
    ).rejects.toThrow();
  });
});

describe("a step that fails on the page", () => {
  it("says which step it was and why, in one line", async () => {
    const page = mockPage();
    page.click.mockRejectedValue(new Error("page.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('#buy')"));
    await expect(runInteractions(page, [{ action: "scroll" }, { action: "click", selector: "#buy" }])).rejects.toThrow(
      /^Step 2 of the interactions \(click "#buy"\) failed: page\.click: Timeout 5000ms exceeded\.$/
    );
  });

  it("waits for an element for seconds, not the 30 s of Playwright", () => {
    expect(STEP_TIMEOUT_MS).toBe(5000);
  });
});

const VALID_STEPS = [
  { action: "scroll" },
  { action: "scroll", y: -200 },
  { action: "click", selector: "#buy" },
  { action: "hover", selector: ".menu" },
  { action: "type", selector: "input", text: "" },
  { action: "wait", ms: 0 },
];
const INVALID_STEPS = [
  [{ action: "fly" }, 'step 1 has the unknown action "fly". Use click, hover, type, scroll or wait'],
  [{}, "step 1 has no action. Use click, hover, type, scroll or wait"],
  ["click", "step 1 is not an object, such as { \"action\": \"click\", \"selector\": \"#buy\" }"],
  [null, "step 1 is not an object, such as { \"action\": \"click\", \"selector\": \"#buy\" }"],
  [{ action: "click" }, 'step 1 (click) needs a "selector", the CSS selector of its element'],
  [{ action: "hover", selector: 3 }, 'step 1 (hover) needs a "selector", the CSS selector of its element'],
  [{ action: "type", selector: "input" }, 'step 1 (type) needs a "text", the text to type'],
  [{ action: "wait" }, 'step 1 (wait) needs "ms", a whole number of milliseconds of at least 0'],
  [{ action: "wait", ms: "500" }, 'step 1 (wait) needs "ms", a whole number of milliseconds of at least 0'],
  [{ action: "wait", ms: -1 }, 'step 1 (wait) needs "ms", a whole number of milliseconds of at least 0'],
  [{ action: "scroll", y: "down" }, 'step 1 (scroll) takes "y" as a whole number of pixels'],
];

describe("stepsProblem", () => {
  it("finds nothing wrong in the steps the runner knows", () => {
    expect(stepsProblem(VALID_STEPS)).toBeNull();
  });

  it.each(INVALID_STEPS)("names what is wrong in %j", (step, problem) => {
    expect(stepsProblem([step])).toBe(problem);
  });

  it("counts the steps from 1", () => {
    expect(stepsProblem([{ action: "scroll" }, { action: "fly" }])).toMatch(/^step 2 /);
  });

  it("needs a list with at least one step", () => {
    expect(stepsProblem([])).toBe("it has no steps");
    expect(stepsProblem(undefined)).toBe('it needs a list of steps, as { "interactions": [{ "action": "click", "selector": "#buy" }] }');
  });

  // The MCP server takes the same steps as arguments of its tools, checked by its schema
  it("takes and rejects the same steps as the schema of the MCP server", () => {
    for (const step of VALID_STEPS) expect(Step.safeParse(step).success, JSON.stringify(step)).toBe(true);
    for (const [step] of INVALID_STEPS) expect(Step.safeParse(step).success, JSON.stringify(step)).toBe(false);
  });
});

describe("readInteractionScript", () => {
  it("returns the steps of a file", () => {
    expect(readInteractionScript(join(FIXTURES, "interactions.json"))).toEqual([
      { action: "scroll", y: 200 },
      { action: "wait", ms: 50 },
    ]);
  });

  it("says that a file is not there", () => {
    expect(() => readInteractionScript("nowhere.json")).toThrow("Interaction script not found: nowhere.json");
  });

  it("says that a file is not JSON, and names it", () => {
    const file = join(FIXTURES, "index.html");
    expect(() => readInteractionScript(file)).toThrow(`Invalid --interact-script ${file}: it is not valid JSON`);
  });

  it("names the file and the problem of its steps", () => {
    const file = join(mkdtempSync(join(tmpdir(), "steps-")), "steps.json");
    writeFileSync(file, JSON.stringify({ interactions: [{ action: "fly" }] }));
    expect(() => readInteractionScript(file)).toThrow(
      `Invalid --interact-script ${file}: step 1 has the unknown action "fly". Use click, hover, type, scroll or wait`
    );
  });
});
