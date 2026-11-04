import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "../../src/mcp/server.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");
const png = readFileSync(join(HERE, "../fixtures/hero.png"));

// The LCP entry needs a moment after load to be reported, as the other tests of the CLI note
const WAIT_MS = 500;

// What the tests read comes from this server, never from how long a call took: a margin of time fails
// when the CPU is busy. Every page names itself with ?id=, and `seen` keeps each request by that id, with
// the time this server received it. A page pings for as long as it lives, so the first and the last
// request of a load enclose the time its Chromium worked.
//
// A page whose image is `held` does not reach its load event until the test releases it. The call is
// measuring for as long as the test wants, with no timer, and what happens meanwhile happens in that
// window for certain.
let seen = [];
let holding = false;
let held = [];
const sockets = new Map();
const page = (id, body = "") =>
  `<!DOCTYPE html><html><head><title>Product</title></head><body><h1>Product</h1><img src="/hero.png?id=${id}" width="600" height="400" alt="Product photo">${body}</body></html>`;
const ping = (id) => `<script>setInterval(() => fetch("/ping?id=${id}"), 20);</script>`;
// A main thread that never yields again answers no evaluation, and Playwright has no timeout for one
const spin = "for (;;);";

let server;
let base;

beforeAll(async () => {
  server = await new Promise((resolve) => {
    const s = createHttpServer((req, res) => {
      const { pathname, searchParams } = new URL(req.url, "http://localhost");
      const id = searchParams.get("id");
      seen.push({ id, pathname, at: Date.now() });
      const send = (body) => res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(body);
      if (pathname === "/product") return send(page(id));
      if (pathname === "/alive") return send(page(id, ping(id)));
      if (pathname === "/quiet") return send(page(id, `<button id="save" onclick="fetch('/clicked?id=${id}')">Save</button>`));
      if (pathname === "/refused") return req.socket.destroy();
      if (pathname === "/stuck") {
        sockets.set(id, req.socket);
        return send(page(id, `<script>addEventListener("load", () => setTimeout(() => { ${spin} }, 50));</script>`));
      }
      if (pathname === "/stuck-click") return send(page(id, `<button id="save" onclick="setTimeout(() => { ${spin} }, 50)">Save</button>`));
      if (pathname === "/hero.png") {
        const answer = () => res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }).end(png);
        if (holding) return held.push(answer);
        return answer();
      }
      res.writeHead(204).end();
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

let client;

async function connect(options) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
}

afterEach(async () => {
  release();
  await client?.close();
  client = undefined;
  seen = [];
  sockets.clear();
});

const call = (name, args, options) => client.callTool({ name, arguments: args }, options);
const lcp = (id, options, path = "product") => call("run_snippet", { url: `${base}/${path}?id=${id}`, snippet: "LCP", waitMs: WAIT_MS }, options);
const openPage = (id, options, path = "quiet") => call("open_page", { url: `${base}/${path}?id=${id}`, track: ["INP"], waitMs: 0 }, options);
const pass = (result) => {
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  return result.structuredContent;
};

const requested = (id) => seen.filter((r) => r.id === id);
const hold = () => {
  holding = true;
};
function release() {
  holding = false;
  for (const answer of held) answer();
  held = [];
}
// The call is measuring, stopped at the image of its page
const untilHeld = (id) => vi.waitFor(() => expect(seen.some((r) => r.id === id && r.pathname === "/hero.png")).toBe(true), { timeout: 20000, interval: 20 });
// The call is in the queue: the server told it so
const reportsWaiting = (updates) => vi.waitFor(() => expect(updates.length).toBeGreaterThan(0), { timeout: 20000, interval: 20 });

function expectNoOverlap(ids) {
  const spans = ids.map((id) => {
    const times = requested(id).map((r) => r.at);
    expect(times.length, id).toBeGreaterThan(0);
    return { id, first: Math.min(...times), last: Math.max(...times) };
  });
  spans.sort((a, b) => a.first - b.first);
  for (let i = 1; i < spans.length; i++) {
    expect(spans[i].first, `${spans[i].id} started while ${spans[i - 1].id} was measuring: ${JSON.stringify(spans)}`).toBeGreaterThanOrEqual(spans[i - 1].last);
  }
}

describe("several measuring calls at a time", () => {
  it("measure one after the other", async () => {
    await connect();
    const answers = await Promise.all([lcp("a", undefined, "alive"), lcp("b", undefined, "alive"), lcp("c", undefined, "alive")]);
    for (const answer of answers) expect(pass(answer).result).toMatchObject({ script: "LCP", status: "ok" });
    expectNoOverlap(["a", "b", "c"]);
    // Each page pinged during its wait: an overlap of two pages would show here
    for (const id of ["a", "b", "c"]) expect(requested(id).filter((r) => r.pathname === "/ping").length).toBeGreaterThan(0);
  }, 60000);

  it("measure one after the other on the real process, in the modern era of the protocol", async () => {
    client = new Client({ name: "test", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"] }));
    const answers = await Promise.all([lcp("a", undefined, "alive"), lcp("b", undefined, "alive")]);
    for (const answer of answers) pass(answer);
    expectNoOverlap(["a", "b"]);
  }, 60000);

  it("take turns across run_snippet and run_workflow, in the order they arrive", async () => {
    await connect();
    const answers = await Promise.all([
      lcp("first", undefined, "alive"),
      call("run_workflow", { url: `${base}/alive?id=second`, workflow: "core-web-vitals", waitMs: WAIT_MS }),
      lcp("third", undefined, "alive"),
    ]);
    for (const answer of answers) pass(answer);
    expectNoOverlap(["first", "second", "third"]);
    expect(requested("first")[0].at).toBeLessThan(requested("second")[0].at);
    expect(requested("second")[0].at).toBeLessThan(requested("third")[0].at);
  }, 60000);

  it("keep all their runs together: a call of several runs does not let another in between", async () => {
    await connect();
    const answers = await Promise.all([call("run_snippet", { url: `${base}/alive?id=three-runs`, snippet: "LCP", waitMs: WAIT_MS, runs: 3 }), lcp("after", undefined, "alive")]);
    expect(pass(answers[0]).runs.count).toBe(3);
    pass(answers[1]);
    expectNoOverlap(["three-runs", "after"]);
  }, 60000);
});

describe("the calls that make a page work", () => {
  it("wait for the measurement in progress: open_page and interact take their turn after it", async () => {
    await connect();
    const { sessionId } = pass(await openPage("session"));
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    const opening = [];
    const clicking = [];
    const opened = openPage("opened", { onprogress: (u) => opening.push(u) });
    const clicked = call("interact", { sessionId, steps: [{ action: "click", selector: "#save" }] }, { onprogress: (u) => clicking.push(u) });
    await reportsWaiting(opening);
    await reportsWaiting(clicking);
    expect(requested("opened")).toEqual([]);
    expect(requested("session").filter((r) => r.pathname === "/clicked")).toEqual([]);

    release();
    pass(await measuring);
    pass(await opened);
    pass(await clicked);
    expect(requested("opened").length).toBeGreaterThan(0);
    await vi.waitFor(() => expect(requested("session").filter((r) => r.pathname === "/clicked")).toHaveLength(1), { timeout: 5000, interval: 20 });
  }, 60000);
});

// An open page keeps no turn: only a later call of the agent closes it, so waiting for it would never end
describe("a page that stays open", () => {
  it("holds up no measurement", async () => {
    await connect();
    pass(await openPage("session"));
    await expect(lcp("measured")).resolves.toMatchObject({ structuredContent: { result: { status: "ok" } } });
  }, 60000);

  it("answers read_results and close_page during a measurement, which an agent can send at any time", async () => {
    await connect();
    const { sessionId } = pass(await openPage("session"));
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    pass(await call("read_results", { sessionId }));
    expect(pass(await call("close_page", { sessionId })).closed).toBe(true);

    release();
    pass(await measuring);
  }, 60000);

  it("is closed for a waiting interact, which answers that it is, and the queue goes on", async () => {
    await connect();
    const { sessionId } = pass(await openPage("session"));
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");
    const updates = [];
    const interact = call("interact", { sessionId, steps: [{ action: "click", selector: "#save" }] }, { onprogress: (u) => updates.push(u) });
    await reportsWaiting(updates);
    pass(await call("close_page", { sessionId }));

    release();
    pass(await measuring);
    const answer = await interact;
    expect(answer.isError).toBe(true);
    expect(answer.content[0].text).toMatch(/open_page/);
  }, 60000);
});

describe("what does not make a page work", () => {
  it("answers at once during a measurement: a wrong argument waits for no turn", async () => {
    await connect();
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    const answers = await Promise.all([
      call("interact", { sessionId: "nope", steps: [{ action: "click", selector: "#save" }] }),
      call("run_snippet", { url: `${base}/product?id=x`, snippet: "No-Such-Snippet" }),
      call("run_snippet", { url: `${base}/product?id=x`, snippet: "INP" }),
      call("run_workflow", { url: `${base}/product?id=x`, baseline: "/nowhere/baseline.json" }),
      call("open_page", { url: `${base}/product?id=x`, track: ["LCP"] }),
    ]);
    for (const answer of answers) expect(answer.isError).toBe(true);
    expect(pass(await call("list_snippets", { category: "Media" })).snippets.length).toBeGreaterThan(0);
    expect(requested("x")).toEqual([]);

    release();
    pass(await measuring);
  }, 60000);
});

describe("a client that gives up", () => {
  it("while its call waits: the page never loads, and the next call runs", async () => {
    await connect();
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    const controller = new AbortController();
    const updates = [];
    const cancelled = lcp("cancelled", { signal: controller.signal, onprogress: (u) => updates.push(u) });
    const next = lcp("next");
    await reportsWaiting(updates);
    controller.abort("the user stopped it");
    await expect(cancelled).rejects.toThrow();

    release();
    pass(await measuring);
    pass(await next);
    expect(requested("cancelled")).toEqual([]);
  }, 60000);

  it("on its timeout while its call waits: the same", async () => {
    await connect();
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    await expect(lcp("timed-out", { timeout: 200 })).rejects.toThrow(/timed out/i);
    const next = lcp("next");

    release();
    pass(await measuring);
    pass(await next);
    expect(requested("timed-out")).toEqual([]);
  }, 60000);

  it("on the call in progress: its Chromium closes, and the next call does not wait for that load", async () => {
    await connect();
    hold();
    const controller = new AbortController();
    const cancelled = lcp("cancelled", { signal: controller.signal });
    await untilHeld("cancelled");
    const updates = [];
    const next = call("run_snippet", { url: `${base}/quiet?id=next`, snippet: "CLS", waitMs: 0 }, { onprogress: (u) => updates.push(u) });
    await reportsWaiting(updates);
    controller.abort("the user stopped it");
    await expect(cancelled).rejects.toThrow();

    // The image of `next` is held too, and nothing answers the one of the cancelled load: it is enough that
    // the next page loads while the first image is still unanswered
    await vi.waitFor(() => expect(requested("next").length).toBeGreaterThan(0), { timeout: 20000, interval: 20 });
    release();
    pass(await next);
  }, 60000);

  it("by leaving: no call left in the queue loads its page", async () => {
    await connect();
    hold();
    lcp("measuring").catch(() => {});
    await untilHeld("measuring");
    const updates = [];
    const waiting = lcp("waiting", { onprogress: (u) => updates.push(u) }).catch(() => {});
    await reportsWaiting(updates);

    await client.close();
    client = undefined;
    release();
    await waiting;
    // Long enough for the next call to have started, if it were to start
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(requested("waiting")).toEqual([]);
  }, 60000);
});

describe("a measurement that fails", () => {
  it("does not break the queue", async () => {
    await connect();
    const [failed, next] = await Promise.all([lcp("refused", undefined, "refused"), lcp("next")]);
    expect(failed.isError).toBe(true);
    expect(failed.content[0].text).toMatch(/^Could not load/);
    pass(next);
  }, 60000);
});

describe("a call that waits", () => {
  it("reports how many calls are ahead, below the stages of its run, always growing", async () => {
    await connect();
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    const updates = [];
    const next = lcp("next", { onprogress: (u) => updates.push(u) });
    await reportsWaiting(updates);
    expect(updates[0].message).toBe("Waiting for its turn: 1 call ahead");
    expect(updates[0].total).toBe(3);

    release();
    pass(await measuring);
    pass(await next);
    const stages = updates.filter((u) => u.progress >= 1).map((u) => u.progress);
    expect(stages).toEqual([1, 2, 3]);
    const waited = updates.filter((u) => u.progress < 1);
    expect(waited.length).toBeGreaterThan(0);
    const progress = updates.map((u) => u.progress);
    expect(progress).toEqual([...new Set(progress)].sort((a, b) => a - b));
  }, 60000);

  it("reports nothing to a client that did not ask, and answers the same", async () => {
    await connect();
    const [a, b] = await Promise.all([lcp("a"), lcp("b")]);
    expect(Object.keys(pass(a)).sort()).toEqual(Object.keys(pass(b)).sort());
  }, 60000);

  it("keeps a client that resets its timeout on progress waiting for longer than that timeout", async () => {
    await connect({ reportEveryMs: 100 });
    hold();
    const measuring = lcp("measuring");
    await untilHeld("measuring");

    const timeout = 2000;
    const next = lcp("next", { timeout, resetTimeoutOnProgress: true, onprogress: () => {} });
    await new Promise((resolve) => setTimeout(resolve, timeout * 2));
    release();
    pass(await measuring);
    pass(await next);
  }, 60000);
});

// Long enough for a run of a normal page on a busy machine, and short for a test
const LIMIT_MS = 8000;

describe("a page that stops answering", () => {
  it("fails its run when the limit comes, closes its Chromium and lets the next call run", async () => {
    await connect({ callLimitMs: LIMIT_MS });
    const [stuck, next] = await Promise.all([lcp("stuck", undefined, "stuck"), lcp("next")]);
    expect(stuck.isError).toBe(true);
    expect(stuck.content[0].text).toBe("The run failed: The page did not answer within 8 seconds");
    pass(next);
    await vi.waitFor(() => expect(sockets.get("stuck").destroyed).toBe(true), { timeout: 5000, interval: 20 });
  }, 60000);

  it("stops a call of several runs at the first one: the others would only hold up the queue", async () => {
    await connect({ callLimitMs: LIMIT_MS });
    const stuck = await call("run_snippet", { url: `${base}/stuck?id=stuck`, snippet: "LCP", waitMs: 0, runs: 3 });
    expect(stuck.isError).toBe(true);
    expect(stuck.content[0].text).toMatch(/did not answer within 8 seconds/);
    expect(requested("stuck").filter((r) => r.pathname === "/stuck")).toHaveLength(1);
  }, 60000);

  it("in open_page: the call fails and no page stays open", async () => {
    await connect({ callLimitMs: LIMIT_MS, maxPages: 1 });
    const stuck = await call("open_page", { url: `${base}/stuck?id=stuck`, track: ["INP"], waitMs: WAIT_MS });
    expect(stuck.isError).toBe(true);
    expect(stuck.content[0].text).toMatch(/did not answer within 8 seconds/);
    pass(await openPage("next"));
  }, 60000);

  it("in interact: the call fails, the page closes and the next call runs", async () => {
    await connect({ callLimitMs: LIMIT_MS });
    const { sessionId } = pass(await openPage("stuck", undefined, "stuck-click"));
    const steps = [{ action: "click", selector: "#save" }, { action: "wait", ms: 500 }, { action: "scroll" }];
    const [stuck, next] = await Promise.all([call("interact", { sessionId, steps }), lcp("next")]);
    expect(stuck.isError).toBe(true);
    expect(stuck.content[0].text).toMatch(/did not answer within 8.5 seconds, and it was closed/);
    pass(next);
    expect((await call("read_results", { sessionId })).isError).toBe(true);
  }, 60000);
});
