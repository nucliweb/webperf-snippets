// A matrix file: several pages, measured on several devices and in several variants, each
// combination one or more times. This module reads, validates and expands the file into the
// combinations to measure, with the conditions of each one already combined with the flags of the
// command line. It opens no browser, so an invalid file fails before any page load.
//
// {
//   "urls": { "home": "https://example.com/" },              or an array of URLs
//   "devices": { "mobile": { "viewport": "mobile", "cpu": 4, "network": "slow-4g" } },
//   "variants": { "consent": { "storageState": "consent.json", "headers": {}, "ownDomains": [] } },
//   "runs": 3,
//   "medianBy": "LCP"
// }
//
// The conditions of the file replace cpu, network and storageState of the command line where they
// set them; headers and own domains add to the ones of the command line, which carries the secrets.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { VIEWPORT_PRESETS } from "./runner.js";
import { resolveNetwork } from "./throttling.js";
import { parseHeader } from "./headers.js";
import { parseOwnDomains } from "./own-domains.js";
import { MEDIAN_METRICS } from "./runs.js";

const KEYS = {
  matrix: ["urls", "devices", "variants", "runs", "medianBy"],
  device: ["viewport", "cpu", "network"],
  variant: ["storageState", "headers", "ownDomains"],
};

// Without devices, a mid-range phone, as Lighthouse measures by default
const DEFAULT_DEVICE = { viewport: "mobile", cpu: 4, network: "slow-4g" };

// A header whose name says it carries a secret, which a versioned file should not hold
const LOOKS_SECRET = /secret|token|authorization|key|cookie/i;

class MatrixError extends Error {
  constructor(problem) {
    super(`Invalid matrix: ${problem}`);
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function checkKeys(object, known, at) {
  for (const key of Object.keys(object)) {
    if (!known.includes(key)) {
      throw new MatrixError(`unknown key "${at ? `${at}.` : ""}${key}". Known keys: ${known.join(", ")}`);
    }
  }
}

// The URLs by name. An array names each URL by its path and query, with the host when there are
// several, which is what a reader recognises in a table of 5 rows or of 50.
function readUrls(urls) {
  if (urls === undefined) throw new MatrixError("urls is required");
  const entries = Array.isArray(urls) ? urls.map((url, i) => [`[${i}]`, url]) : isObject(urls) ? Object.entries(urls).map(([name, url]) => [`.${name}`, url, name]) : null;
  if (!entries) throw new MatrixError("urls must be an object of names and URLs, or an array of URLs");
  if (entries.length === 0) throw new MatrixError("urls has no URL");

  const parsed = entries.map(([at, url, name]) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = null;
    }
    if (typeof url !== "string" || !parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new MatrixError(`urls${at} "${url}" is not an http or https URL`);
    }
    return { url, parsedUrl, name };
  });
  if (!Array.isArray(urls)) return parsed.map(({ name, url }) => ({ name, url }));

  const severalHosts = new Set(parsed.map(({ parsedUrl }) => parsedUrl.host)).size > 1;
  const named = parsed.map(({ url, parsedUrl }) => ({
    name: `${severalHosts ? parsedUrl.host : ""}${parsedUrl.pathname}${parsedUrl.search}`,
    url,
  }));
  const seen = new Set();
  for (const { name, url } of named) {
    if (seen.has(name)) {
      const suggestion = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
      throw new MatrixError(`two URLs of urls are named "${name}". Name them with an object, such as { "${suggestion}": "${url}" }`);
    }
    seen.add(name);
  }
  return named;
}

function checkViewport(viewport, at) {
  if (!VIEWPORT_PRESETS[viewport]) {
    throw new MatrixError(`${at} "${viewport}" is not a preset. Choose from: ${Object.keys(VIEWPORT_PRESETS).join(", ")}`);
  }
}

// The devices by name. An array of viewport presets is a shortcut for devices without throttling.
function readDevices(devices, flags) {
  if (devices === undefined) {
    return [{ name: "mobile", viewport: DEFAULT_DEVICE.viewport, cpu: flags.cpu ?? DEFAULT_DEVICE.cpu, network: flags.network ?? DEFAULT_DEVICE.network }];
  }
  if (Array.isArray(devices) ? devices.length === 0 : isObject(devices) && Object.keys(devices).length === 0) {
    throw new MatrixError("devices has no device");
  }
  if (Array.isArray(devices)) {
    devices.forEach((viewport, i) => checkViewport(viewport, `devices[${i}]`));
    return devices.map((viewport) => ({ name: viewport, viewport, cpu: flags.cpu, network: flags.network }));
  }
  if (!isObject(devices)) throw new MatrixError("devices must be an object of names and devices, or an array of viewport presets");

  return Object.entries(devices).map(([name, device]) => {
    const at = `devices.${name}`;
    if (!isObject(device)) throw new MatrixError(`${at} must be an object, such as { "viewport": "mobile", "cpu": 4, "network": "slow-4g" }`);
    checkKeys(device, KEYS.device, at);
    const viewport = device.viewport ?? "mobile";
    checkViewport(viewport, `${at}.viewport`);
    if (device.cpu !== undefined && !(typeof device.cpu === "number" && device.cpu >= 1)) {
      throw new MatrixError(`${at}.cpu must be a number of at least 1, such as 4`);
    }
    if (device.network !== undefined) {
      try {
        resolveNetwork(device.network);
      } catch (err) {
        throw new MatrixError(`${at}.network: ${err.message}`);
      }
    }
    return { name, viewport, cpu: device.cpu ?? flags.cpu, network: device.network ?? flags.network };
  });
}

