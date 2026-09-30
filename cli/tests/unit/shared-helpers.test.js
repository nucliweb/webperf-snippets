import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const { extractBlocks, verifySharedHelpers, CANONICAL_PATH } = require(join(ROOT, "scripts/shared-helpers.js"));

// Builds the canonical helpers as real functions, the way a snippet sees them.
function load(names, hostname = "www.example.com") {
  const { blocks } = extractBlocks(readFileSync(CANONICAL_PATH, "utf8"));
  const body = names.map((n) => blocks[n]).join("\n");
  return new Function("location", `${body}\nreturn { ${names.join(", ")} };`)({ hostname });
}

describe("getRootDomain", () => {
  const { getRootDomain } = load(["getRootDomain"]);
  it.each([
    ["www.example.com", "example.com"],
    ["a.b.c.example.com", "example.com"],
    ["example.com", "example.com"],
    ["localhost", "localhost"],
    ["www.example.co.uk", "example.co.uk"],
    ["static.example.ac.uk", "example.ac.uk"],
    ["shop.example.com.au", "example.com.au"],
    ["www.example.or.jp", "example.or.jp"],
    ["www.example.ne.jp", "example.ne.jp"],
    ["www.example.go.kr", "example.go.kr"],
    ["www.example.mil.br", "example.mil.br"],
    ["learn.go.dev", "go.dev"],
    ["www.example.com.", "example.com"],
  ])("%s -> %s", (host, root) => expect(getRootDomain(host)).toBe(root));

  it("keeps every IPv4 address as its own root", () => {
    expect(getRootDomain("10.0.0.1")).toBe("10.0.0.1");
    expect(getRootDomain("172.16.0.1")).toBe("172.16.0.1");
    expect(getRootDomain("192.168.1.10")).toBe("192.168.1.10");
    expect(getRootDomain("10.0.0.1")).not.toBe(getRootDomain("172.16.0.1"));
  });

  it("keeps an IPv6 address as its own root", () => {
    expect(getRootDomain("[::1]")).toBe("[::1]");
    expect(getRootDomain("[2001:db8::1]")).toBe("[2001:db8::1]");
  });
});

describe("isFirstParty", () => {
  it("matches subdomains of the page's root domain", () => {
    const { isFirstParty } = load(["getRootDomain", "isFirstParty"], "www.example.co.uk");
    expect(isFirstParty("cdn.example.co.uk")).toBe(true);
    expect(isFirstParty("other.co.uk")).toBe(false);
  });
  it("does not treat two different IPs as the same party", () => {
    const { isFirstParty } = load(["getRootDomain", "isFirstParty"], "10.0.0.1");
    expect(isFirstParty("10.0.0.1")).toBe(true);
    expect(isFirstParty("172.16.0.1")).toBe(false);
  });
});

describe("formatBytes", () => {
  const { formatBytes } = load(["formatBytes"]);
  it("shows a real zero as 0 B", () => expect(formatBytes(0)).toBe("0 B"));
  it("shows an unknown size as a dash", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(undefined)).toBe("-");
    expect(formatBytes(NaN)).toBe("-");
  });
  it("uses one decimal and goes up to GB", () => {
    expect(formatBytes(512)).toBe("512.0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5120.0 GB");
  });
  it("never prints undefined for sub-byte values", () => expect(formatBytes(0.4)).toBe("0.4 B"));
});

describe("verifySharedHelpers", () => {
  const canonical = readFileSync(CANONICAL_PATH, "utf8");
  const fmt = extractBlocks(canonical).blocks.formatBytes;
  const indented = fmt
    .split("\n")
    .map((l) => (l ? "  " + l : l))
    .join("\n");

  function project(snippetBody) {
    const dir = mkdtempSync(join(tmpdir(), "shared-"));
    mkdirSync(join(dir, "Loading"));
    mkdirSync(join(dir, "_shared"));
    writeFileSync(join(dir, "_shared", "helpers.js"), canonical);
    writeFileSync(join(dir, "Loading", "A.js"), snippetBody);
    return dir;
  }
  const wrap = (body) =>
    `(() => {\n  // @shared formatBytes\n${body}\n  // @end-shared formatBytes\n  return 1;\n})();\n`;

  it("accepts a copy identical to the canonical block, whatever its indentation", () => {
    const errors = [];
    verifySharedHelpers(errors, { snippetsDir: project(wrap(indented)) });
    expect(errors).toEqual([]);
  });

  it("reports a copy that differs", () => {
    const errors = [];
    verifySharedHelpers(errors, { snippetsDir: project(wrap(indented.replace("toFixed(1)", "toFixed(2)"))) });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Loading\/A\.js.*formatBytes/);
  });

  it("reports an unknown helper name", () => {
    const errors = [];
    const dir = project("// @shared nope\nfunction x(){}\n// @end-shared nope\n");
    verifySharedHelpers(errors, { snippetsDir: dir });
    expect(errors[0]).toMatch(/unknown shared helper "nope"/);
  });

  it("reports a marker that is never closed", () => {
    const errors = [];
    verifySharedHelpers(errors, { snippetsDir: project("// @shared formatBytes\nfunction formatBytes(){}\n") });
    expect(errors[0]).toMatch(/not closed/);
  });

  it("reports a private copy of a shared helper that has no marker", () => {
    const errors = [];
    verifySharedHelpers(errors, {
      snippetsDir: project("(() => {\n  const formatBytes = (b) => b + 'B';\n})();\n"),
    });
    expect(errors[0]).toMatch(/formatBytes.*without/);
  });
});

describe("the repository", () => {
  it("has every shared copy in sync", () => {
    const errors = [];
    verifySharedHelpers(errors, { snippetsDir: join(ROOT, "snippets") });
    expect(errors).toEqual([]);
  });
});
