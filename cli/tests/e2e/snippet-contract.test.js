import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { listSnippets, launch, startContractServers, observeSnippet, exposedGetters } from "../helpers/contract.js";
import { loadSnippet } from "../../src/load-snippet.js";

// Contract every snippet must keep (see snippets/SCHEMA.md): the value it returns, the value
// its getDataFn returns when it tracks, and the value of every other getter it exposes on
// window (getINPDetails(), checkBfcache()...) must be a JSON-serializable object with a valid
// `script` and `status`, numbers as numbers, homogeneous items capped at 50, under 50 KB, and
// no spaced em-dash in any returned text.
//
// KNOWN_VIOLATIONS lists what is still broken, per snippet. It can only shrink: a listed
// violation that no longer happens fails the test, so the entry has to be removed.
const KNOWN_VIOLATIONS = {
  // analyzeContentVisibilityOpportunities() returns its own shape, without script and status
  "Loading/Content-Visibility": [
    "analyzeContentVisibilityOpportunities:missing-script",
    "analyzeContentVisibilityOpportunities:invalid-status",
  ],
};

let browser;
let servers;

beforeAll(async () => {
  browser = await launch();
  servers = await startContractServers();
}, 30000);

afterAll(async () => {
  await browser.close();
  await servers.close();
});

describe("exposedGetters", () => {
  it("finds the getters the snippets expose on window", () => {
    const getters = Object.fromEntries(listSnippets().map((name) => [name, exposedGetters(loadSnippet(name))]));
    expect(getters["CoreWebVitals/INP"]).toEqual(["getINP", "getINPDetails"]);
    expect(getters["CoreWebVitals/CLS"]).toEqual(["getCLS"]);
    expect(getters["Interaction/Forced-Synchronous-Layout"]).toEqual(["getFSLSummary"]);
    expect(getters["Loading/Back-Forward-Cache"]).toEqual(["checkBfcache"]);
  });
});

describe("snippet return contract", () => {
  it.each(listSnippets())(
    "%s",
    async (name) => {
      const found = new Set();
      for (const pageName of ["empty", "seeded", "heavy"]) {
        for (const v of await observeSnippet(browser, servers.base, name, pageName)) found.add(v);
      }
      const known = new Set(KNOWN_VIOLATIONS[name] ?? []);
      const unexpected = [...found].filter((v) => !known.has(v));
      const fixed = [...known].filter((v) => !found.has(v));
      expect({ unexpected, fixed }).toEqual({ unexpected: [], fixed: [] });
    },
    60000
  );
});
