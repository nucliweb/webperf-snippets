import { describe, it, expect } from "vitest";
import { FAIL_ON, failingIssues, parseFailOn } from "../../src/blocking.js";

// What makes the command exit with 1, by --fail-on: the errors (the default), the errors and warnings,
// or nothing the snippets found. A follow-up of the decision tree only informs.
const results = [
  { id: "render-blocking", status: "ok", issues: [{ severity: "error", message: "2 render-blocking resources", code: "render-blocking" }, { severity: "info", message: "An info" }] },
  { id: "webfonts", status: "ok", issues: [{ severity: "warning", message: "A font for nothing" }] },
  { id: "dom-size", status: "error", error: "It failed" },
  { id: "LCP-Subparts", status: "ok", reason: "LCP is over 2.5 s", issues: [{ severity: "error", message: "A follow-up error" }, { severity: "warning", message: "A follow-up warning" }] },
  { id: "LCP", status: "ok", value: 900, rating: "good" },
];

describe("failingIssues", () => {
  it("with error, the default, counts a snippet that failed and the errors of the steps", () => {
    const expected = [
      { id: "render-blocking", message: "2 render-blocking resources", code: "render-blocking" },
      { id: "dom-size", message: "It failed" },
    ];
    expect(failingIssues(results, "error")).toEqual(expected);
    expect(failingIssues(results)).toEqual(expected);
  });

  it("with warning, counts the warnings of the steps too, and still not those of a follow-up", () => {
    expect(failingIssues(results, "warning").map((i) => [i.id, i.message])).toEqual([
      ["render-blocking", "2 render-blocking resources"],
      ["webfonts", "A font for nothing"],
      ["dom-size", "It failed"],
    ]);
  });

  it("with never, counts nothing", () => {
    expect(failingIssues(results, "never")).toEqual([]);
  });

  it("never counts an info", () => {
    const infos = [{ id: "content-visibility", status: "ok", issues: [{ severity: "info", message: "An info" }] }];
    for (const failOn of FAIL_ON) expect(failingIssues(infos, failOn)).toEqual([]);
  });
});

describe("parseFailOn", () => {
  it("takes error, warning or never, and error when it is not given", () => {
    expect(FAIL_ON).toEqual(["error", "warning", "never"]);
    for (const value of FAIL_ON) expect(parseFailOn(value)).toBe(value);
    expect(parseFailOn(undefined)).toBe("error");
  });

  it("rejects any other value, naming the ones it takes", () => {
    expect(() => parseFailOn("warnings")).toThrow('--fail-on must be error, warning or never, not "warnings"');
    expect(() => parseFailOn("")).toThrow("--fail-on must be error, warning or never");
  });
});
