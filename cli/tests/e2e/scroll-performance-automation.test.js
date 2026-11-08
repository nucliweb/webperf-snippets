import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { runMeasurement } from "../../src/runner.js";
import { interactionWorkflow } from "../../src/workflows/interaction.js";

// When Playwright clicks, its injected script can add touchstart, touchend and touchcancel listeners
// of its own to window, without passive, to check that the click lands on the element. Scroll-
// Performance counts the listeners added after it runs, and must leave those out: they belong to the
// tool that measures, not to the page. A listener the page adds after the click still counts.
const page = (onClick) => `<!DOCTYPE html><html><head><title>p</title></head><body>
<button id="buy" style="width:200px;height:60px">Buy</button>
<script>document.getElementById("buy").addEventListener("click", () => { ${onClick} });</script>
</body></html>`;
const PAGES = {
  "/plain": page('document.body.style.background = "#eee";'),
  "/own-listener": page('window.addEventListener("touchstart", function own() {});'),
};

let server;
let base;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      const body = PAGES[req.url];
      if (!body) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": "text/html" }).end(body);
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
}, 10000);

afterAll(() => new Promise((resolve) => server.close(resolve)));

const CLICK = [{ action: "click", selector: "#buy" }, { action: "wait", ms: 200 }];
const scrollOf = async (path) => {
  const { results } = await runMeasurement({ url: `${base}${path}`, workflow: interactionWorkflow, waitMs: 200, interactions: CLICK });
  return results.find((r) => r.id === "scroll");
};

describe("Scroll-Performance on a page driven by Playwright", () => {
  it("leaves out the listeners Playwright adds when it clicks", async () => {
    const scroll = await scrollOf("/plain");
    expect(scroll.status).toBe("ok");
    expect(scroll.details.nonPassiveListeners).toBe(0);
    expect((scroll.issues ?? []).filter((i) => i.code === "non-passive-listeners")).toEqual([]);
  }, 60000);

  it("still counts a non-passive listener the page adds", async () => {
    const scroll = await scrollOf("/own-listener");
    expect(scroll.details.nonPassiveListeners).toBe(1);
    expect(scroll.items).toContainEqual({ kind: "non-passive-listener", target: "Window", detail: "touchstart" });
  }, 60000);
});
