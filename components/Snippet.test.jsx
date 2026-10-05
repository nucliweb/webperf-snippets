import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Snippet } from "./Snippet";

const CODE = "(() => ({ script: 'Demo', status: 'ok' }))()";
const PROMPT = "# Run the Demo snippet with webperf-snippets\n\nRun this measurement with the CLI.";

describe("Snippet", () => {
  it("shows a visible Copy prompt button when the snippet has a prompt", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(/<button[^>]*class="wp-snippet-prompt"[^>]*>.*?Copy prompt<\/button>/);
  });

  it("explains what the prompt is for to screen readers and on hover", () => {
    const html = renderToStaticMarkup(<Snippet code={CODE} prompt={PROMPT} />);
    expect(html).toMatch(/title="Copy a prompt that asks an AI agent to run this snippet with the webperf-snippets CLI"/);
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
});
