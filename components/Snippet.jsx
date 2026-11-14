import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import { CopyCodeButton, CopyPromptButton } from "./SnippetActions";

hljs.registerLanguage("javascript", javascript);

// A snippet on its page: the prompt for an agent, the code and its copy button. It renders on the
// server, so the code arrives highlighted and highlight.js never reaches the browser; only the buttons
// (components/SnippetActions.jsx) run there. The copy button shows on hover or keyboard focus, in CSS.

export function SnippetExample({ example }) {
  if (!example) return null;

  return (
    <section className="wp-snippet-example" aria-label="Returned object example">
      <p>Captured from the seeded test page; timing values can vary between runs.</p>
      <pre>
        <code>{JSON.stringify(example, null, 2)}</code>
      </pre>
    </section>
  );
}

// snippet: the path of the snippet, such as "CoreWebVitals/LCP", which lib/remark-snippet-prompt.mjs adds
export function Snippet({ code, prompt, snippet, example }) {
  if (!code) return <SnippetExample example={example} />;
  const highlighted = hljs.highlight(code, { language: "javascript" }).value;

  return (
    <div className="wp-snippet">
      {prompt ? (
        <div className="wp-snippet-agent">
          <p>
            <strong>Run it from an AI agent:</strong> the prompt uses the CLI to measure any URL and report the result.
          </p>
          <CopyPromptButton prompt={prompt} snippet={snippet} />
        </div>
      ) : null}
      <div className="wp-snippet-code">
        <pre data-language="js" data-theme="default">
          <code
            data-language="js"
            data-theme="default"
            className="hljs"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
        <div className="wp-snippet-actions">
          <CopyCodeButton snippet={snippet} />
        </div>
      </div>
      {example ? <SnippetExample example={example} /> : null}
    </div>
  );
}
