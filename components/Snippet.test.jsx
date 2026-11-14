import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Snippet, SnippetExample } from "./Snippet";

const CODE = "(() => ({ script: 'Demo', status: 'ok' }))()";
const PROMPT = "# Run the Demo snippet with webperf-snippets\n\nRun this measurement with the CLI.";

describe("Snippet", () => {
  it("shows a visible Copy prompt to measure button when the snippet has a prompt", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    // It says what the prompt is for: to measure, not to fix, which only the extension can offer
    expect(html).toMatch(/<button[^>]*class="wp-snippet-prompt"[^>]*>.*?Copy prompt to measure<\/button>/);
  });

  it("explains in a visible sentence what the prompt is for", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(
      /<div class="wp-snippet-agent">.*Run it from an AI agent:.*the prompt uses the CLI to measure any URL and report the result\..*<button/
    );
  });

  it("has a live region that announces the copy", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(/<span[^>]*aria-live="polite"[^>]*>/);
  });

  it("shows no Copy prompt button when the snippet has no prompt", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    expect(html).not.toMatch(/Copy prompt/);
  });

  it("renders a captured return object without an internal heading so the page heading owns the TOC entry", () => {
    const example = { script: "Demo", status: "ok", value: 42 };
    const html = renderToStaticMarkup(<SnippetExample example={example} />);
    expect(html).toContain('<section class="wp-snippet-example" aria-label="Returned object example">');
    expect(html).not.toContain("<h3");
    expect(html).toContain('&quot;value&quot;: 42');
  });

  it("does not render an example section when no captured object is provided", () => {
    expect(renderToStaticMarkup(<SnippetExample />)).toBe("");
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    expect(html).not.toContain("wp-snippet-example");
  });

  it("keeps the Copy code button", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(/aria-label="Copy code"/);
  });

  it("highlights the code in the HTML it renders, so the browser runs no highlighter", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    expect(html).toMatch(/<code[^>]*class="hljs"[^>]*>.*<span class="hljs-string">&#x27;Demo&#x27;<\/span>/);
  });

  // The Copy code button copies the text of the rendered code, so that text has to be the source as is
  it("renders code whose text is the source, characters that need escaping included", () => {
    const source = 'if (a < b && c > d) console.log("<script>", `${a}`);\n';
    const html = renderToStaticMarkup(<Snippet code={source} />);
    const inner = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)[1];
    const text = inner
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&");
    expect(text).toBe(source);
  });
});
