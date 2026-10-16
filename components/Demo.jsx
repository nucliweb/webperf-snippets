"use client";

import { useEffect, useRef, useState } from "react";
import heights from "./demo-heights.json";

// Extra pixels added to the height the demo reports, so the iframe has a little
// breathing room and never shows an inner scrollbar from sub-pixel rounding.
const HEIGHT_PADDING = 24;

// Height reserved for a demo missing from demo-heights.json (`npm run test:demos` fails then).
const FALLBACK_HEIGHT = 400;

function reservedHeight(src, column) {
  const entry = heights[src.split("/").pop()];
  return entry ? `${entry[column] + HEIGHT_PADDING}px` : `${FALLBACK_HEIGHT}px`;
}

/**
 * Embeds a self-contained interactive demo (a static HTML file under
 * `public/demos/`) inside an iframe. Before the demo loads, the iframe reserves the
 * height measured for it in `demo-heights.json` (one value for a narrow column and
 * one for a wide one, picked in CSS), so the page does not shift. The demo reports
 * its own content height via `postMessage({ demoHeight: number })`, so the iframe
 * follows it when the content changes, without an inner scrollbar. Theme
 * (light/dark/system) syncs automatically: the demo reads `localStorage.theme`,
 * which the site also writes, and both share the same origin. See
 * `public/demos/README.md` for the full authoring contract.
 */
export function Demo({ src, title, caption }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    function show(value) {
      if (typeof value === "number" && value > 0) setHeight(value + HEIGHT_PADDING);
    }
    function handleMessage(event) {
      if (event.source !== iframe?.contentWindow) return;
      show(event.data?.demoHeight);
    }
    // A demo that loaded before this effect ran posted its height to no one; it is on
    // the same origin, so read the height from its document instead.
    function readHeight() {
      try {
        const doc = iframe?.contentDocument;
        if (doc && doc.URL !== "about:blank" && doc.readyState === "complete") show(doc.body?.offsetHeight);
      } catch {
        // A document from another origin cannot be read; its message is the only source.
      }
    }
    window.addEventListener("message", handleMessage);
    iframe?.addEventListener("load", readHeight);
    readHeight();
    return () => {
      window.removeEventListener("message", handleMessage);
      iframe?.removeEventListener("load", readHeight);
    };
  }, []);

  return (
    <figure className="wp-demo">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        loading="lazy"
        style={{
          "--wp-demo-h-mobile": reservedHeight(src, "mobile"),
          "--wp-demo-h-desktop": reservedHeight(src, "desktop"),
          height: height ? `${height}px` : undefined,
        }}
      />
      <figcaption>
        {caption ? <span>{caption} </span> : null}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open demo in a new tab ↗
        </a>
      </figcaption>
    </figure>
  );
}
