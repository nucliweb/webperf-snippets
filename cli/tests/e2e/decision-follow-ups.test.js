import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliEnv } from "../helpers/cli-env.js";
import { launch, startContractServers } from "../helpers/contract.js";
import { runMeasurement, VIEWPORT_PRESETS } from "../../src/runner.js";
import { cwvWorkflow } from "../../src/workflows/cwv.js";
import { auditWorkflow } from "../../src/workflows/audit.js";
import { RULES } from "../../src/decision-tree.js";

// The follow-ups the decision tree adds to a Core Web Vitals run, on pages whose LCP and CLS are known.
let servers;
let browser;

beforeAll(async () => {
  browser = await launch();
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await browser.close();
  await servers.close();
});

const measure = (path, workflow = cwvWorkflow, rules = RULES) =>
  runMeasurement({ url: `${servers.base}${path}`, workflow, rules, waitMs: 800, viewport: VIEWPORT_PRESETS.desktop });

const followUps = (results) => results.filter((r) => r.reason).map((r) => r.id);

describe("decision tree follow-ups", () => {
  it("checks the LCP image when the LCP element is an image, and returns their results", async () => {
    const { results } = await measure("/lcp-image");
    expect(results.find((r) => r.id === "LCP").details.elementType).toBe("Image");
    expect(followUps(results)).toEqual(expect.arrayContaining(["LCP-Image-Entropy", "image-audit"]));
    for (const id of ["LCP-Image-Entropy", "image-audit"]) {
      const r = results.find((x) => x.id === id);
      expect(r.status, `${id}: ${r.error}`).toBe("ok");
      expect(r.reason).toMatch(/LCP is an image/);
    }
  }, 60000);

  it("adds no image step when the LCP element is text", async () => {
    const { results } = await measure("/lcp-text");
    expect(followUps(results)).not.toContain("LCP-Image-Entropy");
    expect(followUps(results)).not.toContain("image-audit");
  }, 60000);

  it("reads the layout shifts of a page with a CLS above 0.25, instead of stopping at tracking", async () => {
    const { results } = await measure("/cls-big");
    const cls = results.find((r) => r.id === "CLS");
    expect(cls.value).toBeGreaterThan(0.25);
    expect(followUps(results)).toEqual(expect.arrayContaining(["layout-shifts", "lazy-atf", "fonts", "critical-css"]));
    const shifts = results.find((r) => r.id === "layout-shifts");
    expect(shifts.status, shifts.error).toBe("ok");
    expect(shifts.metric).toBe("CLS");
    expect(shifts.getDataFn).toBeUndefined();
  }, 60000);

  it("runs a follow-up only once, and not when the workflow already ran it", async () => {
    const rule = {
      when: (r) => r.id === "render-blocking",
      append: { id: "extra", path: "Loading/Find-render-blocking-resources" },
      reason: "test",
    };
    const twice = { ...rule, append: { id: "extra2", path: "Loading/Priority-Hints-Audit" } };
    const { results } = await measure("/", { id: "t", steps: [auditWorkflow.steps[0], { id: "priority-hints", path: "Loading/Priority-Hints-Audit" }] }, [rule, twice, twice]);
    expect(results.map((r) => r.id)).toEqual(["render-blocking", "priority-hints"]);
  }, 60000);
});

describe("the exit code of a run with follow-ups", () => {
  const BIN = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
  const cli = async (path, extra = []) => {
    try {
      const { stdout } = await promisify(execFile)("node", [BIN, `${servers.base}${path}`, "--json", "--wait", "500", "--viewport", "desktop", ...extra], { env: cliEnv() });
      return { code: 0, results: JSON.parse(stdout).results };
    } catch (err) {
      return { code: err.code, results: JSON.parse(err.stdout).results };
    }
  };

  it("does not change because a follow-up reports an error issue: it informs", async () => {
    const { code, results } = await cli("/lcp-image");
    const audit = results.find((r) => r.id === "image-audit");
    expect(audit.reason).toMatch(/LCP is an image/);
    expect(audit.issues.some((i) => i.severity === "error")).toBe(true);
    expect(code).toBe(0);
  }, 60000);

  it("still follows the budgets of the workflow", async () => {
    const { code } = await cli("/lcp-image", ["--budget-lcp", "1"]);
    expect(code).toBe(1);
  }, 60000);

  it("still counts an error issue of a step the workflow itself runs", async () => {
    const { code, results } = await cli("/lcp-image", ["--snippet", "Media/Image-Element-Audit"]);
    expect(results[0].issues.some((i) => i.severity === "error")).toBe(true);
    expect(code).toBe(1);
  }, 60000);
});