// The variants by name. Without variants, one variant with no name and no conditions of its own,
// so the combinations are the pages on the devices and the reports leave the variant out.
function readVariants(variants, base, warnings) {
  if (variants === undefined) return [{ headers: {}, ownDomains: [] }];
  if (!isObject(variants)) throw new MatrixError("variants must be an object of names and variants");
  if (Object.keys(variants).length === 0) throw new MatrixError("variants has no variant");

  return Object.entries(variants).map(([name, variant]) => {
    const at = `variants.${name}`;
    if (!isObject(variant)) throw new MatrixError(`${at} must be an object, such as { "storageState": "consent.json" }`);
    checkKeys(variant, KEYS.variant, at);

    let storageState;
    if (variant.storageState !== undefined) {
      storageState = resolve(base, String(variant.storageState));
      if (!existsSync(storageState)) throw new MatrixError(`${at}.storageState "${variant.storageState}" not found at ${storageState}`);
    }

    const headers = {};
    if (variant.headers !== undefined) {
      if (!isObject(variant.headers)) throw new MatrixError(`${at}.headers must be an object of header names and values`);
      for (const [header, value] of Object.entries(variant.headers)) {
        if (!parseHeader(`${header}: `)) throw new MatrixError(`${at}.headers "${header}" is not a valid header`);
        if (typeof value !== "string") throw new MatrixError(`${at}.headers "${header}" must be a string`);
        if (LOOKS_SECRET.test(header)) {
          warnings.push(`${at}.headers.${header} looks like a secret, and a matrix file is usually versioned. Pass it with --header "${header}: $VARIABLE" instead.`);
        }
        headers[header] = value;
      }
    }

    let ownDomains = [];
    if (variant.ownDomains !== undefined) {
      const parsed = Array.isArray(variant.ownDomains) && variant.ownDomains.every((d) => typeof d === "string") ? parseOwnDomains(variant.ownDomains) : null;
      if (!parsed) throw new MatrixError(`${at}.ownDomains must be a list of domains without spaces`);
      ownDomains = parsed;
    }

    return { name, storageState, headers, ownDomains };
  });
}

// The headers of the command line and of the variant; the variant wins on the same header, whatever its case
function mergeHeaders(fromFlags = {}, fromVariant) {
  const names = new Set(Object.keys(fromVariant).map((name) => name.toLowerCase()));
  const kept = Object.entries(fromFlags).filter(([name]) => !names.has(name.toLowerCase()));
  return Object.fromEntries([...kept, ...Object.entries(fromVariant)]);
}

// The file at `path`, with the flags of the command line: cpu, network, storageState, headers,
// ownDomains, runs and medianBy. Returns the runs, the metric of the median, the combinations in the
// order they run (URL, then device, then variant) and the warnings to print.
export function loadMatrix(path, flags = {}) {
  if (!existsSync(path)) throw new Error(`Matrix file not found: ${path}`);
  let matrix;
  try {
    matrix = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new MatrixError(`the file is not valid JSON (${err.message})`);
  }
  if (!isObject(matrix)) throw new MatrixError("the file must hold an object, such as { \"urls\": [\"https://example.com/\"] }");
  checkKeys(matrix, KEYS.matrix);

  if (matrix.runs !== undefined && !(Number.isInteger(matrix.runs) && matrix.runs >= 1 && matrix.runs <= 9)) {
    throw new MatrixError("runs must be a whole number from 1 to 9");
  }
  if (matrix.medianBy !== undefined && !MEDIAN_METRICS.includes(matrix.medianBy)) {
    throw new MatrixError(`medianBy "${matrix.medianBy}" is not a metric. Choose from: ${MEDIAN_METRICS.join(", ")}`);
  }

  const warnings = [];
  const urls = readUrls(matrix.urls);
  const devices = readDevices(matrix.devices, flags);
  const variants = readVariants(matrix.variants, dirname(resolve(path)), warnings);

  const combinations = [];
  for (const { name, url } of urls) {
    for (const device of devices) {
      for (const variant of variants) {
        combinations.push({
          id: [name, device.name, variant.name].filter(Boolean).join(" · "),
          name,
          url,
          device: device.name,
          ...(variant.name ? { variant: variant.name } : {}),
          viewport: device.viewport,
          cpu: device.cpu,
          network: device.network,
          storageState: variant.storageState ?? flags.storageState,
          headers: mergeHeaders(flags.headers, variant.headers),
          ownDomains: [...(flags.ownDomains ?? []), ...variant.ownDomains],
        });
      }
    }
  }

  return { runs: flags.runs ?? matrix.runs ?? 1, medianBy: flags.medianBy ?? matrix.medianBy, combinations, warnings };
}
