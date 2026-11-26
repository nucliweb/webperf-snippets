/* eslint-disable no-unused-vars */
// Canonical source of the helpers that several snippets copy.
//
// Snippets run pasted into the DevTools console, so they cannot import anything. Each snippet
// that needs a helper carries a copy of it between the same two markers:
//
//   // @shared <name>
//   ...
//   // @end-shared <name>
//
// `npm run check:consistency` fails when a copy differs from the block below (indentation is
// ignored). Edit the block here first, then paste it into every snippet that carries the marker.

// @shared getRootDomain
function getRootDomain(hostname) {
  const host = hostname.replace(/\.$/, "");
  // An IP address has no registrable domain, so each address is its own root
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  // Country-code domains with a second-level suffix: example.co.uk, example.com.au, example.ac.jp
  const secondLevelSuffixes = ["ac", "co", "com", "edu", "go", "gob", "gouv", "gov", "govt", "mil", "ne", "net", "nom", "or", "org", "sch"];
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && secondLevelSuffixes.includes(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}
// @end-shared getRootDomain

// Declared at the top of each snippet that carries isFirstParty: the domains of the site that
// differ from the page's root domain, such as its own CDN. They count as first party.
const OWN_DOMAINS = [];

// @shared isFirstParty
function isFirstParty(hostname) {
  const root = getRootDomain(hostname);
  if (root === getRootDomain(location.hostname)) return true;
  return OWN_DOMAINS.some((d) => getRootDomain(String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0]) === root);
}
// @end-shared isFirstParty

// @shared logOwnDomainsHint
function logOwnDomainsHint(thirdPartyCount) {
  if (OWN_DOMAINS.length === 0 && thirdPartyCount > 0) {
    console.log(
      '%cℹ️ OWN_DOMAINS is empty. If this site serves its own assets from other domains (for example a CDN), add them at the top of the snippet, such as const OWN_DOMAINS = ["cdn.example.net"];, and run it again so they count as first party.',
      "color: #3b82f6;"
    );
  }
}
// @end-shared logOwnDomainsHint

// @shared formatBytes
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}
// @end-shared formatBytes

// @shared ownRequestUrl
// The URL a snippet requests when it reads a file of the page itself (fetch, a HEAD request,
// new Image()). The fragment never reaches the server or the HTTP cache key, so the file still
// comes from the cache, but it stays in the name of the Resource Timing entry of the request,
// which is how isOwnRequest leaves these requests out of what the page loaded.
function ownRequestUrl(url) {
  try {
    const parsed = new URL(url, location.href);
    if (!/^https?:$/.test(parsed.protocol)) return url;
    parsed.hash = "webperf-snippets";
    return parsed.href;
  } catch {
    return url;
  }
}
// @end-shared ownRequestUrl

// @shared parseLinkHeader
// The hints of a Link header: `<url>; rel=preconnect; crossorigin, </font.woff2>; rel="preload"; as=font`.
// A comma or a semicolon inside <...> or quotes does not split, a rel with several tokens gives one
// hint per token, and URLs resolve against the page. crossorigin is read as the crossOrigin property
// of a <link> reads it: "" when missing, "use-credentials", or "anonymous" for any other value.
function parseLinkHeader(value) {
  const parts = [];
  let current = "";
  let inUrl = false;
  let inQuote = false;
  for (const ch of value || "") {
    if (ch === "<" && !inQuote) inUrl = true;
    else if (ch === ">" && !inQuote) inUrl = false;
    else if (ch === '"' && !inUrl) inQuote = !inQuote;
    if (ch === "," && !inUrl && !inQuote) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);

  const hints = [];
  for (const part of parts) {
    const match = part.match(/^\s*<([^>]*)>([\s\S]*)$/);
    if (!match) continue;
    const params = {};
    for (const param of match[2].split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const [rawKey, ...rest] = param.split("=");
      const key = rawKey.trim().toLowerCase();
      if (key && !(key in params)) params[key] = rest.join("=").trim().replace(/^"([\s\S]*)"$/, "$1");
    }
    let href;
    try {
      href = new URL(match[1].trim(), location.href).href;
    } catch {
      continue;
    }
    const crossorigin = !("crossorigin" in params)
      ? ""
      : params.crossorigin.toLowerCase() === "use-credentials" ? "use-credentials" : "anonymous";
    for (const rel of (params.rel || "").toLowerCase().split(/\s+/).filter(Boolean)) {
      hints.push({ rel, href, as: params.as || "", crossorigin, fetchpriority: params.fetchpriority || "", type: params.type || "", media: params.media || "" });
    }
  }
  return hints;
}
// @end-shared parseLinkHeader

