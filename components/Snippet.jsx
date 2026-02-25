import { useState, useMemo } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";

hljs.registerLanguage("javascript", javascript);

export function Snippet({ code }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const highlighted = useMemo(() => hljs.highlight(code, { language: "javascript" }).value, [code]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement("textarea");
      el.value = code;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="nextra-code-block nx-relative nx-mt-6 first:nx-mt-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <pre
        data-language="js"
        data-theme="default"
        className="nx-bg-primary-700/5 nx-mb-4 nx-overflow-x-auto nx-rounded-xl nx-subpixel-antialiased dark:nx-bg-primary-300/10 nx-text-[13px] contrast-more:nx-border contrast-more:nx-border-primary-900/20 contrast-more:nx-contrast-150 contrast-more:dark:nx-border-primary-100/40"
      >
        <code
          data-language="js"
          data-theme="default"
          className="hljs nx-border-black nx-border-opacity-[0.04] nx-bg-opacity-[0.03] nx-bg-black nx-break-words nx-rounded-md nx-border dark:nx-border-white/10 dark:nx-bg-white/10 nx-py-4 nx-px-4"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
      <div
        className="nx-transition nx-flex nx-gap-1 nx-absolute nx-m-[11px] nx-right-0 nx-top-0"
        style={{ opacity: hovered || copied ? 1 : 0 }}
      >
        <button
          onClick={handleCopy}
          aria-label="Copy code"
          className="nextra-button nx-transition-all active:nx-opacity-50 nx-bg-primary-700/5 nx-border nx-border-black/5 nx-text-gray-600 hover:nx-text-gray-900 nx-rounded-md nx-p-1.5 dark:nx-bg-gray-100/5 dark:nx-border-white/10 dark:nx-text-gray-400 dark:hover:nx-text-gray-50"
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
  );
}
