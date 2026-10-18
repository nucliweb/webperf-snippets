import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResourceTemplate, ResourceNotFoundError } from "@modelcontextprotocol/server";
import { SNIPPET_DIRS } from "../load-snippet.js";
import { CATEGORIES } from "../snippet-names.js";

const MARKDOWN = "text/markdown";

// A document of snippets/, from the copy bundled with the package or from the repository
function readDocument(relativePath) {
  for (const dir of SNIPPET_DIRS) {
    try {
      return readFileSync(join(dir, relativePath), "utf8");
    } catch {
      // try the next directory
    }
  }
  return null;
}

// Splits SCHEMA.md into the general contract and the section of each snippet ("#### LCP" up to the next
// heading of that level or above). The general contract is everything outside "## Script-Specific Schemas".
export function splitSchema(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## Script-Specific Schemas"));
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const general = [...lines.slice(0, start), ...lines.slice(end)].join("\n");

  const sections = new Map();
  let name = null;
  let current = [];
  const flush = () => name && sections.set(name, current.join("\n").trim());
  for (const line of lines.slice(start, end)) {
    if (line.startsWith("#### ")) {
      flush();
      name = line.slice(5).split(" ")[0];
      current = [line];
    } else if (/^#{1,3} /.test(line)) {
      flush();
      name = null;
    } else if (name) {
      current.push(line);
    }
  }
  flush();
  return { general, sections };
}

let schema = null;
export function schemaSection(snippet) {
  schema ??= splitSchema(readDocument("SCHEMA.md") ?? "");
  return snippet === undefined ? schema.general : schema.sections.get(snippet);
}

function schemaSnippets() {
  schemaSection();
  return [...schema.sections.keys()];
}

const markdown = (uri, text) => ({ contents: [{ uri: uri.href, mimeType: MARKDOWN, text }] });

export function registerResources(server) {
  server.registerResource(
    "schema",
    "webperf://schema",
    {
      title: "Snippet result contract",
      description: "What every snippet returns: the base shape, the statuses, the execution patterns and how to read a result. The fields of each snippet are in webperf://schema/{snippet}.",
      mimeType: MARKDOWN,
    },
    async (uri) => markdown(uri, schemaSection())
  );

  server.registerResource(
    "snippet-schema",
    new ResourceTemplate("webperf://schema/{snippet}", {
      list: async () => ({
        resources: schemaSnippets().map((snippet) => ({ uri: `webperf://schema/${snippet}`, name: `${snippet} result`, mimeType: MARKDOWN })),
      }),
    }),
    {
      title: "Result of one snippet",
      description: "The fields one snippet returns, with an example, from snippets/SCHEMA.md.",
      mimeType: MARKDOWN,
    },
    async (uri, { snippet }) => {
      const section = schemaSection(snippet);
      if (!section) throw new ResourceNotFoundError(uri.href);
      return markdown(uri, section);
    }
  );

  server.registerResource(
    "workflows",
    new ResourceTemplate("webperf://workflows/{category}", {
      list: async () => ({
        resources: CATEGORIES.map((category) => ({ uri: `webperf://workflows/${category}`, name: `${category} workflows`, mimeType: MARKDOWN })),
      }),
    }),
    {
      title: "Workflows and decision tree",
      description: "The snippets to run for common questions of a category, and what to run next after each one depending on its result.",
      mimeType: MARKDOWN,
    },
    async (uri, { category }) => {
      const text = CATEGORIES.includes(category) ? readDocument(`${category}/WORKFLOWS.md`) : null;
      if (!text) throw new ResourceNotFoundError(uri.href);
      return markdown(uri, text);
    }
  );
}
