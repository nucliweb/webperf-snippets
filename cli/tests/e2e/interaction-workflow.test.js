import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runMeasurement, VIEWPORT_PRESETS } from "../../src/runner.js";
import { interactionWorkflow } from "../../src/workflows/interaction.js";
import { cliEnv } from "../helpers/cli-env.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
const run = promisify(execFile);

// A tall page with a button that does some work, so there is something to scroll and to click.
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body>
<h1>t</h1><button id="btn" style="width:120px;height:44px">Work</button>
<div style="height:4000px;background:linear-gradient(#fff,#ddd)"></div>
<script>
  document.getElementById("btn").addEventListener("click", () => {
    const end = performance.now() + 120;
    while (performance.now() < end) {}
  });
</script></body></html>`;

let server;
let url;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(PAGE);
      });
      server.listen(0, "127.0.0.1", () => {
        url = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

const NEEDS_INPUT = ["interactions", "input-latency"];
const CLICK = [{ action: "click", selector: "#btn" }, { action: "wait", ms: 400 }];

async function measure(interactions) {
  const { results } = await runMeasurement({
    url,
    workflow: interactionWorkflow,
    interactions,
    waitMs: 300,
    viewport: VIEWPORT_PRESETS.desktop,
  });
  return results;
}

describe("interaction workflow definition", () => {
  it("has unique step ids and paths, and flags the steps that need a click or a key", () => {
    const ids = interactionWorkflow.steps.map((s) => s.id);
    const paths = interactionWorkflow.steps.map((s) => s.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(interactionWorkflow.steps.filter((s) => s.needsInput).map((s) => s.id).sort()).toEqual([...NEEDS_INPUT].sort());
  });

  it("brings a scroll scenario of its own, with no click, hover or type", () => {
    const actions = new Set(interactionWorkflow.defaultInteractions.map((s) => s.action));
    expect(actions.has("scroll")).toBe(true);
    expect([...actions].every((a) => a === "scroll" || a === "wait")).toBe(true);
  });
});

describe("interaction workflow without a script", () => {
  it("runs the scroll scenario and measures what a scroll can show", async () => {
    const results = await measure(undefined);
    expect(results.map((r) => r.id)).toEqual(interactionWorkflow.steps.map((s) => s.id));
    for (const r of results.filter((r) => !NEEDS_INPUT.includes(r.id))) {
      expect(r.status, `${r.id}: ${r.error}`).toBe("ok");
    }
  }, 60000);

  it("skips the steps that need input, with the reason, and does not call them errors", async () => {
    const results = await measure(undefined);
    for (const id of NEEDS_INPUT) {
      const r = results.find((x) => x.id === id);
      expect(r.status).toBe("skipped");
      expect(r.reason).toMatch(/click or type/);
    }
    expect(results.some((r) => r.status === "error")).toBe(false);
  }, 60000);
});

describe("interaction workflow with a click", () => {
  it("runs every step, none skipped", async () => {
    const results = await measure(CLICK);
    for (const r of results) expect(r.status, `${r.id}: ${r.error}`).toBe("ok");
    expect(results.find((r) => r.id === "interactions").count).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe("the CLI with --workflow interaction", () => {
  it("exits with 0 on a page that passes, with the skipped steps in the report", async () => {
    const { stdout } = await run("node", [BIN, url, "--workflow", "interaction", "--json", "--wait", "300", "--viewport", "desktop"], { env: cliEnv() });
    const { results } = JSON.parse(stdout);
    expect(results.filter((r) => r.status === "skipped").map((r) => r.id).sort()).toEqual([...NEEDS_INPUT].sort());
  }, 60000);

  it("uses the interactions of --interact-script instead of the scroll scenario", async () => {
    const script = join(mkdtempSync(join(tmpdir(), "webperf-")), "interactions.json");
    writeFileSync(script, JSON.stringify({ interactions: CLICK }));
    const { stdout } = await run(
      "node",
      [BIN, url, "--workflow", "interaction", "--interact-script", script, "--json", "--wait", "300", "--viewport", "desktop"],
      { env: cliEnv() }
    );
    const { results } = JSON.parse(stdout);
    expect(results.some((r) => r.status === "skipped")).toBe(false);
  }, 60000);
});
