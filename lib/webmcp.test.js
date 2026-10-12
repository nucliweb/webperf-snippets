import { describe, it, expect } from "vitest";
import { modelContextOf, snippetTools, registerTools, unregisterTools } from "./webmcp";

const SNIPPETS = [
  {
    id: "LCP",
    path: "CoreWebVitals/LCP",
    category: "CoreWebVitals",
    title: "Largest contentful paint (LCP)",
    description: "Largest contentful paint",
    url: "https://x/CoreWebVitals/LCP",
    markdownUrl: "https://x/CoreWebVitals/LCP.md",
    sourceUrl: "https://github.com/x/LCP.js",
    code: "lcp()",
    prompt: "# Run the LCP snippet\n",
  },
  {
    id: "Long-Animation-Frames-Helpers",
    path: "Interaction/Long-Animation-Frames-Helpers",
    category: "Interaction",
    title: "Long animation frames helpers",
    description: "Helper functions for the console",
    url: "https://x/Interaction/Long-Animation-Frames-Helpers",
    markdownUrl: "https://x/Interaction/Long-Animation-Frames-Helpers.md",
    sourceUrl: "https://github.com/x/Helpers.js",
    code: "helpers()",
    prompt: null,
  },
];
const META = ({ id, path, category, title, description, url, markdownUrl }) => ({ id, path, category, title, description, url, markdownUrl });

// The data of the tools: the registry, loaded once, and the Markdown of a page
function source() {
  const loads = { registry: 0 };
  return {
    loads,
    registry: async () => {
      loads.registry++;
      return SNIPPETS;
    },
    markdown: async (url) => `# Page of ${url}`,
  };
}

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
  const data = source();
  const tools = snippetTools(data);
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  it("defines four tools, each with a title and marked as read-only", () => {
    expect(tools.map((t) => t.name)).toEqual(["list_snippets", "search_snippets", "get_snippet", "get_snippet_prompt"]);
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.annotations).toEqual({ readOnlyHint: true });
    }
  });

  it("loads nothing until a tool runs", () => {
    const lazy = source();
    snippetTools(lazy);
    expect(lazy.loads.registry).toBe(0);
  });

  it("lists and searches the snippets without their code", async () => {
    expect(await byName.list_snippets.execute({})).toEqual(SNIPPETS.map(META));
    expect(await byName.search_snippets.execute({ query: "console" })).toEqual([META(SNIPPETS[1])]);
    expect(await byName.search_snippets.execute({ category: "CoreWebVitals" })).toEqual([META(SNIPPETS[0])]);
  });

  it("gets a snippet with its code, source and the documentation of its page in Markdown", async () => {
    expect(await byName.get_snippet.execute({ id: "LCP" })).toEqual({
      ...META(SNIPPETS[0]),
      sourceUrl: "https://github.com/x/LCP.js",
      code: "lcp()",
      documentation: "# Page of https://x/CoreWebVitals/LCP.md",
    });
    expect(await byName.get_snippet.execute({ id: "Nope" })).toMatchObject({ error: expect.stringMatching(/not found/) });
  });

  it("gets the prompt to run a snippet with the CLI, with the page to measure when given", async () => {
    expect(await byName.get_snippet_prompt.execute({ id: "LCP" })).toEqual({ id: "LCP", prompt: "# Run the LCP snippet\n" });
    expect(await byName.get_snippet_prompt.execute({ id: "LCP", url: "https://example.com" })).toEqual({
      id: "LCP",
      prompt: "# Run the LCP snippet\n\nPage to measure: https://example.com\n",
    });
  });

  it("explains that a snippet the CLI cannot run has no prompt", async () => {
    expect(await byName.get_snippet_prompt.execute({ id: "Long-Animation-Frames-Helpers" })).toMatchObject({
      error: expect.stringMatching(/cannot run .* with the CLI.*get_snippet/),
    });
  });

  it("loads the registry once for all the calls", async () => {
    const counted = source();
    const own = Object.fromEntries(snippetTools(counted).map((t) => [t.name, t]));
    await own.list_snippets.execute({});
    await own.get_snippet.execute({ id: "LCP" });
    expect(counted.loads.registry).toBe(1);
  });
});

describe("registerTools", () => {
  it("registers every tool with the signal, so aborting it unregisters them", async () => {
    const modelContext = fakeModelContext();
    const controller = new AbortController();
    await registerTools(modelContext, snippetTools(source()), controller.signal);
    expect([...modelContext.tools.keys()]).toEqual(["list_snippets", "search_snippets", "get_snippet", "get_snippet_prompt"]);
    controller.abort();
    expect(modelContext.tools.size).toBe(0);
  });

  it("returns the errors of the tools it could not register instead of throwing", async () => {
    const modelContext = fakeModelContext();
    const tools = snippetTools(source());
    await registerTools(modelContext, tools, new AbortController().signal);
    const errors = await registerTools(modelContext, tools, new AbortController().signal);
    expect(errors).toHaveLength(4);
    expect(errors[0].name).toBe("InvalidStateError");
  });

  it("returns the error of an API that throws instead of rejecting", async () => {
    const modelContext = { registerTool() { throw new Error("sync") } };
    const errors = await registerTools(modelContext, snippetTools(source()), new AbortController().signal);
    expect(errors.map((e) => e.message)).toEqual(["sync", "sync", "sync", "sync"]);
  });
});

describe("unregisterTools", () => {
  it("calls unregisterTool by name where the API has it, as earlier Chromium versions do", () => {
    const removed = [];
    unregisterTools({ unregisterTool: (name) => removed.push(name) }, snippetTools(source()));
    expect(removed).toEqual(["list_snippets", "search_snippets", "get_snippet", "get_snippet_prompt"]);
  });

  it("does nothing where the API unregisters through the signal only", () => {
    expect(() => unregisterTools({}, snippetTools(source()))).not.toThrow();
  });
});
