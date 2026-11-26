import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Playwright is loaded when a browser is needed, not with this module: it takes most of the start of
// the CLI, and --help, --version and a usage error need no browser. It is a peer dependency, so it may
// not be there at all
const require = createRequire(import.meta.url);
let playwright;
const chromium = () => (playwright ??= require("playwright")).chromium;
export const MISSING_PLAYWRIGHT = "Playwright is not installed. Install it and its Chromium with: npm install playwright && npx playwright install chromium";
const isMissingPlaywright = (err) => (err?.code === "MODULE_NOT_FOUND" || err?.code === "ERR_MODULE_NOT_FOUND") && /playwright/.test(err.message ?? "");

// Chromium for Playwright is a download of its own: npx installs this package and its peer playwright,
// not the browser. Without it, Playwright fails with the path of the missing executable, and its advice
// (npx playwright install) downloads every browser; this message names the only one the CLI uses.
export const MISSING_BROWSER = "Chromium for Playwright is not installed. Install it once with: npx playwright install chromium";

// What is missing is a step of the setup, Chromium or Playwright itself, and the message says what to run
export class MissingBrowserError extends Error {
  constructor(message = MISSING_BROWSER) {
    super(message);
  }
}

export const isMissingBrowser = (err) => err instanceof MissingBrowserError || /Executable doesn't exist/.test(err?.message ?? "");
// What to tell the user: the message of the error when it already says what is missing, Playwright or
// its Chromium, and the one of Chromium for the error of Playwright itself
export const missingBrowserMessage = (err) => (err instanceof MissingBrowserError ? err.message : MISSING_BROWSER);

// Whether the full Chromium of this Playwright is on the machine. executablePath() names it in every
// version since 1.40, whichever of the two binaries a launch would pick.
function fullChromiumInstalled() {
  try {
    return existsSync(chromium().executablePath());
  } catch {
    return false;
  }
}

// Which Chromium a launch uses. Headless, Playwright 1.49 and later picks the headless shell
// (chromium_headless_shell-*), a build of its own, and channel "chromium" picks the full Chromium in its
// headless mode, the binary Chrome DevTools MCP runs. So the full Chromium when it is installed
// (npx playwright install chromium installs both; --no-shell only this one), and the headless shell
// otherwise (--only-shell). It is checked on disk, not by a launch that fails: Playwright makes the same
// check before it starts the process, so the outcome is the same, without a failure in its logs.
// Before 1.49 there is no headless shell, and channel "chromium" is the executable a launch without a
// channel runs, with the same arguments. Headed, Playwright already runs the full Chromium; and a
// channel or an executable of the caller wins.
export function chromiumLaunchOptions(options = {}, { hasFullChromium = fullChromiumInstalled } = {}) {
  if (options.headless === false || options.channel || options.executablePath) return options;
  return hasFullChromium() ? { channel: "chromium", ...options } : options;
}

// The browser a launch with these options ran, for the conditions of a measurement: its build (the full
// Chromium, "chromium", or the headless shell, "chromium-headless-shell"), its mode and its version. A
// later run compared with it can then say when the browser changed, which can move the timings.
export function launchedBrowser(options = {}, browser, profile) {
  const headed = options.headless === false;
  return {
    build: options.channel ?? (headed ? "chromium" : "chromium-headless-shell"),
    mode: headed ? "headed" : "headless",
    version: browser.version(),
    ...(profile ? { profile } : {}),
  };
}

export async function launchChromium(options, { launch = (o) => chromium().launch(o), hasFullChromium } = {}) {
  try {
    return await launch(chromiumLaunchOptions(options, { hasFullChromium }));
  } catch (err) {
    if (isMissingPlaywright(err)) throw new MissingBrowserError(MISSING_PLAYWRIGHT);
    throw isMissingBrowser(err) ? new MissingBrowserError() : err;
  }
}

// A measurement in a persistent profile of its own. Chromium ignores <link rel="preconnect"> in a
// private profile, which is what browser.newContext() opens, so a page measured there loads as if it
// had no preconnects. Each launch gets a new, empty profile directory, removed when it closes, so no
// cache, cookie or connection passes from one measurement to the next. Playwright takes no storage
// state for a persistent launch: it is set on the context. Returns the context and its close().
export async function launchPersistentChromium(
  options,
  { storageState, ...contextOptions } = {},
  { launchPersistent = (dir, o) => chromium().launchPersistentContext(dir, o), hasFullChromium } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), "webperf-snippets-"));
  const removeProfile = () => rmSync(dir, { recursive: true, force: true });
  let context;
  try {
    context = await launchPersistent(dir, { ...chromiumLaunchOptions(options, { hasFullChromium }), ...contextOptions });
    if (storageState) await context.setStorageState(storageState);
  } catch (err) {
    await context?.close().catch(() => {});
    removeProfile();
    if (isMissingPlaywright(err)) throw new MissingBrowserError(MISSING_PLAYWRIGHT);
    throw isMissingBrowser(err) ? new MissingBrowserError() : err;
  }
  return {
    context,
    close: async () => {
      await context.close().catch(() => {});
      removeProfile();
    },
  };
}
