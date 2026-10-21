import { randomUUID } from "node:crypto";

// A failure of a session tool the model can act on: an unknown or closed page, or too many open pages
export class SessionError extends Error {}

const duration = (ms) => (ms >= 60000 ? `${ms / 60000} minutes` : `${ms / 1000} seconds`);

// The pages an MCP connection keeps open between calls. They share one Chromium, launched with the
// first page, and each page has its own browser context, so pages share no cookies or storage. A page
// left unused for `idleMs` closes on its own, and closeAll() closes every page and Chromium.
export function createSessions({ launchBrowser, maxPages = 3, idleMs = 10 * 60 * 1000 }) {
  let browser = null;
  const open = new Map();
  const closedWhileIdle = new Set();
  let opening = 0;

  const ids = () => [...open.keys()].join(", ") || "none";

  function touch(session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      closedWhileIdle.add(session.id);
      close(session.id);
    }, idleMs);
    // The timer alone must not keep the process alive
    session.timer.unref?.();
  }

  // Opens a context and a page. An aborted signal (the client cancelled the call) closes the context,
  // which makes any navigation in progress fail.
  async function create({ viewport, signal }) {
    if (open.size + opening >= maxPages) {
      throw new SessionError(`${maxPages} pages are open already (${ids()}). Close one with close_page first.`);
    }
    opening++;
    try {
      // A launch that fails (Chromium not installed yet) is not kept: the next page launches again
      browser ??= launchBrowser().catch((err) => {
        browser = null;
        throw err;
      });
      const context = await (await browser).newContext({ viewport });
      const page = await context.newPage();
      const session = { id: randomUUID(), context, page, pageErrors: [], tracking: [], hadInput: false };
      page.on("pageerror", (err) => session.pageErrors.push(err.message));
      // Actions on a page that is still open answer within seconds, not the 30 s of Playwright
      page.setDefaultTimeout(5000);
      const cancel = () => close(session.id);
      signal?.addEventListener("abort", cancel, { once: true });
      session.stopListening = () => signal?.removeEventListener("abort", cancel);
      open.set(session.id, session);
      touch(session);
      return session;
    } finally {
      opening--;
    }
  }

  function get(id) {
    const session = open.get(id);
    if (session) {
      touch(session);
      return session;
    }
    if (closedWhileIdle.has(id)) {
      throw new SessionError(`The page ${id} was closed after ${duration(idleMs)} without use. Open it again with open_page.`);
    }
    throw new SessionError(`No open page has the id ${id} (open: ${ids()}). Open one with open_page.`);
  }

  async function close(id) {
    const session = open.get(id);
    if (!session) return false;
    open.delete(id);
    clearTimeout(session.timer);
    session.stopListening();
    await session.context.close().catch(() => {});
    return true;
  }

  async function closeAll() {
    await Promise.all([...open.keys()].map(close));
    if (browser) {
      const launched = browser;
      browser = null;
      await (await launched).close().catch(() => {});
    }
  }

  return { create, get, close, closeAll };
}
