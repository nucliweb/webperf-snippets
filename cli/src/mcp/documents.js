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
// heading of that level or above). The general contract is everything outside "## Script-Specific Schemas"
// and outside the tables of "## Issue codes", whose rules it keeps. The table of a snippet ("### LCP"
// under Issue codes) goes with its section, or makes one when the snippet has none.
export function splitSchema(markdown) {
  const lines = markdown.split("\n");
  const sectionOf = (heading) => {
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start === -1) return [lines.length, lines.length];
    const next = lines.findIndex((l, i) => i > start && l.startsWith("## "));
    return [start, next === -1 ? lines.length : next];
  };
  const [schemasStart, schemasEnd] = sectionOf("## Script-Specific Schemas");
  const [codesStart, codesEnd] = sectionOf("## Issue codes");
  const firstTable = lines.findIndex((l, i) => i > codesStart && i < codesEnd && l.startsWith("### "));
  const tablesStart = firstTable === -1 ? codesEnd : firstTable;
  const general = lines
    .filter((_, i) => !(i >= schemasStart && i < schemasEnd) && !(i >= tablesStart && i < codesEnd))
    .join("\n");

  const sections = new Map();
  const collect = (from, to, level, add) => {
    let name = null;
    let current = [];
    const flush = () => name && add(name, current.join("\n").trim());
    for (const line of lines.slice(from, to)) {
      if (line.startsWith(`${level} `)) {
        flush();
        name = line.slice(level.length + 1).split(" ")[0];
        current = [line];
      } else if (/^#{1,4} /.test(line)) {
        flush();
        name = null;
      } else if (name) {
        current.push(line);
      }
    }
    flush();
  };
  collect(schemasStart, schemasEnd, "####", (name, text) => sections.set(name, text));
  collect(tablesStart, codesEnd, "###", (name, text) => {
    // The last table runs into the rule that closes the section
    const table = `Issue codes:\n${text.split("\n").slice(1).join("\n").replace(/\n+---$/, "")}`;
    sections.set(name, sections.has(name) ? `${sections.get(name)}\n\n${table}` : `#### ${name}\n\n${table}`);
  });
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
      description: "What every snippet returns: the base shape, the statuses, the execution patterns, how to read a result and the rules of the issue codes. The fields and the issue codes of each snippet are in webperf://schema/{snippet}.",
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
      description: "The fields one snippet returns, with an example, and the codes of its issues, from snippets/SCHEMA.md.",
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
