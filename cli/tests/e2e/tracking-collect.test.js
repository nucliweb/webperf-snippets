import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { runSnippets, VIEWPORT_PRESETS } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";
import { isTrackingSnippet } from "../../src/tracking.js";

// The Interaction snippets install observers and answer later through a window function
// (getDataFn). The CLI has to install them before the interactions, run the interactions, and then
// call that function, or it only reports "tracking".
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body>
<h1>t</h1><div id="box" style="width:100px;height:50px;background:#ccc"></div>
<button id="btn" style="width:120px;height:44px">Work</button>
<script>
  document.getElementById("btn").addEventListener("click", () => {
    const box = document.getElementById("box");
    for (let i = 0; i < 40; i++) { box.setAttribute("style", "width:" + (100 + i) + "px;height:50px"); box.offsetWidth; }
    const end = performance.now() + 120;
    while (performance.now() < end) {}
  });
</script></body></html>`;

let server;
let url;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(req.url === "/with-frame" ? `<!DOCTYPE html><title>t</title><iframe src="/" width="300" height="200"></iframe>` : PAGE);
      });
      server.listen(0, "127.0.0.1", () => {
        url = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
  10000
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

const CLICK = [{ action: "click", selector: "#btn" }, { action: "wait", ms: 400 }];

const item = (id, path) => ({ id, path, source: loadSnippet(path) });

async function run(items, interactions) {
  const { results } = await runSnippets({ url, items, interactions, waitMs: 300, viewport: VIEWPORT_PRESETS.desktop });
  return results;
}

describe("isTrackingSnippet", () => {
  it("is true for an Interaction snippet that answers through getDataFn", () => {
    for (const path of ["Interaction/Interactions", "Interaction/LongTask", "Interaction/Forced-Synchronous-Layout"]) {
      expect(isTrackingSnippet(path, loadSnippet(path)), path).toBe(true);
    }
  });

  it("is true for INP, whose value only comes out of getINP()", () => {
    expect(isTrackingSnippet("CoreWebVitals/INP", loadSnippet("CoreWebVitals/INP"))).toBe(true);
  });

  it("is false for a snippet that answers in one go, and for CLS, which also names a getDataFn", () => {
    for (const path of ["Interaction/DOM-Size-and-Depth", "CoreWebVitals/CLS", "Loading/Speculation-Rules-Inspector"]) {
      expect(isTrackingSnippet(path, loadSnippet(path)), path).toBe(false);
    }
  });
});

describe("tracking snippets with interactions", () => {
  it("collect their data after the interactions instead of stopping at tracking", async () => {
    const [interactions, latency] = await run(
      [item("interactions", "Interaction/Interactions"), item("latency", "Interaction/Input-Latency-Breakdown")],
      CLICK
    );
    for (const r of [interactions, latency]) {
      expect(r.status, `${r.id}: ${r.error}`).toBe("ok");
      expect(r.count).toBeGreaterThanOrEqual(1);
      expect(r.getDataFn).toBeUndefined();
    }
  }, 60000);

  it("install before the interactions, so a snippet that patches APIs at install time sees them", async () => {
    const [fsl] = await run([item("fsl", "Interaction/Forced-Synchronous-Layout")], CLICK);
    expect(fsl.status).toBe("ok");
    expect(fsl.count).toBeGreaterThan(0);
  }, 60000);

  it("keep the order of the items, with the others evaluated after the interactions", async () => {
    const results = await run(
      [item("dom", "Interaction/DOM-Size-and-Depth"), item("longtask", "Interaction/LongTask"), item("cls", "CoreWebVitals/CLS")],
      CLICK
    );
    expect(results.map((r) => r.id)).toEqual(["dom", "longtask", "cls"]);
    expect(results[0].status).toBe("ok");
    expect(results[1].status).toBe("ok");
    expect(results[1].count).toBeGreaterThan(0);
    expect(results[2].script).toBe("CLS");
  }, 60000);

  it("report an error for the item when its data function does not exist, and keep the others", async () => {
    const missing = {
      id: "missing",
      path: "Interaction/Fake-Tracker",
      source: '(() => ({ script: "Fake-Tracker", status: "tracking", getDataFn: "doesNotExist" }))();',
    };
    const results = await run([missing, item("dom", "Interaction/DOM-Size-and-Depth")], CLICK);
    expect(results.map((r) => r.id)).toEqual(["missing", "dom"]);
    expect(results[0].status).toBe("error");
    expect(results[0].error).toMatch(/doesNotExist/);
    expect(results[1].status).toBe("ok");
  }, 60000);
});

describe("a click or a key press that does not show in the snippet", () => {
  const inp = item("INP", "CoreWebVitals/INP");

  it("is reported when it paints nothing: a key press on a page that does not respond", async () => {
    const [result] = await run([inp], [{ action: "type", selector: "h1", text: "a" }]);
    expect(result).toEqual(expect.objectContaining({ status: "ok", metric: "INP", rating: "good" }));
  }, 60000);

  it.each([
    ["INP", inp],
    ["Interactions", item("Interactions", "Interaction/Interactions")],
    ["Input-Latency-Breakdown", item("Input-Latency-Breakdown", "Interaction/Input-Latency-Breakdown")],
  ])("%s is an error that says it was sent when the document recorded nothing, as with a click inside an iframe", async (_name, snippet) => {
    const { results } = await runSnippets({
      url: `${url}/with-frame`,
      items: [snippet],
      interactions: [{ action: "click", selector: "iframe" }],
      waitMs: 300,
      viewport: VIEWPORT_PRESETS.desktop,
    });
    expect(results[0].status).toBe("error");
    expect(results[0].error).toMatch(/was sent/);
    expect(results[0].error).toMatch(/iframe/);
    expect(results[0].script).toBe(_name);
    expect(results[0].getDataFn).toBeUndefined();
  }, 60000);

  it("keeps the message of the snippet when nothing was sent: a scroll is no interaction", async () => {
    const [result] = await run([inp], [{ action: "scroll", y: 100 }]);
    expect(result.status).toBe("tracking");
    expect(result.message).toMatch(/No interactions yet/);
  }, 60000);
});

describe("without interactions", () => {
  it("the tracking snippets answer as before, with status tracking", async () => {
    const [longtask] = await run([item("longtask", "Interaction/LongTask")], undefined);
    expect(longtask.status).toBe("tracking");
    expect(longtask.getDataFn).toBe("getLongTaskSummary");
  }, 60000);
});

describe("the CLI with --interact-script", () => {
  it("returns the collected data of a tracking snippet, not tracking", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { cliEnv } = await import("../helpers/cli-env.js");
    const bin = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
    const script = join(mkdtempSync(join(tmpdir(), "webperf-")), "interactions.json");
    writeFileSync(script, JSON.stringify({ interactions: CLICK }));

    const { stdout } = await promisify(execFile)(
      "node",
      [bin, url, "--snippet", "Interaction/Interactions", "--interact-script", script, "--json", "--wait", "300", "--viewport", "desktop"],
      { env: cliEnv() }
    );
    const [result] = JSON.parse(stdout).results;
    expect(result.status).toBe("ok");
    expect(result.count).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("exits with 1 when a click was sent and INP recorded nothing, as with a click inside an iframe", async () => {
    const { execFile } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { cliEnv } = await import("../helpers/cli-env.js");
    const bin = join(dirname(fileURLToPath(import.meta.url)), "../../src/bin.js");
    const script = join(mkdtempSync(join(tmpdir(), "webperf-")), "interactions.json");
    writeFileSync(script, JSON.stringify({ interactions: [{ action: "click", selector: "iframe" }] }));

    const { code, stdout } = await new Promise((resolve) => {
      execFile(
        "node",
        [bin, `${url}/with-frame`, "--snippet", "INP", "--interact-script", script, "--json", "--wait", "300", "--viewport", "desktop"],
        { env: cliEnv() },
        (error, stdout) => resolve({ code: error?.code ?? 0, stdout })
      );
    });
    expect(code).toBe(1);
    const [result] = JSON.parse(stdout).results;
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/was sent/);
  }, 60000);
});
