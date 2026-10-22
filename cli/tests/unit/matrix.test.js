import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMatrix } from "../../src/matrix.js";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "matrix-"));
  mkdirSync(join(dir, "states"));
  writeFileSync(join(dir, "states", "consent.json"), JSON.stringify({ cookies: [], origins: [] }));
});

// Writes a matrix file in the temporary folder and loads it with the flags of the command line
function load(matrix, flags = {}) {
  const path = join(dir, "matrix.json");
  writeFileSync(path, typeof matrix === "string" ? matrix : JSON.stringify(matrix));
  return loadMatrix(path, flags);
}

const invalid = (matrix, message, flags) => expect(() => load(matrix, flags)).toThrow(message);

const CLIENT_CASE = {
  urls: { home: "https://example.com/", article: "https://example.com/news/some-article" },
  devices: {
    mobile: { viewport: "mobile", cpu: 4, network: "slow-4g" },
    desktop: { viewport: "desktop" },
  },
  variants: {
    "no-consent": {},
    consent: { storageState: "states/consent.json" },
  },
  runs: 3,
};

describe("the combinations of a matrix", () => {
  it("are every URL with every device and every variant, in that order", () => {
    const { combinations } = load(CLIENT_CASE);
    expect(combinations.map((c) => c.id)).toEqual([
      "home · mobile · no-consent",
      "home · mobile · consent",
      "home · desktop · no-consent",
      "home · desktop · consent",
      "article · mobile · no-consent",
      "article · mobile · consent",
      "article · desktop · no-consent",
      "article · desktop · consent",
    ]);
  });

  it("carry the conditions of their device and variant, with the storage state relative to the file", () => {
    const [first, second, third] = load(CLIENT_CASE).combinations;
    expect(first).toMatchObject({ name: "home", url: "https://example.com/", device: "mobile", variant: "no-consent", viewport: "mobile", cpu: 4, network: "slow-4g" });
    expect(first.storageState).toBeUndefined();
    expect(second.storageState).toBe(join(dir, "states", "consent.json"));
    expect(third).toMatchObject({ viewport: "desktop" });
    expect(third.cpu).toBeUndefined();
    expect(third.network).toBeUndefined();
  });

  it("give the runs and the metric of the median of the file", () => {
    expect(load({ ...CLIENT_CASE, medianBy: "FCP" })).toMatchObject({ runs: 3, medianBy: "FCP" });
    expect(load({ urls: ["https://example.com/"] })).toMatchObject({ runs: 1, medianBy: undefined });
  });
});

describe("the shortcuts and defaults of a matrix", () => {
  it("name the URLs of an array by their path and query", () => {
    const { combinations } = load({ urls: ["https://example.com/", "https://example.com/news/", "https://example.com/search?q=shoes"] });
    expect(combinations.map((c) => c.name)).toEqual(["/", "/news/", "/search?q=shoes"]);
  });

  it("add the host to the names when the URLs of an array have more than one", () => {
    const { combinations } = load({ urls: ["https://example.com/news/", "https://example.org/news/"] });
    expect(combinations.map((c) => c.name)).toEqual(["example.com/news/", "example.org/news/"]);
  });

  it("measure a mid-range phone, with CPU 4x and Slow 4G, when there are no devices", () => {
    const [only] = load({ urls: ["https://example.com/"] }).combinations;
    expect(only).toMatchObject({ device: "mobile", viewport: "mobile", cpu: 4, network: "slow-4g", variant: "default" });
  });

  it("take an array of viewport presets as devices without throttling", () => {
    const { combinations } = load({ urls: ["https://example.com/"], devices: ["mobile", "desktop"] });
    expect(combinations.map((c) => [c.device, c.viewport, c.cpu, c.network])).toEqual([
      ["mobile", "mobile", undefined, undefined],
      ["desktop", "desktop", undefined, undefined],
    ]);
  });

  it("take a network of its own for a device, such as 5G on a high-end phone", () => {
    const fiveG = { downloadKbps: 50000, uploadKbps: 10000, latencyMs: 20 };
    const [only] = load({ urls: ["https://example.com/"], devices: { "high-end": { viewport: "mobile", cpu: 1, network: fiveG } } }).combinations;
    expect(only).toMatchObject({ device: "high-end", cpu: 1, network: fiveG });
  });
});

