import { describe, it, expect } from "vitest";
import { chromiumLaunchOptions, launchChromium, launchedBrowser, MissingBrowserError } from "../../src/browser.js";

// What `npx playwright install` leaves on the machine, as the launch sees it: whether the full
// Chromium is there. The headless shell is what Playwright launches without a channel.
const installed = {
  both: () => true, // npx playwright install chromium
  fullOnly: () => true, // --no-shell
  shellOnly: () => false, // --only-shell
  none: () => false,
};

describe("chromiumLaunchOptions", () => {
  it.each([
    ["both", installed.both],
    ["the full Chromium only", installed.fullOnly],
  ])("headless with %s installed launches the full Chromium", (_, hasFullChromium) => {
    expect(chromiumLaunchOptions({ headless: true }, { hasFullChromium })).toEqual({ channel: "chromium", headless: true });
  });

  it("headless with the headless shell only launches as before, with no channel", () => {
    expect(chromiumLaunchOptions({ headless: true }, { hasFullChromium: installed.shellOnly })).toEqual({ headless: true });
  });

  it("with no options (the MCP server) is headless, as Playwright's default", () => {
    expect(chromiumLaunchOptions(undefined, { hasFullChromium: installed.both })).toEqual({ channel: "chromium" });
    expect(chromiumLaunchOptions(undefined, { hasFullChromium: installed.shellOnly })).toEqual({});
  });

  it("headed (--headed) does not change: Playwright already launches the full Chromium", () => {
    let asked = false;
    const hasFullChromium = () => (asked = true);
    expect(chromiumLaunchOptions({ headless: false }, { hasFullChromium })).toEqual({ headless: false });
    expect(asked).toBe(false);
  });

  it("keeps the options of the caller", () => {
    const options = { headless: true, slowMo: 50, args: ["--lang=es"] };
    expect(chromiumLaunchOptions(options, { hasFullChromium: installed.both })).toEqual({ channel: "chromium", ...options });
    expect(options).toEqual({ headless: true, slowMo: 50, args: ["--lang=es"] });
  });

  it.each([
    [{ channel: "chrome" }],
    [{ executablePath: "/opt/chrome/chrome" }],
  ])("a browser the caller chose wins: %j", (options) => {
    expect(chromiumLaunchOptions(options, { hasFullChromium: installed.both })).toEqual(options);
  });
});

describe("launchChromium", () => {
  const launchWith = (installedCheck) => {
    const calls = [];
    const launch = async (options) => {
      calls.push(options);
      if (installedCheck === installed.none) throw new Error("browserType.launch: Executable doesn't exist at /nowhere/chrome-headless-shell");
      return { options };
    };
    return { calls, run: (options) => launchChromium(options, { launch, hasFullChromium: installedCheck }) };
  };

  it("launches once, with the options it chose", async () => {
    const { calls, run } = launchWith(installed.both);
    await run({ headless: true });
    expect(calls).toEqual([{ channel: "chromium", headless: true }]);
  });

  it("with the headless shell only, launches once, as before", async () => {
    const { calls, run } = launchWith(installed.shellOnly);
    await run({ headless: true });
    expect(calls).toEqual([{ headless: true }]);
  });

  it("with nothing installed, throws MissingBrowserError", async () => {
    const { run } = launchWith(installed.none);
    await expect(run({ headless: true })).rejects.toBeInstanceOf(MissingBrowserError);
  });

  it("any other error goes through as it is", async () => {
    const boom = new Error("Target page, context or browser has been closed");
    const launch = async () => {
      throw boom;
    };
    await expect(launchChromium({}, { launch, hasFullChromium: installed.both })).rejects.toBe(boom);
  });
});

// What the conditions of a measurement record of its browser, for a later comparison to tell
describe("launchedBrowser", () => {
  it.each([
    [{ channel: "chromium", headless: true }, { build: "chromium", mode: "headless" }],
    [{ channel: "chromium" }, { build: "chromium", mode: "headless" }],
    [{ headless: true }, { build: "chromium-headless-shell", mode: "headless" }],
    [{}, { build: "chromium-headless-shell", mode: "headless" }],
    [{ headless: false }, { build: "chromium", mode: "headed" }],
    [{ channel: "chrome", headless: true }, { build: "chrome", mode: "headless" }],
  ])("launched with %j is %j", (options, expected) => {
    expect(launchedBrowser(options, { version: () => "153.0.8010.12" })).toEqual({ ...expected, version: "153.0.8010.12" });
  });
});
