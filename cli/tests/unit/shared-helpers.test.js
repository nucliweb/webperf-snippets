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
function load(names, hostname = "www.example.com", ownDomains = []) {
  const { blocks } = extractBlocks(readFileSync(CANONICAL_PATH, "utf8"));
  const body = names.map((n) => blocks[n]).join("\n");
  return new Function("location", "OWN_DOMAINS", `${body}\nreturn { ${names.join(", ")} };`)({ hostname }, ownDomains);
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
  it("counts the domains listed in OWN_DOMAINS as first party, as domains or URLs in any case", () => {
    const { isFirstParty } = load(["getRootDomain", "isFirstParty"], "www.example.com", ["example.net", "https://Static.Example.org/assets/"]);
    expect(isFirstParty("img.example.net")).toBe(true);
    expect(isFirstParty("cdn.example.org")).toBe(true);
    expect(isFirstParty("ads.other.co.uk")).toBe(false);
  });
  it("keeps the root domain of the page first party when OWN_DOMAINS lists other domains", () => {
    const { isFirstParty } = load(["getRootDomain", "isFirstParty"], "www.example.com", ["example.net"]);
    expect(isFirstParty("static.example.com")).toBe(true);
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

describe("createInteractionTracker", () => {
  // Event Timing entries as Chrome reports a tap whose click handler runs for 250 ms: the
  // three events share the interactionId and end in the same frame, and their durations are
  // rounded to 8 ms. Only the click entry has the processing.
  const entry = (name, startTime, processingStart, processingEnd, duration, interactionId = 7) => ({
    name,
    startTime,
    processingStart,
    processingEnd,
    duration,
    interactionId,
    target: null,
  });
  const slowTap = () => [
    entry("pointerdown", 100, 101, 101.5, 264),
    entry("pointerup", 102, 102.1, 102.3, 264),
    entry("click", 102, 102.4, 352.4, 264),
  ];
  const tracker = () => load(["createInteractionTracker"]).createInteractionTracker();

  it("measures the phases over all the entries of the interaction", () => {
    const t = tracker();
    t.add(slowTap());
    const [interaction] = t.list();
    expect(interaction.interactionId).toBe(7);
    expect(interaction.duration).toBe(264);
    expect(interaction.startTime).toBe(100);
    expect(interaction.phases.inputDelay).toBeCloseTo(1, 5);
    expect(interaction.phases.processingTime).toBeCloseTo(251.4, 5);
    expect(interaction.phases.presentationDelay).toBeCloseTo(11.6, 5);
  });

  it("reports the event whose handler did the work", () => {
    const t = tracker();
    t.add(slowTap());
    expect(t.list()[0].name).toBe("click");
  });

  it("reports the click when no handler does significant work", () => {
    const t = tracker();
    t.add([
      entry("pointerdown", 100, 101, 101.2, 24),
      entry("pointerup", 102, 102.1, 102.6, 24),
      entry("click", 102, 102.7, 103, 24),
    ]);
    expect(t.list()[0].name).toBe("click");
  });

  it("reports pointerdown when its handler is the slow one", () => {
    const t = tracker();
    t.add([
      entry("pointerdown", 100, 101, 301, 216),
      entry("pointerup", 102, 301.2, 301.4, 216),
      entry("click", 102, 301.5, 301.8, 216),
    ]);
    expect(t.list()[0].name).toBe("pointerdown");
  });

  it("counts an interaction once when its entries arrive in separate callbacks", () => {
    const t = tracker();
    const [down, up, click] = slowTap();
    t.add([down]);
    const updated = t.add([up, click]);
    expect(t.list()).toHaveLength(1);
    expect(updated.map((i) => i.interactionId)).toEqual([7]);
    expect(t.list()[0].name).toBe("click");
    expect(t.list()[0].phases.processingTime).toBeCloseTo(251.4, 5);
  });

  it("leaves out the entries painted in another frame, such as a key held down", () => {
    const t = tracker();
    t.add([entry("keydown", 0, 1, 2, 16, 9), entry("keyup", 500, 501, 790, 304, 9)]);
    const [interaction] = t.list();
    expect(interaction.name).toBe("keyup");
    expect(interaction.duration).toBe(304);
    expect(interaction.startTime).toBe(500);
    expect(interaction.phases.inputDelay).toBeCloseTo(1, 5);
    expect(interaction.phases.processingTime).toBeCloseTo(289, 5);
    expect(interaction.phases.presentationDelay).toBeCloseTo(14, 5);
  });

  it("never reports a negative presentation delay and has no floor", () => {
    const t = tracker();
    t.add([entry("click", 0, 10, 150, 104, 3), entry("click", 300, 300.5, 301, 0, 4)]);
    const [late, instant] = t.list();
    expect(late.phases.presentationDelay).toBe(0);
    expect(instant.phases.presentationDelay).toBe(0);
  });

  it("ignores entries without an interactionId", () => {
    const t = tracker();
    expect(t.add([entry("mousemove", 0, 1, 2, 16, 0)])).toEqual([]);
    expect(t.list()).toEqual([]);
  });

  it("keeps the target of the reported entry, or of any entry that has one", () => {
    const t = tracker();
    const [down, up, click] = slowTap();
    t.add([{ ...down, target: "button" }, up, click]);
    expect(t.list()[0].target).toBe("button");
  });
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
