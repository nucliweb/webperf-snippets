"use client";

import { useState, useCallback } from "react";
import { CWVRenderer } from "./CWVRenderer";
import { FontsRenderer } from "./FontsRenderer";
import { AuditRenderer } from "./AuditRenderer";
import { Icon } from "../Icon";
import { exportMarkdown } from "./exportMarkdown";

const PLACEHOLDER = `Paste the return value of any snippet here.

In DevTools, after running a snippet, right-click the result object
and choose "Copy object", then paste it here.

Or run: JSON.stringify(result) and paste the output.`;

function detectRenderer(result) {
  if (result.script === "Fonts-Preloaded-Loaded-and-used-above-the-fold") return "fonts";
  if (result.rating != null) return "cwv";
  if (Array.isArray(result.issues) || Array.isArray(result.items)) return "audit";
  return "raw";
}

function parseInput(text) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      'Invalid JSON. In DevTools: right-click the result → "Copy object", or run JSON.stringify(result).',
    );
  }
}

export function SnippetVisualizer() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [result, setResult] = useState(null);

  const handleReset = useCallback(() => {
    setInput("");
    setResult(null);
    setParseError(null);
    setCopied(false);
  }, []);

  const handleChange = useCallback((e) => {
    const text = e.target.value;
    setInput(text);

    if (!text.trim()) {
      setResult(null);
      setParseError(null);
      return;
    }

    try {
      setResult(parseInput(text));
      setParseError(null);
    } catch (err) {
      setResult(null);
      setParseError(err.message);
    }
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    if (!result) return;
    const md = exportMarkdown(result);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      const el = document.createElement("textarea");
      el.value = md;
      el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const rendererType = result ? detectRenderer(result) : null;

  return (
    <div style={{ maxWidth: "800px" }}>
      <div style={{ marginBottom: "24px" }}>
        <textarea
          value={input}
          onChange={handleChange}
          placeholder={PLACEHOLDER}
          rows={8}
          spellCheck={false}
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "12px",
            borderRadius: "8px",
            border: `1px solid ${parseError ? "#ef4444" : "rgba(128,128,128,0.3)"}`,
            background: "rgba(128,128,128,0.05)",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
            color: "inherit",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "6px",
            minHeight: "20px",
          }}
        >
          {parseError ? (
            <div style={{ color: "#ef4444", fontSize: "0.8rem" }}><Icon emoji="✗" />{parseError}</div>
          ) : (
            <span />
          )}
          {input && (
            <button
              onClick={handleReset}
              style={{
                fontSize: "0.8rem",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "transparent",
                color: "#6b7280",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {result && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <span style={{ color: "#6b7280", fontSize: "0.8rem", fontFamily: "monospace" }}>
              {result.script ?? "unknown"}
            </span>
            <button
              onClick={handleCopyMarkdown}
              style={{
                fontSize: "0.8rem",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: copied ? "#22c55e" : "rgba(128,128,128,0.08)",
                color: copied ? "#fff" : "inherit",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {copied ? <><Icon emoji="✓" style={{ color: "#fff" }} />Copied!</> : "Copy as Markdown"}
            </button>
          </div>

          <div
            style={{
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.15)",
              padding: "20px",
            }}
          >
            {rendererType === "cwv" && <CWVRenderer result={result} />}
            {rendererType === "fonts" && <FontsRenderer result={result} />}
            {rendererType === "audit" && <AuditRenderer result={result} />}
            {rendererType === "raw" && (
              <pre style={{ fontSize: "0.75rem", overflow: "auto", margin: 0 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