// @shared readHeaderHints
// The hints of the Link header of the document. The page cannot read the headers of its own
// navigation, so it asks for them again with a HEAD request; null when that request fails.
async function readHeaderHints() {
  try {
    const response = await fetch(ownRequestUrl(location.href), { method: "HEAD", credentials: "include" });
    if (!response.ok) return null;
    return parseLinkHeader(response.headers.get("link"));
  } catch {
    return null;
  }
}
// @end-shared readHeaderHints

// @shared isOwnRequest
// True for the Resource Timing entry of a request a snippet made with ownRequestUrl: the page
// did not make it, so no snippet counts it.
function isOwnRequest(entry) {
  return entry.name.endsWith("#webperf-snippets");
}
// @end-shared isOwnRequest

// @shared createInteractionTracker
// Groups Event Timing entries by interactionId across observer callbacks, since the entries of one
// interaction (pointerdown, pointerup, click; keydown, keyup) can arrive in separate batches. Each
// interaction is measured over its entries painted in the frame of its longest one: Chrome rounds
// durations to 8 ms, and an event painted in an earlier frame, such as the keydown of a key held
// down, has its own timing. It is reported under the event whose handler ran longest, or under the
// click or keydown when no handler took a millisecond more than theirs.
function createInteractionTracker() {
  const byId = new Map();
  const processing = (e) => e.processingEnd - e.processingStart;
  const measure = (id, entries) => {
    const longest = entries.reduce((a, b) => (b.duration > a.duration ? b : a));
    const paint = longest.startTime + longest.duration;
    const frame = entries.filter((e) => Math.abs(e.startTime + e.duration - paint) <= 8);
    const startTime = Math.min(...frame.map((e) => e.startTime));
    const processingStart = Math.min(...frame.map((e) => e.processingStart));
    const processingEnd = Math.max(...frame.map((e) => e.processingEnd));
    const busiest = frame.reduce((a, b) => (processing(b) > processing(a) ? b : a));
    const primary = frame.find((e) => e.name === "click" || e.name === "keydown");
    const reported = primary && processing(busiest) - processing(primary) < 1 ? primary : busiest;
    return {
      interactionId: id,
      name: reported.name,
      target: reported.target ?? frame.find((e) => e.target)?.target ?? null,
      startTime,
      duration: longest.duration,
      phases: {
        inputDelay: processingStart - startTime,
        processingTime: processingEnd - processingStart,
        presentationDelay: Math.max(0, startTime + longest.duration - processingEnd),
      },
    };
  };
  return {
    // Adds the entries of one observer callback and returns the interactions they changed
    add(entries) {
      const changed = new Set();
      for (const e of entries) {
        if (!e.interactionId) continue;
        const record = byId.get(e.interactionId) ?? { entries: [] };
        record.entries.push({
          name: e.name,
          target: e.target,
          startTime: e.startTime,
          duration: e.duration,
          processingStart: e.processingStart,
          processingEnd: e.processingEnd,
        });
        byId.set(e.interactionId, record);
        changed.add(e.interactionId);
      }
      return [...changed].map((id) => {
        const record = byId.get(id);
        record.summary = measure(id, record.entries);
        return record.summary;
      });
    },
    list() {
      return [...byId.values()].map((record) => record.summary);
    },
  };
}
// @end-shared createInteractionTracker

// @shared uniqueSelector
// A CSS selector that matches only el in its document (or shadow root): its id when it is unique,
// otherwise a path of tag, classes and :nth-of-type() that goes up to the nearest ancestor with a
// unique id, or to the root, and stops as soon as it matches one element.
function uniqueSelector(el) {
  const root = el.getRootNode();
  const matchesOne = (selector) => {
    try {
      return root.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1) {
    if (node.id && matchesOne(`#${window.CSS.escape(node.id)}`)) {
      parts.unshift(`#${window.CSS.escape(node.id)}`);
      break;
    }
    const tag = node.localName;
    let part = tag + Array.from(node.classList).slice(0, 2).map((c) => `.${window.CSS.escape(c)}`).join("");
    const siblings = node.parentNode ? Array.from(node.parentNode.children) : [node];
    if (siblings.filter((s) => s.matches(part)).length > 1) {
      part += `:nth-of-type(${siblings.filter((s) => s.localName === tag).indexOf(node) + 1})`;
    }
    parts.unshift(part);
    if (matchesOne(parts.join(" > "))) break;
    node = node.parentElement;
  }
  return parts.join(" > ");
}
// @end-shared uniqueSelector

// @shared supportsRenderBlockingStatus
// renderBlockingStatus (Resource Timing) is Chromium-only (Chrome 107+). Without it, which
// resources block rendering is unknown: a snippet reports that, not "none".
function supportsRenderBlockingStatus() {
  return !!window.PerformanceResourceTiming && "renderBlockingStatus" in window.PerformanceResourceTiming.prototype;
}
// @end-shared supportsRenderBlockingStatus

// @shared isInViewport
// Whether el has a size and some of it is inside the viewport
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}
// @end-shared isInViewport

