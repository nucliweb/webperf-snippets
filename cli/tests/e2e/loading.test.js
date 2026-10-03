import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runMeasurement, VIEWPORT_PRESETS } from "../../src/runner.js";
import { loadingWorkflow } from "../../src/workflows/loading.js";
import { RULES } from "../../src/decision-tree.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HTML = readFileSync(join(HERE, "../fixtures/index.html"), "utf8");

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        // The page loads one script, so the Resource Timing buffer is not empty (Cache-Strategy-Analysis
        // reports an error for an empty buffer)
        if (req.url === "/app.js") {
          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end("window.__app = true;");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(FIXTURE_HTML.replace("</body>", '<script src="/app.js"></script></body>'));
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
  10000
);

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

describe("loading workflow", () => {
  it(
    "runs all steps without errors",
    async () => {
      const { results } = await runMeasurement({
        url: baseUrl,
        workflow: loadingWorkflow,
        rules: RULES,
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });

      const stepIds = loadingWorkflow.steps.map((s) => s.id);
      for (const id of stepIds) {
        const r = results.find((r) => r.id === id);
        expect(r, `step "${id}" missing from results`).toBeDefined();
        expect(r.status, `${id} threw: ${r?.error}`).not.toBe("error");
      }
    },
    30000
  );

  it(
    "TTFB returns a numeric value with a rating",
    async () => {
      const { results } = await runMeasurement({
        url: baseUrl,
        workflow: loadingWorkflow,
        rules: RULES,
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });

      const ttfb = results.find((r) => r.id === "TTFB");
      expect(ttfb.status).toBe("ok");
      expect(typeof ttfb.value).toBe("number");
      expect(ttfb.value).toBeGreaterThanOrEqual(0);
      expect(["good", "needs-improvement", "poor"]).toContain(ttfb.rating);
      expect(ttfb.unit).toBe("ms");
    },
    30000
  );

  it(
    "FCP returns a numeric value with a rating",
    async () => {
      const { results } = await runMeasurement({
        url: baseUrl,
        workflow: loadingWorkflow,
        rules: RULES,
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });

      const fcp = results.find((r) => r.id === "FCP");
      expect(fcp.status).toBe("ok");
      expect(typeof fcp.value).toBe("number");
      expect(fcp.value).toBeGreaterThanOrEqual(0);
      expect(["good", "needs-improvement", "poor"]).toContain(fcp.rating);
      expect(fcp.unit).toBe("ms");
    },
    30000
  );

  it(
    "returns a single navMs — only one navigation",
    async () => {
      const { navMs } = await runMeasurement({
        url: baseUrl,
        workflow: loadingWorkflow,
        rules: RULES,
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });

      expect(typeof navMs).toBe("number");
      expect(navMs).toBeGreaterThan(0);
    },
    30000
  );
});

describe("loading workflow, resource and script steps", () => {
  const NEW_STEPS = {
    "script-timings": "Loading/First-And-Third-Party-Script-Timings",
    "ttfb-resources": "Loading/TTFB-Resources",
    "js-execution": "Loading/JS-Execution-Time-Breakdown",
    "third-party-impact": "Loading/Third-Party-Impact-by-Domain",
    "cache-strategy": "Loading/Cache-Strategy-Analysis",
  };

  it("has unique step ids and paths, and the new steps point at their snippets", () => {
    const ids = loadingWorkflow.steps.map((s) => s.id);
    const paths = loadingWorkflow.steps.map((s) => s.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const [id, path] of Object.entries(NEW_STEPS)) {
      expect(loadingWorkflow.steps.find((s) => s.id === id)?.path, `step "${id}"`).toBe(path);
    }
  });

  it("runs the step that makes its own requests last", () => {
    expect(loadingWorkflow.steps.at(-1).id).toBe("cache-strategy");
  });

  it(
    "returns the structured result of each new step",
    async () => {
      const { results } = await runMeasurement({
        url: baseUrl,
        workflow: loadingWorkflow,
        rules: RULES,
        waitMs: 500,
        viewport: VIEWPORT_PRESETS.mobile,
      });
      for (const [id, path] of Object.entries(NEW_STEPS)) {
        const r = results.find((r) => r.id === id);
        expect(r, `step "${id}" missing from results`).toBeDefined();
        expect(r.status, `${id}: ${r.error}`).toBe("ok");
        expect(r.script).toBe(path.split("/")[1]);
        expect(Array.isArray(r.items), `${id} has no items array`).toBe(true);
      }
    },
    60000
  );
});
