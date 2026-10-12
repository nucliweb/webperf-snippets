// WebMCP: the tools this site gives the AI agent of the browser (https://webmachinelearning.github.io/webmcp/).
// components/WebMCP.js registers them when the page loads and unregisters them when it unmounts.

// The current draft puts the API on document; Chromium before 150 exposes it on navigator
export function modelContextOf(win) {
  return win.document?.modelContext ?? win.navigator?.modelContext ?? null;
}

const metadata = ({ id, path, category, title, description, url, markdownUrl }) => ({ id, path, category, title, description, url, markdownUrl });

const notFound = (id) => ({ error: `Snippet "${id}" not found. Use list_snippets or search_snippets to see the available IDs.` });

const ID = {
  type: "string",
  description: 'Snippet ID, such as "LCP", "INP" or "TTFB-Sub-Parts". Use list_snippets or search_snippets to discover them.',
};

// data: { registry(), markdown(url) }. The registry (public/webmcp/snippets.json) loads on the first
// call of a tool, once; registering the tools needs none of it. The tools change nothing, so every one
// is marked read-only.
export function snippetTools(data) {
  let registry;
  const snippets = () => (registry ??= data.registry());
  const find = async (id) => (await snippets()).find((s) => s.id === id);

  return [
    {
      name: "list_snippets",
      title: "List snippets",
      description: "List the web performance snippets of this site, with the page and Markdown documentation of each one. Returns no code.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => (await snippets()).map(metadata),
    },
    {
      name: "search_snippets",
      title: "Search snippets",
      description: "Search the web performance snippets by category and/or keyword in their ID, title or description. Returns no code.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter by category. One of: CoreWebVitals, Loading, Interaction, Media, Resources, DevTools-Overrides.",
          },
          query: { type: "string", description: "Keyword to look for in the ID, title or description." },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async ({ category, query } = {}) => {
        const q = query?.toLowerCase();
        return (await snippets())
          .filter((s) => !category || s.category === category)
          .filter((s) => !q || [s.title, s.description, s.id].some((text) => text.toLowerCase().includes(q)))
          .map(metadata);
      },
    },
    {
      name: "get_snippet",
      title: "Get a snippet",
      description:
        "Get a snippet with its JavaScript code and the documentation of its page in Markdown: what it measures, the thresholds and how to read the result. The code runs in the browser console of the page to measure.",
      inputSchema: { type: "object", properties: { id: ID }, required: ["id"] },
      annotations: { readOnlyHint: true },
      execute: async ({ id }) => {
        const snippet = await find(id);
        if (!snippet) return notFound(id);
        return { ...metadata(snippet), sourceUrl: snippet.sourceUrl, code: snippet.code, documentation: await data.markdown(snippet.markdownUrl) };
      },
    },
    {
      name: "get_snippet_prompt",
      title: "Get the prompt to run a snippet",
      description:
        "Get the instructions to run a snippet on any URL with the webperf-snippets CLI, which loads the page in headless Chromium, and to report the result. Pass the URL to measure, or the prompt asks for it.",
      inputSchema: {
        type: "object",
        properties: { id: ID, url: { type: "string", description: "URL of the page to measure." } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ id, url }) => {
        const snippet = await find(id);
        if (!snippet) return notFound(id);
        if (!snippet.prompt) {
          return { error: `The snippet "${id}" cannot run in a meaningful way with the CLI. Use get_snippet and run its code in the browser console.` };
        }
        return { id, prompt: url ? `${snippet.prompt}\nPage to measure: ${url}\n` : snippet.prompt };
      },
    },
  ];
}

// Registers each tool with the signal, which unregisters it when aborted. In the current draft
// registerTool returns a promise that rejects, for example on a duplicate name; an earlier API could
// throw instead. Either way the error is returned, not thrown, so one tool does not stop the others.
export async function registerTools(modelContext, tools, signal) {
  const results = await Promise.allSettled(tools.map(async (tool) => modelContext.registerTool(tool, { signal })));
  return results.filter((r) => r.status === "rejected").map((r) => r.reason);
}

// Earlier Chromium versions unregister a tool by name instead of through the signal
export function unregisterTools(modelContext, tools) {
  if (typeof modelContext.unregisterTool !== "function") return;
  for (const { name } of tools) {
    try {
      modelContext.unregisterTool(name);
    } catch {
      // The tool was not registered, or the signal already removed it
    }
  }
}
