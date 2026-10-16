"use client";

import { useState } from "react";
import { trackEvent } from "../lib/analytics";

// The buttons of a snippet, the only part of components/Snippet.jsx that runs in the browser. The
// code is highlighted on the server, so the Copy code button reads its text from the page instead of
// receiving the code as a prop, which would send it a second time in the payload of the page.

// Copies text, with a fallback for browsers that block the Clipboard API
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

// true for two seconds after each call to show()
function useFlag() {
  const [on, setOn] = useState(false);
  const show = () => {
    setOn(true);
    setTimeout(() => setOn(false), 2000);
  };
  return [on, show];
}

// snippet: the path of the snippet, such as "CoreWebVitals/LCP", which names it in the analytics events
export function CopyPromptButton({ prompt, snippet }) {
  const [copied, showCopied] = useFlag();

  async function handleCopy() {
    await copyText(prompt);
    trackEvent("copy_prompt", { snippet });
    showCopied();
  }

  return (
    <>
      <button type="button" onClick={handleCopy} className="wp-snippet-prompt">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        {copied ? "Prompt copied" : "Copy prompt"}
      </button>
      <span className="wp-sr-only" aria-live="polite">
        {copied ? "Prompt copied to the clipboard" : ""}
      </span>
    </>
  );
}

export function CopyCodeButton({ snippet }) {
  const [copied, showCopied] = useFlag();

  async function handleCopy(event) {
    const code = event.currentTarget.closest(".wp-snippet-code").querySelector("code");
    await copyText(code.textContent);
    trackEvent("copy_snippet", { snippet });
    showCopied();
  }

  return (
    <button onClick={handleCopy} aria-label="Copy code" className="wp-snippet-copy" data-copied={copied || undefined}>
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
