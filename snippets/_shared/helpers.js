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
