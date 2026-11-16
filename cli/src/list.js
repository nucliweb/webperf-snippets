import { styleText } from "node:util";
import { describeSnippet, listSnippets } from "./snippet-names.js";
import { DEFAULT_WORKFLOW, WORKFLOWS } from "./workflows/index.js";
import { ANY_TERMINAL, fit, pad, room } from "./reporters/terminal.js";

// What --list answers with: every name --workflow and --snippet take. The workflows with the snippets
// of their steps, and the snippets as the list_snippets tool of the MCP server describes them.
export function catalog() {
  return {
    workflows: Object.entries(WORKFLOWS).map(([name, workflow]) => ({ name, title: workflow.title, snippets: workflow.steps.map((step) => step.path) })),
    snippets: listSnippets().map(describeSnippet),
  };
}

// The catalog as text: the workflows, then the snippets under their category, each with its title and
// its short names. On a terminal a line is cut to its width, as in the report.
export function reportList({ workflows, snippets }, terminal = ANY_TERMINAL) {
  const row = (indent, text) => " ".repeat(indent) + fit(text, room(terminal, indent));
  const lines = [styleText("bold", "Workflows (--workflow <name>)")];
  const workflowWidth = Math.max(...workflows.map((w) => w.name.length)) + 3;
  for (const w of workflows) lines.push(row(2, `${pad(w.name, workflowWidth)}${w.title}${w.name === DEFAULT_WORKFLOW ? " (default)" : ""}`));

  lines.push("", styleText("bold", `Snippets (--snippet <name>), ${snippets.length}`));
  const bare = (snippet) => snippet.name.split("/")[1];
  // The column of the names fits most of them; the few longer ones push their own title, not every one
  const snippetWidth = Math.min(Math.max(...snippets.map((s) => bare(s).length)), 36) + 3;
  for (const category of [...new Set(snippets.map((s) => s.category))]) {
    lines.push(`  ${category}`);
    for (const s of snippets.filter((s) => s.category === category)) {
      lines.push(row(4, `${pad(`${bare(s)}  `, snippetWidth)}${s.title}${s.aliases.length ? `  (${s.aliases.join(", ")})` : ""}`));
    }
  }
  return lines.join("\n");
}
