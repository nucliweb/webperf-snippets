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

export async function launchChromium(options) {
  try {
    return await chromium.launch(options);
  } catch (err) {
    throw isMissingBrowser(err) ? new MissingBrowserError() : err;
  }
}
