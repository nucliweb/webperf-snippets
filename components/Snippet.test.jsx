import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Snippet } from "./Snippet";

const CSS = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8");
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

  it("keeps the Copy code button", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(/aria-label="Copy code"/);
  });

  it("gives the Copy code button its type, and hides its icons from a screen reader", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    const button = html.match(/<button[^>]*class="wp-snippet-copy"[^>]*>.*?<\/button>/)[0];
    expect(button).toMatch(/^<button type="button"/);
    expect(button).toMatch(/<svg[^>]* aria-hidden="true"/);
  });

  it("has a live region that announces the copy of the code", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    expect(html).toMatch(/<div class="wp-snippet-actions">.*<span class="wp-sr-only" aria-live="polite"><\/span><\/div>/);
  });

  it("shows the Copy code button where there is no hover to reveal it, as on a touch screen", () => {
    expect(CSS).toMatch(/@media \(hover: none\) \{\s*\.wp-snippet-actions \{\s*opacity: 1;/);
  });

  it("does not animate its buttons for a visitor who asks for less motion", () => {
    const reduced = CSS.match(/@media \(prefers-reduced-motion: reduce\) \{[^@]*/g).join("\n");
    for (const selector of [".wp-snippet-actions", ".wp-snippet-copy", ".wp-snippet-prompt"]) expect(reduced).toContain(selector);
  });

  it("lets the keyboard reach the code, which scrolls sideways when its lines are long", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} />);
    expect(html).toMatch(/<code[^>]* tabindex="0"/);
    expect(CSS).toMatch(/\.wp-snippet pre code:focus-visible \{\s*outline:/);
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
