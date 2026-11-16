import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseOptions, UsageError } from "../../src/options.js";
import { USAGE } from "../../src/usage.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const URL = "http://localhost:3000";
const parse = (...args) => parseOptions(args, {});
// The message of the usage error these arguments give
const usage = (...args) => {
  try {
    parse(...args);
  } catch (err) {
    expect(err).toBeInstanceOf(UsageError);
    return err.message;
  }
  throw new Error(`No usage error for ${args.join(" ")}`);
};

describe("parseOptions", () => {
  it("answers --help and --version before anything else, also with a URL", () => {
    expect(parse("--help")).toEqual({ command: "help" });
    expect(parse("-h")).toEqual({ command: "help" });
    expect(parse(URL, "--version")).toEqual({ command: "version" });
    expect(parse("--help", "--wait=abc")).toEqual({ command: "help" });
  });

  it("measures a page with the defaults: the core-web-vitals workflow on a phone, after 3 s", () => {
    const options = parse(URL);
    expect(options.command).toBe("page");
    expect(options.url).toBe(URL);
    expect(options.workflow.id).toBe("core-web-vitals");
    expect(options.items).toBeNull();
    expect(options).toEqual(expect.objectContaining({ waitMs: 3000, viewportName: "mobile", viewport: { width: 375, height: 812 }, headers: {}, budgets: {}, failOn: "error" }));
    expect(options.cpu).toBeUndefined();
    expect(options.runCount).toBeUndefined();
  });

  it("reads the conditions of the load", () => {
    const options = parse(URL, "--wait", "0", "--viewport", "desktop", "--cpu", "4", "--network", "slow-4g", "--header", "X-Demo: 1", "--header", "X-Other: 2", "--own-domains", "cdn.example.net,static.example.org", "--runs", "3", "--median-by", "LCP");
    expect(options).toEqual(
      expect.objectContaining({ waitMs: 0, viewportName: "desktop", cpu: 4, network: "slow-4g", headers: { "X-Demo": "1", "X-Other": "2" }, ownDomains: ["cdn.example.net", "static.example.org"], runCount: 3, medianBy: "LCP" })
    );
  });

  it("resolves a snippet by its name, and leaves the workflow out", () => {
    const options = parse(URL, "--snippet", "LCP");
    expect(options.workflow).toBeNull();
    expect(options.items).toEqual([{ id: "LCP", path: "CoreWebVitals/LCP", source: expect.stringContaining("largest-contentful-paint") }]);
  });

  it("reads the steps of --interact-script", () => {
    expect(parse(URL, "--interact-script", join(FIXTURES, "interactions.json")).interactions).toHaveLength(2);
  });

  it("takes the CrUX key of the option or of the environment", () => {
    expect(parseOptions([URL, "--crux-key", "from-option"], { CRUX_API_KEY: "from-env" }).cruxKey).toBe("from-option");
    expect(parseOptions([URL], { CRUX_API_KEY: "from-env" }).cruxKey).toBe("from-env");
    expect(parseOptions([URL, "--crux-history", "12"], { CRUX_API_KEY: "from-env" }).cruxWeeks).toBe(12);
  });

  it("without a URL or --matrix, the usage is the error", () => {
    expect(usage()).toBe(USAGE.trimEnd());
  });

  it.each([
    [[URL, "--matrix", "m.json"], "Use a URL or --matrix, not both"],
    [["ftp://localhost"], "The URL must be an http or https URL, such as https://example.com or http://localhost:3000"],
    [["--matrix", "m.json", "--viewport", "desktop"], "--viewport does not apply to --matrix: set the viewport of each device in the file"],
    [[URL, "--json", "--markdown"], "Use --json or --markdown, not both"],
    [[URL, "--wait=abc"], 'Invalid --wait "abc". Use a number of milliseconds, such as 3000, or 0 for no wait'],
    [[URL, "--viewport", "watch"], 'Unknown viewport preset: "watch". Choose from: mobile, tablet, desktop'],
    [[URL, "--cpu", "0"], 'Invalid CPU factor "0". Use a number of at least 1, such as 4'],
    [[URL, "--network", "dial-up"], /^Unknown network preset: "dial-up"\. Choose from: /],
    [[URL, "--interact-script", "nowhere.json"], "Interaction script not found: nowhere.json"],
    [[URL, "--storage-state", "nowhere.json"], "Storage state file not found: nowhere.json"],
    [[URL, "--header", "X-Demo: 1", "--header", "secret-token"], 'Invalid --header (number 2): use --header "Name: value". Its text is not shown, as it may hold a secret'],
    [[URL, "--own-domains", "not a domain"], /^Invalid --own-domains "not a domain"\./],
    [[URL, "--runs", "10"], 'Invalid --runs "10". Use a whole number from 1 to 9'],
    [[URL, "--runs", "3", "--median-by", "SPEED"], /^Unknown --median-by "SPEED"\. Choose from: /],
    [[URL, "--median-by", "LCP"], "--median-by needs --runs"],
    [[URL, "--crux-history", "99", "--crux-key", "k"], '--crux-history takes 1 to 40 weeks, not "99"'],
    [[URL, "--crux-history", "4"], "--crux-history needs a CrUX key: --crux-key or CRUX_API_KEY"],
    [[URL, "--threshold", "LCP=10%"], "--threshold needs --baseline"],
    [[URL, "--fail-on-regression"], "--fail-on-regression needs --baseline"],
    [[URL, "--fail-on-inconclusive"], "--fail-on-inconclusive needs --baseline"],
    [[URL, "--snippet", "No-Such-Snippet"], /No-Such-Snippet/],
    [[URL, "--workflow", "everything"], 'Unknown workflow: "everything". Choose from: core-web-vitals, audit, loading, interaction'],
    [[URL, "--budget-inp", "200"], /^--budget-inp needs a run that measures INP, and the core-web-vitals workflow does not\. Use /],
    [[URL, "--no-such-option"], /no-such-option/],
  ])("%j is a usage error", (args, message) => {
    if (typeof message === "string") expect(usage(...args)).toBe(message);
    else expect(usage(...args)).toMatch(message);
  });

  it("names the header by its number, never by its text", () => {
    expect(usage(URL, "--header", "secret-token")).not.toContain("secret-token");
  });

  it("reports the first problem, in the order of the options it checks", () => {
    expect(usage(URL, "--wait=abc", "--viewport", "watch")).toMatch(/^Invalid --wait/);
  });
});

describe("--no-color", () => {
  it("is an option of a page and of a matrix", () => {
    expect(parseOptions(["https://example.com", "--no-color"]).values["no-color"]).toBe(true);
    expect(parseOptions(["https://example.com"]).values["no-color"]).toBeUndefined();
  });
});
