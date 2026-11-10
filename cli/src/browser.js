import { existsSync } from "node:fs";
import { chromium } from "playwright";

// Chromium for Playwright is a download of its own: npx installs this package and its peer playwright,
// not the browser. Without it, Playwright fails with the path of the missing executable, and its advice
// (npx playwright install) downloads every browser; this message names the only one the CLI uses.
export const MISSING_BROWSER = "Chromium for Playwright is not installed. Install it once with: npx playwright install chromium";

export class MissingBrowserError extends Error {
  constructor() {
    super(MISSING_BROWSER);
  }
}

export const isMissingBrowser = (err) => err instanceof MissingBrowserError || /Executable doesn't exist/.test(err?.message ?? "");

// Whether the full Chromium of this Playwright is on the machine. executablePath() names it in every
// version since 1.40, whichever of the two binaries a launch would pick.
function fullChromiumInstalled() {
  try {
    return existsSync(chromium.executablePath());
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
export function launchedBrowser(options = {}, browser) {
  const headed = options.headless === false;
  return {
    build: options.channel ?? (headed ? "chromium" : "chromium-headless-shell"),
    mode: headed ? "headed" : "headless",
    version: browser.version(),
  };
}

export async function launchChromium(options, { launch = (o) => chromium.launch(o), hasFullChromium } = {}) {
  try {
    return await launch(chromiumLaunchOptions(options, { hasFullChromium }));
  } catch (err) {
    throw isMissingBrowser(err) ? new MissingBrowserError() : err;
  }
}
