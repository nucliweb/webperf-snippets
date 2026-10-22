import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SNIPPET_DIRS } from "../../src/load-snippet.js";
import { withOwnDomains, parseOwnDomains } from "../../src/own-domains.js";

// The repository's snippets/, the source the published package copies
const SNIPPETS = SNIPPET_DIRS[1];
const DECLARATION = "const OWN_DOMAINS = [];";

const snippetsWithOwnDomains = readdirSync(SNIPPETS, { recursive: true })
  .filter((file) => file.endsWith(".js") && !file.startsWith("_shared"))
  .map((file) => ({ file, source: readFileSync(join(SNIPPETS, file), "utf8") }))
  .filter(({ source }) => source.includes("OWN_DOMAINS"));

describe("the snippets that read OWN_DOMAINS", () => {
  it("are found", () => {
    expect(snippetsWithOwnDomains.length).toBeGreaterThanOrEqual(7);
  });

  // --own-domains replaces this exact line; a snippet that declares the list another way would ignore it
  it.each(snippetsWithOwnDomains)("$file declares the empty list exactly once, as --own-domains expects", ({ source }) => {
    expect(source.split(DECLARATION)).toHaveLength(2);
  });
});

describe("withOwnDomains", () => {
  const source = `(() => {\n  ${DECLARATION}\n  return OWN_DOMAINS;\n})()`;

  it("declares the domains given in place of the empty list", () => {
    expect(withOwnDomains(source, ["cdn.example.net"])).toContain('const OWN_DOMAINS = ["cdn.example.net"];');
  });

  it("leaves the source as it is without domains, and a snippet without the list", () => {
    expect(withOwnDomains(source, [])).toBe(source);
    expect(withOwnDomains(source, undefined)).toBe(source);
    expect(withOwnDomains("(() => 1)()", ["cdn.example.net"])).toBe("(() => 1)()");
  });

  it("keeps a domain with quotes inside the string", () => {
    expect(eval(withOwnDomains(source, ['a"b.example.net']))).toEqual(['a"b.example.net']);
  });
});

describe("parseOwnDomains", () => {
  it("splits each value on commas and trims the domains", () => {
    expect(parseOwnDomains(["cdn.example.net, static.example.org", "https://img.example.com/"])).toEqual([
      "cdn.example.net",
      "static.example.org",
      "https://img.example.com/",
    ]);
  });

  it("returns null for an empty domain or one with spaces", () => {
    expect(parseOwnDomains([""])).toBeNull();
    expect(parseOwnDomains(["cdn.example.net,,other.example"])).toBeNull();
    expect(parseOwnDomains(["other example"])).toBeNull();
  });
});
