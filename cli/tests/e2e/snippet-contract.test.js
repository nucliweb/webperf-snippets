import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { listSnippets, launch, startContractServers, observeSnippet } from "../helpers/contract.js";

// Contract every snippet must keep (see snippets/SCHEMA.md): the value it returns, and the
// value its getDataFn returns when it tracks, must be a JSON-serializable object with a valid
// `script` and `status`, numbers as numbers, homogeneous items capped at 50 and under 50 KB.
//
// KNOWN_VIOLATIONS lists what is still broken, per snippet. It can only shrink: a listed
// violation that no longer happens fails the test, so the entry has to be removed.
const KNOWN_VIOLATIONS = {
  // Return every item they find; the schema caps items at 50.
  "CoreWebVitals/LCP-Image-Entropy": ["items-uncapped"],
  "Loading/Cache-Strategy-Analysis": ["items-uncapped"],
  "Loading/First-And-Third-Party-Script-Info": ["items-uncapped"],
  "Loading/First-And-Third-Party-Script-Timings": ["items-uncapped"],
  "Loading/Inline-Script-Info-and-Size": ["items-uncapped"],
  "Loading/Resource-Hints": ["items-uncapped"],
  "Loading/Script-Loading": ["items-uncapped"],
  "Loading/TTFB-Resources": ["items-uncapped"],
  "Media/Image-Element-Audit": ["items-uncapped"],
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
