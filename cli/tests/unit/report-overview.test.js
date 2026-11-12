import { describe, it, expect } from "vitest";
import { stripVTControlCharacters } from "node:util";
import { reportHuman } from "../../src/reporters/human.js";
import { reportMarkdown } from "../../src/reporters/markdown.js";

// The reports start with what the results found: the overview in one line and, in markdown, the errors
// and warnings to fix, so the comment of a pull request shows them before the tables.

const issue = (severity, id, message, extra = {}) => ({ severity, id, path: `Loading/${id}`, message, ...extra });

const audit = {
  url: "https://example.com",
  navMs: 900,
  overview: { snippets: 4, withErrors: 1, withWarnings: 1, withNothingToFix: 2 },
  issues: [
    issue("error", "render-blocking", "2 render-blocking resources delay the first paint until 532ms", { code: "render-blocking" }),
    issue("warning", "webfonts", "A font for nothing"),
    issue("info", "content-visibility", "No content-visibility usage found"),
  ],
  results: [
    { id: "render-blocking", status: "ok", issues: [{ severity: "error", message: "2 render-blocking resources delay the first paint until 532ms" }] },
    { id: "webfonts", status: "ok", issues: [{ severity: "warning", message: "A font for nothing" }] },
    { id: "content-visibility", status: "ok", issues: [{ severity: "info", message: "No content-visibility usage found" }] },
    { id: "ttfb", status: "ok", issues: [] },
  ],
  pageErrors: [],
};

const metrics = {
  url: "https://example.com",
  navMs: 900,
  overview: { snippets: 2, withErrors: 0, withWarnings: 0, withNothingToFix: 2 },
  issues: [],
  results: [
    { id: "LCP", status: "ok", metric: "LCP", value: 1200, unit: "ms", rating: "good" },
    { id: "CLS", status: "ok", metric: "CLS", value: 0, unit: "score", rating: "good" },
  ],
  pageErrors: [],
};

const OVERVIEW = "4 snippets: 1 with errors, 1 with warnings, 2 with nothing to fix";

describe("the markdown report", () => {
  it("says the overview under its title, and lists the errors and warnings before the results", () => {
    const md = reportMarkdown(audit);
    const lines = md.split("\n");
    expect(lines.indexOf(OVERVIEW)).toBeGreaterThan(lines.indexOf("## WebPerf Results — https://example.com"));
    const list = md.indexOf("### Errors and warnings");
    expect(list).toBeGreaterThan(md.indexOf(OVERVIEW));
    expect(list).toBeLessThan(md.indexOf("### Results"));
    expect(md).toContain("- 🔴 `render-blocking`: 2 render-blocking resources delay the first paint until 532ms");
    expect(md).toContain("- 🟡 `webfonts`: A font for nothing");
    // Info is in the table of each step, not in the list of what to fix
    expect(md.slice(list, md.indexOf("### Results"))).not.toContain("content-visibility");
  });

  it("lists 30 issues at most, and says how many more there are", () => {
    const many = Array.from({ length: 34 }, (_, i) => issue("warning", `step-${i}`, `Warning ${i}`));
    const md = reportMarkdown({ ...audit, issues: many });
    expect(md).toContain("- 🟡 `step-29`: Warning 29");
    expect(md).not.toContain("`step-30`");
    expect(md).toContain("- …and 4 more, in the results below");
  });

  it("writes the text of the page as text: markdown and line breaks of a message do not format the list", () => {
    const md = reportMarkdown({ ...audit, issues: [issue("error", "x", "A *bold* claim\n## and a heading [link](https://evil.example)")] });
    expect(md).toContain("- 🔴 `x`: A \\*bold\\* claim ## and a heading \\[link\\](https://evil.example)");
  });

  // GitHub reads <head> or <link rel="preload"> in a comment as HTML and drops it: "1 blocking script(s) in "
  it("keeps the HTML a message names, in the list and in the table of the results", () => {
    const message = '1 blocking script(s) in <head> | LCP image has no <link rel="preload" as="image">';
    const md = reportMarkdown({
      ...audit,
      issues: [issue("error", "script-loading", message)],
      results: [{ id: "script-loading", status: "ok", issues: [{ severity: "error", message }] }],
    });
    expect(md).toContain('- 🔴 `script-loading`: 1 blocking script(s) in \\<head> | LCP image has no \\<link rel="preload" as="image">');
    expect(md).toContain('| script-loading | 🔴 fail | 1 blocking script(s) in \\<head> \\| LCP image has no \\<link rel="preload" as="image"> |');
  });

  it("says the overview with no list when nothing is to fix", () => {
    const md = reportMarkdown({ ...audit, overview: { snippets: 1, withErrors: 0, withWarnings: 0, withNothingToFix: 1 }, issues: [issue("info", "content-visibility", "An info")] });
    expect(md).toContain("1 snippet: 0 with errors, 0 with warnings, 1 with nothing to fix");
    expect(md).not.toContain("### Errors and warnings");
  });

  it("adds nothing to results that have no issues to count, such as LCP and CLS, or to a report without an overview", () => {
    expect(reportMarkdown(metrics)).not.toContain("snippets:");
    const { overview, issues, ...older } = audit;
    const md = reportMarkdown(older);
    expect(md).not.toContain("snippets:");
    expect(md).not.toContain("### Errors and warnings");
  });
});

describe("the human report", () => {
  it("says the overview before the results of each step", () => {
    const text = stripVTControlCharacters(reportHuman(audit));
    const lines = text.split("\n");
    const at = lines.indexOf(OVERVIEW);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(lines.findIndex((l) => l.includes("render-blocking")));
  });

  it("adds nothing to results that have no issues to count, or to a report without an overview", () => {
    expect(stripVTControlCharacters(reportHuman(metrics))).not.toContain("snippets:");
    const { overview, ...older } = audit;
    expect(stripVTControlCharacters(reportHuman(older))).not.toContain("snippets:");
  });
});
