import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/mcp/server.js";
import { createQueue } from "../../src/mcp/queue.js";
import { cliVersion } from "../../src/report-to.js";

// A client and the server joined in memory, with no process in between. The in-memory transport
// speaks the legacy era of the protocol (the `initialize` handshake); the modern era is covered by
// the e2e test that starts the real server over stdio.
let client;

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

describe("the MCP server", () => {
  it("introduces itself with the name and the version of the CLI", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "webperf-snippets", version: cliVersion });
  });

  it("declares that it offers tools", () => {
    expect(client.getServerCapabilities()).toHaveProperty("tools");
  });

  // The secrets of the CLI (--header, --storage-state, the keys) stay out of its outputs, which
  // tests/e2e/secrets.test.js checks. An MCP client passes its arguments through the agent, so a
  // tool that took one would put the secret in the conversation.
  it("takes no headers, storage state or keys in any tool", async () => {
    const { tools } = await client.listTools();
    const inputs = tools.flatMap((t) => Object.keys(t.inputSchema.properties ?? {}).map((name) => `${t.name}.${name}`));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.filter((input) => /header|storage|cookie|key|token|secret/i.test(input))).toEqual([]);
  });

  // A page can put instructions for the agent in what a snippet returns (an alt text, a class, the URL
  // of a resource); the agent has to read them as data, from the first message of the server on
  it("tells the agent in its instructions that what a page returns is data, never an instruction", () => {
    expect(client.getInstructions()).toMatch(/comes from the measured page/);
    expect(client.getInstructions()).toMatch(/never an instruction/);
  });

  it("says so in every tool that returns what a page holds", async () => {
    const { tools } = await client.listTools();
    for (const name of ["run_snippet", "run_workflow", "open_page", "interact", "read_results", "get_details"]) {
      expect(tools.find((t) => t.name === name).description, name).toMatch(/comes from the measured page[^.]*never an instruction/);
    }
  });
});

describe("list_snippets", () => {
  const call = (args = {}) => client.callTool({ name: "list_snippets", arguments: args });

  it("is listed with a description and an optional category filter", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "list_snippets");
    expect(tool.description).toMatch(/snippet/i);
    expect(tool.inputSchema.properties.category.enum).toEqual(["CoreWebVitals", "Loading", "Interaction", "Media", "Resources"]);
    expect(tool.inputSchema.required ?? []).not.toContain("category");
  });

  it("returns every snippet the CLI can run, as structured content and as text", async () => {
    const result = await call();
    const { snippets } = result.structuredContent;
    expect(snippets).toHaveLength(57);
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    for (const s of snippets) {
      expect(s.name).toBe(`${s.category}/${s.name.split("/")[1]}`);
      expect(s.title.length).toBeGreaterThan(0);
      expect(Array.isArray(s.aliases)).toBe(true);
      expect(typeof s.tracking).toBe("boolean");
    }
  });

  it("gives the title, the short aliases and whether the snippet tracks interactions", async () => {
    const { snippets } = (await call()).structuredContent;
    const byName = Object.fromEntries(snippets.map((s) => [s.name, s]));
    expect(byName["CoreWebVitals/LCP"]).toMatchObject({ title: "LCP Quick Check", tracking: false });
    expect(byName["Loading/Find-render-blocking-resources"].aliases).toEqual(["render-blocking"]);
    expect(byName["CoreWebVitals/INP"].tracking).toBe(true);
  });

  it("filters by category", async () => {
    const { snippets } = (await call({ category: "Media" })).structuredContent;
    expect(snippets.map((s) => s.category)).toEqual(["Media", "Media", "Media", "Media"]);
  });

  it("answers an unknown category with a tool error the agent can read, not a protocol error", async () => {
    const result = await call({ category: "Fonts" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/category/i);
  });
});

