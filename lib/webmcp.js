// WebMCP: the tools this site gives the AI agent of the browser (https://webmachinelearning.github.io/webmcp/).
// components/WebMCP.js registers them when the page loads and unregisters them when it unmounts.

// The current draft puts the API on document; Chromium before 150 exposes it on navigator
export function modelContextOf(win) {
  return win.document?.modelContext ?? win.navigator?.modelContext ?? null;
}

const metadata = ({ id, category, title, description, url }) => ({ id, category, title, description, url });

// The tools read the registry and change nothing, so every one is marked read-only
export function snippetTools(snippets) {
  return [
    {
      name: "list_snippets",
      title: "List snippets",
      description: "List all web performance measurement snippets available on this site. Returns metadata without code.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => snippets.map(metadata),
    },
    {
      name: "get_snippet",
      title: "Get a snippet",
      description: "Get the full JavaScript code for a specific web performance snippet by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: 'Snippet ID (e.g. "LCP", "CLS", "TTFB", "INP"). Use list_snippets to discover available IDs.',
          },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ id }) =>
        snippets.find((s) => s.id === id) ?? { error: `Snippet "${id}" not found. Use list_snippets to see available IDs.` },
    },
    {
      name: "search_snippets",
      title: "Search snippets",
      description: "Search web performance snippets by category and/or keyword. Returns metadata without code.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter by category. One of: CoreWebVitals, Loading, Interaction, Media, Resources.",
          },
          query: { type: "string", description: "Keyword to filter by title or description." },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async ({ category, query } = {}) => {
        const q = query?.toLowerCase();
        return snippets
          .filter((s) => !category || s.category === category)
          .filter((s) => !q || [s.title, s.description, s.id].some((text) => text.toLowerCase().includes(q)))
          .map(metadata);
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