describe("the flags of the command line in a matrix", () => {
  const flags = {
    cpu: 2,
    network: "fast-4g",
    storageState: "/abs/session.json",
    headers: { "CF-Access-Client-Id": "id", "Accept-Language": "en" },
    ownDomains: ["cdn.example.net"],
    runs: 5,
    medianBy: "TTFB",
  };
  const matrix = {
    urls: ["https://example.com/"],
    devices: { throttled: { viewport: "mobile", cpu: 6, network: "3g" }, plain: { viewport: "desktop" } },
    variants: {
      ca: { headers: { "accept-language": "ca" }, ownDomains: ["static.example.org"], storageState: "states/consent.json" },
      base: {},
    },
    runs: 3,
    medianBy: "LCP",
  };

  it("apply to every combination, and the file replaces cpu, network and storage state where it sets them", () => {
    const [throttledCa, throttledBase, plainCa, plainBase] = load(matrix, flags).combinations;
    expect(throttledCa).toMatchObject({ cpu: 6, network: "3g", storageState: join(dir, "states", "consent.json") });
    expect(throttledBase).toMatchObject({ cpu: 6, network: "3g", storageState: "/abs/session.json" });
    expect(plainCa).toMatchObject({ cpu: 2, network: "fast-4g" });
    expect(plainBase).toMatchObject({ cpu: 2, network: "fast-4g", storageState: "/abs/session.json" });
  });

  it("add their headers and own domains to the ones of the variant, the variant winning on the same header whatever its case", () => {
    const [throttledCa, throttledBase] = load(matrix, flags).combinations;
    expect(throttledCa.headers).toEqual({ "CF-Access-Client-Id": "id", "accept-language": "ca" });
    expect(throttledCa.ownDomains).toEqual(["cdn.example.net", "static.example.org"]);
    expect(throttledBase.headers).toEqual(flags.headers);
    expect(throttledBase.ownDomains).toEqual(["cdn.example.net"]);
  });

  it("replace the runs and the metric of the median of the file", () => {
    expect(load(matrix, flags)).toMatchObject({ runs: 5, medianBy: "TTFB" });
  });

  it("set the conditions of the default device when the file has no devices", () => {
    const [only] = load({ urls: ["https://example.com/"] }, { cpu: 1, network: "fast-4g" }).combinations;
    expect(only).toMatchObject({ device: "mobile", cpu: 1, network: "fast-4g" });
  });
});

describe("a header of the file that looks like a secret", () => {
  it("raises a warning that suggests --header with an environment variable, and is still sent", () => {
    const { warnings, combinations } = load({
      urls: ["https://example.com/"],
      variants: { preview: { headers: { "X-Api-Key": "abc", "X-Experiment": "b", Authorization: "Bearer x" } } },
    });
    expect(warnings).toEqual([
      'variants.preview.headers.X-Api-Key looks like a secret, and a matrix file is usually versioned. Pass it with --header "X-Api-Key: $VARIABLE" instead.',
      'variants.preview.headers.Authorization looks like a secret, and a matrix file is usually versioned. Pass it with --header "Authorization: $VARIABLE" instead.',
    ]);
    expect(combinations[0].headers["X-Api-Key"]).toBe("abc");
  });

  it("is the only one that raises it", () => {
    expect(load({ urls: ["https://example.com/"], variants: { b: { headers: { "X-Experiment": "b" } } } }).warnings).toEqual([]);
  });
});