describe("several runs on the tools that measure", () => {
  it("is an optional argument of run_snippet and run_workflow, from 1 to 9 as --runs, with the runs in the answer", async () => {
    const { tools } = await client.listTools();
    for (const name of ["run_snippet", "run_workflow"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.inputSchema.properties.runs, name).toMatchObject({ type: "integer", minimum: 1, maximum: 9, default: 1 });
      expect(tool.inputSchema.properties.runs.description, name).toMatch(/median/);
      expect(tool.inputSchema.required, name).not.toContain("runs");
      expect(tool.outputSchema.properties.runs, name).toBeDefined();
      expect(tool.outputSchema.required, name).not.toContain("runs");
    }
  });

  it.each([0, 10, 2.5])("refuses %s runs before any page loads", async (runs) => {
    const result = await client.callTool({ name: "run_snippet", arguments: { url: "http://127.0.0.1:9/", snippet: "LCP", runs } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/runs/);
  });
});

describe("throttling on the tools that load a page", () => {
  const TOOLS = ["run_snippet", "run_workflow", "open_page"];
  // Nothing listens on this port: a tool that loaded the page would answer with ERR_CONNECTION_REFUSED
  const unreachable = "http://127.0.0.1:9/";
  const argsOf = (name) => ({ url: unreachable, ...(name === "run_snippet" ? { snippet: "LCP" } : name === "open_page" ? { track: ["INP"] } : {}) });

  it("takes an optional cpu and network, as --cpu and --network of the CLI, and answers with the throttling", async () => {
    const { tools } = await client.listTools();
    for (const name of TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.inputSchema.properties.cpu, name).toMatchObject({ type: "number", minimum: 1 });
      expect(tool.inputSchema.properties.cpu.description, name).toMatch(/--cpu/);
      expect(tool.inputSchema.properties.network, name).toMatchObject({ type: "string", enum: ["fast-4g", "slow-4g", "3g"] });
      expect(tool.inputSchema.properties.network.description, name).toMatch(/--network/);
      expect(tool.inputSchema.required ?? [], name).not.toContain("cpu");
      expect(tool.inputSchema.required ?? [], name).not.toContain("network");
      expect(tool.outputSchema.properties.throttling, name).toBeDefined();
      expect(tool.outputSchema.required ?? [], name).not.toContain("throttling");
      expect(tool.description, name).toMatch(/cpu and network/);
    }
  });

  it.each(TOOLS)("%s refuses a CPU factor under 1 or a network that is not a preset, before any page loads", async (name) => {
    const cpu = await client.callTool({ name, arguments: { ...argsOf(name), cpu: 0.5 } });
    expect(cpu.isError).toBe(true);
    expect(cpu.content[0].text).toMatch(/cpu/);
    const network = await client.callTool({ name, arguments: { ...argsOf(name), network: "5g" } });
    expect(network.isError).toBe(true);
    expect(network.content[0].text).toMatch(/network/);
  });
});

