import { describe, it, expect } from "vitest";
import { listSnippets } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";
import { ISSUE_CODE, PENDING_ISSUE_CODES, codesInSource, catalogOf, readCatalog } from "../helpers/issue-codes.js";

// The catalog of issue codes in snippets/SCHEMA.md and the codes in the source of each snippet say
// the same: renaming a code means touching its documentation, and the review sees it.

describe("codesInSource", () => {
  it("reads the literal codes of the issue objects", () => {
    const source = `issues.push({ code: "blocking-in-head", severity: "error", message: "a" });
      issues.push({
        code: "large-blocking",
        severity: "warning",
      });`;
    expect(codesInSource(source)).toEqual({ codes: new Set(["blocking-in-head", "large-blocking"]), nonLiteral: 0 });
  });

  it("reads a code in single quotes, as the snippets written with them have", () => {
    expect(codesInSource("issues.push({ code: 'invalid-json', severity: 'error' })")).toEqual({ codes: new Set(["invalid-json"]), nonLiteral: 0 });
  });

  it("leaves out the word code inside a string, and accepts a copy of a code already set", () => {
    const source = `console.log("%cSuggested code:", "bold"); issues.map((i) => ({ code: i.code, severity: i.severity }))`;
    expect(codesInSource(source)).toEqual({ codes: new Set(), nonLiteral: 0 });
  });

  it("counts a code built at run time", () => {
    expect(codesInSource("issues.push({ code: `${kind}-blocking`, severity: \"error\" })").nonLiteral).toBe(1);
  });
});

describe("catalogOf", () => {
  it("reads the codes of each snippet from the Issue codes section only", () => {
    const markdown = [
      "## Script-Specific Schemas",
      "| `not-a-code` | x |",
      "## Issue codes",
      "### Script-Loading",
      "| Code | Severity | When |",
      "|------|----------|------|",
      "| `blocking-in-head` | error | a blocking script in head |",
      "| `could-defer` | info | b |",
      "### Compression-Audit",
      "| `uncompressed` | warning | c |",
      "## Guidelines for Agents",
      "| `after` | x |",
    ].join("\n");
    expect(catalogOf(markdown)).toEqual(
      new Map([
        ["Script-Loading", new Set(["blocking-in-head", "could-defer"])],
        ["Compression-Audit", new Set(["uncompressed"])],
      ])
    );
  });
});

describe("the catalog of issue codes", () => {
  const catalog = readCatalog();
  const snippets = listSnippets();
  const byName = new Map(snippets.map((name) => [name.split("/").pop(), name]));

  it("documents only snippets that exist", () => {
    expect([...catalog.keys()].filter((name) => !byName.has(name))).toEqual([]);
  });

  it.each(snippets)("%s: its codes match its table", (name) => {
    const source = loadSnippet(name);
    const { codes, nonLiteral } = codesInSource(source);
    const documented = catalog.get(name.split("/").pop());
    // A snippet returns issues when it builds objects with a severity and says issues; LongTask rates its
    // tasks with a severity of their own and returns no issues
    const emitsIssues = /\bseverity:/.test(source) && /\bissues\b/.test(source);
    if (PENDING_ISSUE_CODES.includes(name)) {
      // Pending: no codes yet. Once it has them, it leaves PENDING_ISSUE_CODES
      expect({ codes: [...codes], documented: documented ? [...documented] : null }).toEqual({ codes: [], documented: null });
      return;
    }
    expect(nonLiteral).toBe(0);
    expect([...codes].filter((code) => !ISSUE_CODE.test(code))).toEqual([]);
    if (!emitsIssues) {
      expect(documented ?? null).toBeNull();
      return;
    }
    expect(documented, `a table for ${name} under "## Issue codes" in snippets/SCHEMA.md`).toBeDefined();
    expect([...codes].sort()).toEqual([...documented].sort());
  });
});
