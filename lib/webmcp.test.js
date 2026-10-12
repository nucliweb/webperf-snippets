import { describe, it, expect } from "vitest";
import { modelContextOf, snippetTools, registerTools, unregisterTools } from "./webmcp";

const SNIPPETS = [
  { id: "LCP", category: "CoreWebVitals", title: "LCP", description: "Largest contentful paint", url: "https://x/CoreWebVitals/LCP", code: "lcp()" },
  { id: "TTFB", category: "Loading", title: "TTFB", description: "Time to first byte", url: "https://x/Loading/TTFB", code: "ttfb()" },
];

// A modelContext of the current draft: registerTool returns a promise and a duplicate name rejects
function fakeModelContext() {
  const tools = new Map();
  return {
    tools,
    registerTool(tool, { signal } = {}) {
      if (tools.has(tool.name)) return Promise.reject(new DOMException("duplicate", "InvalidStateError"));
      tools.set(tool.name, tool);
      signal?.addEventListener("abort", () => tools.delete(tool.name));
      return Promise.resolve();
    },
  };
}

describe("modelContextOf", () => {
  it("prefers document.modelContext, the API of the current draft", () => {
    const current = {};
    expect(modelContextOf({ document: { modelContext: current }, navigator: { modelContext: {} } })).toBe(current);
  });

  it("falls back to navigator.modelContext, which earlier Chromium versions expose", () => {
    const legacy = {};
    expect(modelContextOf({ document: {}, navigator: { modelContext: legacy } })).toBe(legacy);
  });

  it("gives null where the browser has no WebMCP", () => {
    expect(modelContextOf({ document: {}, navigator: {} })).toBeNull();
  });
});

describe("snippetTools", () => {
  const tools = snippetTools(SNIPPETS);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  it("defines the three tools, each with a title and marked as read-only", () => {
    expect(tools.map((t) => t.name)).toEqual(["list_snippets", "get_snippet", "search_snippets"]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations).toEqual({ readOnlyHint: true });
    }
  });

  it("lists and searches without the code, and gets a snippet with it", async () => {
    expect(await byName.list_snippets.execute({})).toEqual(SNIPPETS.map(({ code, ...meta }) => meta));
    expect(await byName.search_snippets.execute({ query: "first byte" })).toEqual([SNIPPETS[1]].map(({ code, ...meta }) => meta));
    expect(await byName.search_snippets.execute({ category: "CoreWebVitals" })).toHaveLength(1);
    expect(await byName.get_snippet.execute({ id: "TTFB" })).toEqual(SNIPPETS[1]);
    expect(await byName.get_snippet.execute({ id: "Nope" })).toMatchObject({ error: expect.stringMatching(/not found/) });
  });
});

describe("registerTools", () => {
  it("registers every tool with the signal, so aborting it unregisters them", async () => {
    const modelContext = fakeModelContext();
    const controller = new AbortController();
    await registerTools(modelContext, snippetTools(SNIPPETS), controller.signal);
    expect([...modelContext.tools.keys()]).toEqual(["list_snippets", "get_snippet", "search_snippets"]);
    controller.abort();
    expect(modelContext.tools.size).toBe(0);
  });

  it("returns the errors of the tools it could not register instead of throwing", async () => {
    const modelContext = fakeModelContext();
    const tools = snippetTools(SNIPPETS);
    await registerTools(modelContext, tools, new AbortController().signal);
    const errors = await registerTools(modelContext, tools, new AbortController().signal);
    expect(errors).toHaveLength(3);
    expect(errors[0].name).toBe("InvalidStateError");
  });

  it("returns the error of an API that throws instead of rejecting", async () => {
    const modelContext = { registerTool() { throw new Error("sync") } };
    const errors = await registerTools(modelContext, snippetTools(SNIPPETS), new AbortController().signal);
    expect(errors.map((e) => e.message)).toEqual(["sync", "sync", "sync"]);
  });
});

describe("unregisterTools", () => {
  it("calls unregisterTool by name where the API has it, as earlier Chromium versions do", () => {
    const removed = [];
    unregisterTools({ unregisterTool: (name) => removed.push(name) }, snippetTools(SNIPPETS));
    expect(removed).toEqual(["list_snippets", "get_snippet", "search_snippets"]);
  });

  it("does nothing where the API unregisters through the signal only", () => {
    expect(() => unregisterTools({}, snippetTools(SNIPPETS))).not.toThrow();
  });
});