describe("interactions on the tools that measure a page load", () => {
  const unreachable = "http://127.0.0.1:9/";

  it("is an optional list of the steps of interact on run_snippet and run_workflow, up to 50", async () => {
    const { tools } = await client.listTools();
    const interact = tools.find((t) => t.name === "interact").inputSchema.properties.steps;
    for (const name of ["run_snippet", "run_workflow"]) {
      const tool = tools.find((t) => t.name === name);
      const { interactions } = tool.inputSchema.properties;
      expect(interactions, name).toMatchObject({ type: "array", minItems: 1, maxItems: 50 });
      expect(interactions.items, name).toEqual(interact.items);
      expect(interactions.description, name).toMatch(/click/);
      expect(tool.inputSchema.required ?? [], name).not.toContain("interactions");
    }
  });

  it("refuses more than 50 steps or a step interact does not know, before any page loads", async () => {
    const tooMany = await client.callTool({ name: "run_workflow", arguments: { url: unreachable, interactions: Array.from({ length: 51 }, () => ({ action: "wait", ms: 0 })) } });
    expect(tooMany.isError).toBe(true);
    expect(tooMany.content[0].text).toMatch(/interactions/);
    const unknown = await client.callTool({ name: "run_snippet", arguments: { url: unreachable, snippet: "INP", interactions: [{ action: "drag", selector: "#a" }] } });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toMatch(/interactions/);
  });

  it("is what a tracking snippet needs in run_snippet, which says so along with open_page", async () => {
    const result = await client.callTool({ name: "run_snippet", arguments: { url: unreachable, snippet: "INP" } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/CoreWebVitals\/INP records interactions/);
    expect(result.content[0].text).toMatch(/interactions.*click.*or.*open_page.*interact.*read_results/);
  });
});

describe("several measuring calls at a time", () => {
  it("says so in the tools that measure, and that it saves no time", async () => {
    const { tools } = await client.listTools();
    for (const name of ["run_snippet", "run_workflow"]) {
      expect(tools.find((t) => t.name === name).description, name).toMatch(/one at a time[^.]*save no time/);
    }
  });
});

// The queue alone, with tasks the tests finish by hand; tests/e2e/mcp-queue.test.js has the tools on it
describe("the queue of a connection", () => {
  const task = () => {
    const held = {};
    held.finished = new Promise((resolve, reject) => Object.assign(held, { finish: resolve, fail: reject }));
    return held;
  };
  // Lets the promises that can run, run
  const settled = () => new Promise((resolve) => setImmediate(resolve));

  it("runs one task at a time, in the order they arrive", async () => {
    const queue = createQueue();
    const tasks = [task(), task(), task()];
    const started = [];
    const answers = tasks.map((t, i) =>
      queue.run(() => {
        started.push(i);
        return t.finished;
      })
    );

    await settled();
    expect(started).toEqual([0]);
    tasks[0].finish("first");
    await settled();
    expect(started).toEqual([0, 1]);
    tasks[1].finish("second");
    await settled();
    expect(started).toEqual([0, 1, 2]);
    tasks[2].finish("third");
    expect(await Promise.all(answers)).toEqual(["first", "second", "third"]);
  });

  it("reports nothing to a task with nothing ahead of it", async () => {
    const onWait = vi.fn();
    await createQueue().run(async () => {}, { onWait });
    await settled();
    expect(onWait).not.toHaveBeenCalled();
  });

  it("passes the turn when a task fails, and the failure stays with its caller", async () => {
    const queue = createQueue();
    const failing = task();
    const failed = queue.run(() => failing.finished);
    const threw = queue.run(() => {
      throw new Error("failed at once");
    });
    const next = queue.run(async () => "next");

    failing.fail(new Error("the page did not load"));
    await expect(failed).rejects.toThrow("the page did not load");
    await expect(threw).rejects.toThrow("failed at once");
    await expect(next).resolves.toBe("next");
  });

  it("leaves out a caller that gives up while it waits: it answers at once, never runs, and holds up no one", async () => {
    const queue = createQueue();
    const first = task();
    const controller = new AbortController();
    const skipped = vi.fn();
    const running = queue.run(() => first.finished);
    const gaveUp = queue.run(skipped, { signal: controller.signal });
    const next = queue.run(async () => "next");

    controller.abort();
    // The task ahead has not finished: the caller does not wait for it to learn that it left
    await expect(gaveUp).rejects.toThrow(/gave up/);
    first.finish();
    await running;
    await expect(next).resolves.toBe("next");
    expect(skipped).not.toHaveBeenCalled();
  });

  it("does not run a caller that had already given up, with nothing ahead of it", async () => {
    const queue = createQueue();
    const skipped = vi.fn();
    await expect(queue.run(skipped, { signal: AbortSignal.abort() })).rejects.toThrow(/gave up/);
    expect(skipped).not.toHaveBeenCalled();
    await expect(queue.run(async () => "next")).resolves.toBe("next");
  });

  it("takes a reason that is not an error, which is what a client sends", async () => {
    const queue = createQueue();
    const first = task();
    const controller = new AbortController();
    const running = queue.run(() => first.finished);
    const gaveUp = queue.run(async () => {}, { signal: controller.signal });
    controller.abort("the user stopped it");
    await expect(gaveUp).rejects.toBeInstanceOf(Error);
    first.finish();
    await running;
  });

  it("tells a waiting caller how many calls are ahead, when it starts and when the line moves", async () => {
    const queue = createQueue();
    const first = task();
    const second = task();
    const controller = new AbortController();
    const reports = [];
    const running = [queue.run(() => first.finished), queue.run(() => second.finished)];
    const leaving = queue.run(async () => {}, { signal: controller.signal });
    const last = queue.run(async () => {}, { onWait: (ahead) => reports.push(ahead) });

    await settled();
    expect(reports).toEqual([3]);
    controller.abort();
    await expect(leaving).rejects.toThrow();
    await settled();
    expect(reports).toEqual([3, 2]);
    first.finish();
    await settled();
    expect(reports).toEqual([3, 2, 1]);
    second.finish();
    await Promise.all([...running, last]);
    expect(reports).toEqual([3, 2, 1]);
  });

  describe("while the line does not move", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("keeps telling a waiting caller, so a client that resets its timeout on progress stays, and stops when its turn comes", async () => {
      const queue = createQueue({ reportEveryMs: 1000 });
      const first = task();
      const reports = [];
      const running = queue.run(() => first.finished);
      const next = queue.run(async () => {}, { onWait: (ahead) => reports.push(ahead) });

      await vi.advanceTimersByTimeAsync(2500);
      expect(reports).toEqual([1, 1, 1]);
      first.finish();
      await Promise.all([running, next]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(reports).toEqual([1, 1, 1]);
    });

    it("stops telling a caller that gave up", async () => {
      const queue = createQueue({ reportEveryMs: 1000 });
      const first = task();
      const controller = new AbortController();
      const onWait = vi.fn();
      const running = queue.run(() => first.finished);
      const gaveUp = queue.run(async () => {}, { signal: controller.signal, onWait });

      await vi.advanceTimersByTimeAsync(1500);
      controller.abort();
      await expect(gaveUp).rejects.toThrow();
      const reported = onWait.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(onWait).toHaveBeenCalledTimes(reported);
      first.finish();
      await running;
    });

    it("survives a report that fails, as one to a client that left", async () => {
      const queue = createQueue({ reportEveryMs: 1000 });
      const first = task();
      const running = queue.run(() => first.finished);
      const rejects = queue.run(async () => "rejects", { onWait: () => Promise.reject(new Error("Not connected")) });
      const throws = queue.run(async () => "throws", {
        onWait: () => {
          throw new Error("Not connected");
        },
      });

      await vi.advanceTimersByTimeAsync(1500);
      first.finish();
      await running;
      expect(await Promise.all([rejects, throws])).toEqual(["rejects", "throws"]);
    });
  });
});

// The comparison itself is the one of baseline.js (tests/unit/mcp-baseline.test.js); here, the
// arguments of the tools and the checks that come before the page loads
describe("a baseline on the tools that measure", () => {
  // Nothing listens on this port: a tool that loaded the page would answer with ERR_CONNECTION_REFUSED
  const unreachable = "http://127.0.0.1:9/";

  it("is an optional argument of run_snippet and run_workflow, with the thresholds of --threshold", async () => {
    const { tools } = await client.listTools();
    for (const name of ["run_snippet", "run_workflow"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.inputSchema.properties.baseline.description, name).toMatch(/runId.*--json/);
      expect(tool.inputSchema.properties.thresholds.type, name).toBe("array");
      expect(tool.inputSchema.required, name).not.toContain("baseline");
      expect(tool.outputSchema.properties.baseline, name).toBeDefined();
    }
  });

  it("is checked before the page loads, as the CLI checks it before Chromium opens", async () => {
    const result = await client.callTool({ name: "run_snippet", arguments: { url: unreachable, snippet: "LCP", baseline: "/nowhere/baseline.json" } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Cannot read the baseline \/nowhere\/baseline.json: the file does not exist/);
  });

  it("answers a runId the connection does not keep, or a wrong threshold, with a tool error", async () => {
    const run = (args) => client.callTool({ name: "run_workflow", arguments: { url: unreachable, ...args } });
    const unknown = await run({ baseline: "3f1c2b9e-8d2a-4c4e-9f0a-1b2c3d4e5f60" });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toMatch(/Unknown runId/);
    const threshold = await run({ baseline: "/nowhere/baseline.json", thresholds: ["LCP=fast"] });
    expect(threshold.isError).toBe(true);
    expect(threshold.content[0].text).toMatch(/LCP=15%/);
  });

  it("is what thresholds are for, as --threshold needs --baseline", async () => {
    const result = await client.callTool({ name: "run_workflow", arguments: { url: unreachable, thresholds: ["LCP=15%"] } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/thresholds need a baseline/);
  });

  it("can be a run of the connection, which the server lists as a resource once there is one", async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.find((t) => t.uriTemplate === "webperf://runs/{runId}").mimeType).toBe("application/json");
    const { resources } = await client.listResources();
    expect(resources.filter((r) => r.uri.startsWith("webperf://runs/"))).toEqual([]);
    await expect(client.readResource({ uri: "webperf://runs/nope" })).rejects.toThrow(/not found/i);
  });
});
