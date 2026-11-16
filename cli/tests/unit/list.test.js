import { describe, it, expect } from "vitest";
import { catalog, reportList } from "../../src/list.js";
import { describeSnippet, listSnippets } from "../../src/snippet-names.js";
import { WORKFLOWS } from "../../src/workflows/index.js";
import { USAGE } from "../../src/usage.js";

describe("describeSnippet", () => {
  it("gives the name, category, title, aliases and whether the snippet tracks interactions", () => {
    expect(describeSnippet("Loading/Find-render-blocking-resources")).toMatchObject({ name: "Loading/Find-render-blocking-resources", category: "Loading", aliases: ["render-blocking"], tracking: false });
    expect(describeSnippet("CoreWebVitals/INP").tracking).toBe(true);
    expect(describeSnippet("CoreWebVitals/LCP").title.length).toBeGreaterThan(0);
  });
});

describe("the catalog of --list", () => {
  const { workflows, snippets } = catalog();

  it("has every workflow with its title and the snippets of its steps", () => {
    expect(workflows.map((w) => w.name)).toEqual(Object.keys(WORKFLOWS));
    expect(workflows[0]).toEqual({ name: "core-web-vitals", title: "Core Web Vitals", snippets: ["CoreWebVitals/LCP", "CoreWebVitals/CLS"] });
  });

  it("has every snippet the CLI can run, as the list_snippets tool describes them", () => {
    expect(snippets.map((s) => s.name)).toEqual(listSnippets());
    expect(snippets.find((s) => s.name === "Loading/TTFB-Sub-Parts")).toEqual(describeSnippet("Loading/TTFB-Sub-Parts"));
  });
});

describe("the text of --list", () => {
  const lines = (terminal) => reportList(catalog(), terminal).replace(/\x1b\[[0-9;]*m/g, "").split("\n");

  it("names each workflow with the option that runs it", () => {
    const text = lines({ emoji: false });
    expect(text).toContain("Workflows (--workflow <name>)");
    expect(text.find((l) => /^\s+audit\s/.test(l))).toMatch(/audit\s+Structural Audit/);
    expect(text.find((l) => l.includes("core-web-vitals"))).toMatch(/core-web-vitals\s+Core Web Vitals \(default\)/);
  });

  it("names each snippet under its category, with its title and its aliases", () => {
    const text = lines({ emoji: false });
    expect(text).toContain(`Snippets (--snippet <name>), ${listSnippets().length}`);
    expect(text.indexOf("  Loading")).toBeGreaterThan(text.indexOf("  CoreWebVitals"));
    expect(text.find((l) => l.includes("Find-render-blocking-resources"))).toMatch(/^\s+Find-render-blocking-resources\s+.+\(render-blocking\)$/);
    expect(text.filter((l) => /^ {4}\S/.test(l))).toHaveLength(listSnippets().length);
  });

  it("cuts each line to the width of a terminal", () => {
    for (const line of lines({ emoji: true, columns: 60 })) expect(line.length).toBeLessThanOrEqual(60);
  });
});

describe("the help", () => {
  it("counts the snippets there are", () => {
    expect(USAGE).toContain(`Any of the ${listSnippets().length} snippets`);
    expect(USAGE).toMatch(/--list\s/);
  });
});