// @shared normalizeUrl
// The absolute URL of url, relative to the page, to compare it with the URL of an entry
function normalizeUrl(url) {
  try {
    return new URL(url, location.origin).href;
  } catch {
    return url;
  }
}
// @end-shared normalizeUrl

// @shared urlLabel
// A URL short enough for the console: the file name, with the host when it is another one
function urlLabel(url) {
  if (url.startsWith("data:")) return `${url.split(",")[0]},…`;
  try {
    const u = new URL(url);
    const file = u.pathname.split("/").pop()?.split("?")[0];
    return u.hostname !== location.hostname ? `${u.hostname}/…/${file}` : file || url;
  } catch {
    return url;
  }
}
// @end-shared urlLabel

// @shared detectFormat
// The image format of a URL: from the transformations of a CDN, the query or the extension.
// "auto (cdn)" when a CDN picks it, "auto (cdn?)" when the URL has no extension, as a CDN or a
// DAM that serves the format the browser accepts.
function detectFormat(url) {
  if (!url) return "unknown";
  const lower = url.toLowerCase();
  const path = lower.split("?")[0];
  const query = lower.includes("?") ? lower.split("?")[1] : "";

  // Cloudinary path transforms: /f_auto/, /f_avif,q_auto/, etc.
  const cloudinaryMatch = path.match(/\/f_(auto|avif|webp|jxl|png|jpg|jpeg|gif|svg)[,/]/);
  if (cloudinaryMatch) {
    const fmt = cloudinaryMatch[1];
    return fmt === "auto" ? "auto (cdn)" : fmt === "jpeg" ? "jpg" : fmt;
  }

  // Query string params: ?fm=webp (imgix), ?format=avif (generic)
  const qMatch = query.match(/(?:^|&)(?:fm|format)=(avif|webp|jxl|png|jpg|jpeg|gif|svg)(?:&|$)/);
  if (qMatch) return qMatch[1] === "jpeg" ? "jpg" : qMatch[1];

  // File extension in path
  const extMatch = path.match(/\.(avif|webp|jxl|png|gif|svg|jpg|jpeg)(?:[?#]|$)/);
  if (extMatch) return extMatch[1] === "jpeg" ? "jpg" : extMatch[1];

  // No extension at all: likely a DAM or CDN serving format via Accept header
  const lastSegment = path.split("/").pop() || "";
  if (!lastSegment.includes(".")) return "auto (cdn?)";

  return "unknown";
}
// @end-shared detectFormat

// @shared hiddenBefore
// Whether the page was hidden before `time`, a startTime: it loaded in a background tab, or the user
// switched to another tab before it painted. A paint nobody saw is not the metric, and web-vitals does
// not report it. The first visibility-state entry "hidden" says when, as in web-vitals: a prerendered
// page is hidden until its activation, so only an entry from the activation on counts. Without one, the
// page was hidden from its start only if it is hidden now.
function hiddenBefore(time) {
  if (PerformanceObserver.supportedEntryTypes?.includes("visibility-state") && !document.prerendering) {
    const activationStart = performance.getEntriesByType("navigation")[0]?.activationStart || 0;
    const hidden = performance
      .getEntriesByType("visibility-state")
      .find((entry) => entry.name === "hidden" && entry.startTime >= activationStart);
    if (hidden) return hidden.startTime <= time;
  }
  return document.visibilityState === "hidden" && !document.prerendering;
}

// Why a snippet gives no value for a metric the page painted while it was hidden
function hiddenMessage(metric) {
  return `The page was hidden before its ${metric} was painted, as when it loads in a background tab or the user switches to another tab before it paints, so the ${metric} is not what a user saw and web-vitals does not report it. Reload the page with its tab in front and run the snippet again.`;
}

// The result of a snippet whose metric the page painted while it was hidden: hiddenBeforePaint tells the
// reports that it measured nothing, and that neither the snippet nor the page failed
function hiddenResult(name, metric) {
  return { script: name, status: "error", hiddenBeforePaint: true, error: hiddenMessage(metric) };
}

// The warning of the console, once however many times the page paints while it is hidden
let hiddenWarned = false;
function warnHidden(metric) {
  if (!hiddenWarned) console.warn(`⚠️ ${hiddenMessage(metric)}`);
  hiddenWarned = true;
}
// @end-shared hiddenBefore
