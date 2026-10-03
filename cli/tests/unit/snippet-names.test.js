import { describe, it, expect } from "vitest";
import { listSnippets, resolveSnippetName } from "../../src/snippet-names.js";
import { loadSnippet } from "../../src/load-snippet.js";

describe("listSnippets", () => {
  const all = listSnippets();

  it("lists every runnable snippet as Category/Name, and nothing else", () => {
    expect(all.length).toBeGreaterThanOrEqual(56);
    expect(all).toContain("Loading/Compression-Audit");
    expect(all).toContain("Interaction/DOM-Size-and-Depth");
    expect(all.every((p) => /^(CoreWebVitals|Loading|Interaction|Media|Resources)\/[A-Za-z0-9-]+$/.test(p))).toBe(true);
    expect(all.some((p) => p.includes("WORKFLOWS") || p.startsWith("DevTools-Overrides"))).toBe(false);
  });

  it("has no two snippets with the same name in different categories", () => {
    const names = all.map((p) => p.split("/")[1].toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("resolveSnippetName", () => {
  it("resolves every snippet by its bare name and by its Category/Name path", () => {
    for (const path of listSnippets()) {
      const name = path.split("/")[1];
      expect(resolveSnippetName(name)).toBe(path);
      expect(resolveSnippetName(path)).toBe(path);
      expect(() => loadSnippet(resolveSnippetName(name))).not.toThrow();
    }
  });

  it("keeps the short aliases", () => {
    expect(resolveSnippetName("LCP")).toBe("CoreWebVitals/LCP");
    expect(resolveSnippetName("fonts")).toBe("Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold");
    expect(resolveSnippetName("ttfb")).toBe("Loading/TTFB-Sub-Parts");
  });

  it("ignores case in a bare name", () => {
    expect(resolveSnippetName("compression-audit")).toBe("Loading/Compression-Audit");
    expect(resolveSnippetName("DOM-SIZE-AND-DEPTH")).toBe("Interaction/DOM-Size-and-Depth");
  });

  it("does not let a bare name that is a prefix of another snippet pick the longer one", () => {
    expect(resolveSnippetName("Resource-Hints")).toBe("Loading/Resource-Hints");
    expect(resolveSnippetName("Long-Animation-Frames")).toBe("Interaction/Long-Animation-Frames");
  });

  it("rejects an unknown name and suggests the closest snippets", () => {
    expect(() => resolveSnippetName("Compresion-Audit")).toThrow(/Unknown snippet "Compresion-Audit".*Loading\/Compression-Audit/s);
  });

  it("rejects an unknown Category/Name path instead of reading a file outside the snippets", () => {
    expect(() => resolveSnippetName("Loading/Nope")).toThrow(/Unknown snippet/);
    expect(() => resolveSnippetName("../package")).toThrow(/Unknown snippet/);
    expect(() => resolveSnippetName("Loading/../../package")).toThrow(/Unknown snippet/);
  });
});
