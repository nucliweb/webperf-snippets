// Extra request headers, for pages behind an access proxy that reads a token from each request.
// They go only to the origin of the measured URL: sent to every origin, as Playwright's
// extraHTTPHeaders does, they would hand the token to third parties, and a custom header on a
// cross-origin fetch needs a CORS preflight that most third parties do not answer.
//
// The Fetch domain of CDP pauses only the requests that match the pattern, inside the browser,
// so third-party requests are not intercepted and keep their timings. Each request to the origin
// waits for the round trip to Node, which adds a few milliseconds to its timing.

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// "Name: value" as given to --header, or null when it is not a valid header
export function parseHeader(raw) {
  const colon = raw.indexOf(":");
  if (colon === -1) return null;
  const name = raw.slice(0, colon).trim();
  if (!HEADER_NAME.test(name)) return null;
  return [name, raw.slice(colon + 1).trim()];
}

export async function sendHeadersToOrigin(context, page, url, headers) {
  if (!headers || Object.keys(headers).length === 0) return;
  const extra = Object.entries(headers);
  const replaced = new Set(extra.map(([name]) => name.toLowerCase()));
  const cdp = await context.newCDPSession(page);
  cdp.on("Fetch.requestPaused", ({ requestId, request }) => {
    const kept = Object.entries(request.headers).filter(([name]) => !replaced.has(name.toLowerCase()));
    const all = [...kept, ...extra].map(([name, value]) => ({ name, value }));
    // The request is gone when the page navigates away while it is paused
    cdp.send("Fetch.continueRequest", { requestId, headers: all }).catch(() => {});
  });
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: `${new URL(url).origin}/*`, requestStage: "Request" }],
  });
}
