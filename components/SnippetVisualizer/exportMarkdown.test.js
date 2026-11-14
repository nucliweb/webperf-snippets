import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { exportMarkdown } from "./exportMarkdown";

const dir = new URL("../../scripts/fixtures/results/", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, dir), "utf8"));
const fixture = (name) => read(`seeded-${name}.json`);

describe("exportMarkdown", () => {
  it("exports an audit that has a rating and no value as an audit", () => {
    const md = exportMarkdown(fixture("Script-Loading"));
    expect(md).not.toContain("undefined");
    expect(md).toContain("### Items (3)");
    expect(md).toContain("third.js");
  });

  it("exports a score that has a rating and no value without failing", () => {
    const md = exportMarkdown({ script: "Demo", status: "ok", unit: "score", rating: "good", issues: [] });
    expect(md).toContain("## Demo");
    expect(md).not.toContain("undefined");
  });

  it("exports a metric with its value and its rating", () => {
    // The icon of the rating sits between the value and the rating
    expect(exportMarkdown(fixture("CLS"))).toMatch(/^## CLS — 0\.0638 \S+ good$/);
  });

  it("exports a result with neither issues nor items as its JSON, as the page shows it", () => {
    const result = { script: "Demo", status: "ok", details: { count: 2 } };
    const md = exportMarkdown(result);
    expect(md).toContain("```json\n" + JSON.stringify(result, null, 2) + "\n```");
    expect(md).not.toContain("No issues found");
  });

  it.each(readdirSync(dir).filter((file) => file.endsWith(".json")))("exports %s with every value defined", (file) => {
    expect(exportMarkdown(read(file))).not.toMatch(/\bundefined\b|\bNaN\b/);
  });
});