describe("an invalid matrix", () => {
  it("fails when the file does not exist or is not JSON", () => {
    expect(() => loadMatrix(join(dir, "missing.json"))).toThrow(`Matrix file not found: ${join(dir, "missing.json")}`);
    invalid("{ urls: ", "Invalid matrix: the file is not valid JSON");
  });

  it("fails on a key it does not know, at any level, so a typo does not measure without its condition", () => {
    invalid({ urls: ["https://example.com/"], device: {} }, 'Invalid matrix: unknown key "device". Known keys: urls, devices, variants, runs, medianBy');
    invalid({ urls: ["https://example.com/"], variants: { consent: { storagestate: "states/consent.json" } } }, 'Invalid matrix: unknown key "variants.consent.storagestate". Known keys: storageState, headers, ownDomains');
    invalid({ urls: ["https://example.com/"], devices: { m: { viewport: "mobile", throttle: 4 } } }, 'Invalid matrix: unknown key "devices.m.throttle". Known keys: viewport, cpu, network');
  });

  it("fails without URLs, or on a URL that is not http or https", () => {
    invalid({}, "Invalid matrix: urls is required");
    invalid({ urls: [] }, "Invalid matrix: urls has no URL");
    invalid({ urls: { home: "example.com" } }, 'Invalid matrix: urls.home "example.com" is not an http or https URL');
    invalid({ urls: ["ftp://example.com/"] }, 'Invalid matrix: urls[0] "ftp://example.com/" is not an http or https URL');
  });

  it("fails on devices or variants with none in them, which would measure nothing", () => {
    invalid({ urls: ["https://example.com/"], devices: {} }, "Invalid matrix: devices has no device");
    invalid({ urls: ["https://example.com/"], devices: [] }, "Invalid matrix: devices has no device");
    invalid({ urls: ["https://example.com/"], variants: {} }, "Invalid matrix: variants has no variant");
  });

  it("fails when two URLs of an array get the same name", () => {
    invalid({ urls: ["https://example.com/news/", "https://example.com/news/"] }, 'Invalid matrix: two URLs of urls are named "/news/". Name them with an object, such as { "news": "https://example.com/news/" }');
  });

  it("fails on a device whose viewport, CPU or network is not valid", () => {
    invalid({ urls: ["https://example.com/"], devices: { m: { viewport: "watch" } } }, 'Invalid matrix: devices.m.viewport "watch" is not a preset. Choose from: mobile, tablet, desktop');
    invalid({ urls: ["https://example.com/"], devices: ["mobile", "watch"] }, 'Invalid matrix: devices[1] "watch" is not a preset. Choose from: mobile, tablet, desktop');
    invalid({ urls: ["https://example.com/"], devices: { m: { viewport: "mobile", cpu: 0.5 } } }, "Invalid matrix: devices.m.cpu must be a number of at least 1, such as 4");
    invalid({ urls: ["https://example.com/"], devices: { m: { viewport: "mobile", network: "5g" } } }, 'Invalid matrix: devices.m.network: Unknown network preset: "5g". Choose from: fast-4g, slow-4g, 3g');
    invalid({ urls: ["https://example.com/"], devices: { m: { viewport: "mobile", network: { downloadKbps: 1000 } } } }, "Invalid matrix: devices.m.network: Invalid network: uploadKbps");
  });

  it("fails on a variant whose storage state does not exist, or whose headers or own domains are not valid", () => {
    invalid({ urls: ["https://example.com/"], variants: { v: { storageState: "states/missing.json" } } }, `Invalid matrix: variants.v.storageState "states/missing.json" not found at ${join(dir, "states", "missing.json")}`);
    invalid({ urls: ["https://example.com/"], variants: { v: { headers: { "Bad Name": "x" } } } }, 'Invalid matrix: variants.v.headers "Bad Name" is not a valid header');
    invalid({ urls: ["https://example.com/"], variants: { v: { headers: { "X-Experiment": 2 } } } }, 'Invalid matrix: variants.v.headers "X-Experiment" must be a string');
    invalid({ urls: ["https://example.com/"], variants: { v: { ownDomains: ["cdn example"] } } }, "Invalid matrix: variants.v.ownDomains must be a list of domains without spaces");
  });

  it("fails on runs out of 1 to 9 or an unknown metric for the median", () => {
    invalid({ urls: ["https://example.com/"], runs: 10 }, "Invalid matrix: runs must be a whole number from 1 to 9");
    invalid({ urls: ["https://example.com/"], runs: 2.5 }, "Invalid matrix: runs must be a whole number from 1 to 9");
    invalid({ urls: ["https://example.com/"], medianBy: "FID" }, 'Invalid matrix: medianBy "FID" is not a metric. Choose from: LCP, FCP, TTFB, CLS, INP, navMs');
  });
});
