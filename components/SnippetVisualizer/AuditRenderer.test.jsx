import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditRenderer } from "./AuditRenderer";
import { SnippetVisualizer, detectRenderer } from "./index";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../scripts/fixtures/results/seeded-${name}.json`, import.meta.url), "utf8"));
const render = (result) => renderToStaticMarkup(<AuditRenderer result={result} />);
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("AuditRenderer", () => {
  it("titles the table of a snippet and labels its columns from the view", () => {
    const html = render(fixture("Find-render-blocking-resources"));
    expect(text(html)).toContain("Render-blocking resources");
    expect(html).toMatch(/<th[^>]*>File<\/th>/);
    expect(html).not.toMatch(/<th[^>]*>shortName<\/th>/);
  });

  it("reads a field with a phrase as a sentence, and the others with their label and format", () => {
    const out = text(render(fixture("Find-render-blocking-resources")));
    expect(out).toContain("Rendering blocked until 8 ms");
    expect(out).toContain("Total size 314 B");
    expect(out).toContain("script 1 · link 1");
  });

  it("shows the columns with the same value in every row as a line above the table", () => {
    const out = text(render(fixture("Find-render-blocking-resources")));
    expect(out).toContain("Response end 8 ms · Duration 5 ms");
  });

  it("leads from an issue to its row, which shows a dot of its severity", () => {
    const html = render(fixture("Oversized-Images"));
    expect(html).toMatch(/<a [^>]*href="#wp-viz-row-0"[^>]*>hero\.png: 100x100 file for a 600x400 slot/);
    expect(html).toMatch(/<tr id="wp-viz-row-0"[^>]*>.*?wp-viz-dot-warning/);
  });

  it("shows a URL by its file, with the whole URL as its title", () => {
    const html = render(fixture("Oversized-Images"));
    expect(html).toMatch(/<span[^>]*title="http:\/\/127\.0\.0\.1:\d+\/[^"]*hero\.png"[^>]*>hero\.png<\/span>/);
  });

  it("lists the recommendations of a result", () => {
    const html = render(fixture("Cache-Strategy-Analysis"));
    expect(html).toMatch(/<ol[^>]*>\s*<li>Add Cache-Control headers to static assets/);
  });

  it("says what to do when a snippet that records has nothing yet", () => {
    const out = text(render({ script: "Interactions", status: "tracking", getDataFn: "getInteractions", message: "Call getInteractions()", items: [] }));
    expect(out).toContain("Nothing recorded yet. Use the page, then read the result.");
    expect(out).not.toContain("Call getInteractions()");
  });

  it("escapes the values of the page", () => {
    const html = render({ script: "Demo", status: "ok", issues: [], items: [{ name: "<script>alert(1)</script>" }] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("detectRenderer", () => {
  it("sends a result with a rating but no value to the audit view", () => {
    expect(detectRenderer(fixture("Script-Loading"))).toBe("audit");
  });

  it("keeps a metric with its value and rating in the metric view", () => {
    expect(detectRenderer(fixture("LCP"))).toBe("cwv");
  });
});

describe("SnippetVisualizer", () => {
  it("renders without a result", () => {
    expect(renderToStaticMarkup(<SnippetVisualizer />)).toContain("<textarea");
  });
});
