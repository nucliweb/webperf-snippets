"use client";

import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";

hljs.registerLanguage("javascript", javascript);

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

export function Snippet({ code, prompt }) {
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const highlighted = useMemo(() => hljs.highlight(code, { language: "javascript" }).value, [code]);

  async function handleCopy() {
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyPrompt() {
    await copyText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  return (
    <div
      className="wp-snippet"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {prompt ? (
        <div className="wp-snippet-toolbar">
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="wp-snippet-prompt"
            title="Copy a prompt that asks an AI agent to run this snippet with the webperf-snippets CLI"
          >
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
            {promptCopied ? "Prompt copied" : "Copy prompt"}
          </button>
          <span className="wp-sr-only" aria-live="polite">
            {promptCopied ? "Prompt copied to the clipboard" : ""}
          </span>
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
        <div
          className="wp-snippet-actions"
          style={{ opacity: hovered || copied ? 1 : 0 }}
        >
          <button
            onClick={handleCopy}
            aria-label="Copy code"
            className="wp-snippet-copy"
          >
            {copied ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
