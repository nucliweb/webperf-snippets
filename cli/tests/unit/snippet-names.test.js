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

  it.each([
    ["Largest-Contentful-Paint", "CoreWebVitals/LCP"],
    ["Cumulative-Layout-Shift", "CoreWebVitals/CLS"],
    ["Interaction-to-Next-Paint", "CoreWebVitals/INP"],
    ["First-Contentful-Paint", "Loading/FCP"],
    ["Time-to-First-Byte", "Loading/TTFB"],
  ])("resolves the full name of a metric, %s, in any case", (name, path) => {
    expect(resolveSnippetName(name)).toBe(path);
    expect(resolveSnippetName(name.toLowerCase())).toBe(path);
    expect(resolveSnippetName(name.toUpperCase())).toBe(path);
    expect(resolveSnippetName(name.replace(/-(.)/g, (_, c) => `-${c.toUpperCase()}`))).toBe(path);
  });

  it("keeps a snippet name before an alias in another case", () => {
    expect(resolveSnippetName("TTFB")).toBe("Loading/TTFB");
    expect(resolveSnippetName("ttfb")).toBe("Loading/TTFB-Sub-Parts");
    expect(resolveSnippetName("Ttfb")).toBe("Loading/TTFB");
    expect(resolveSnippetName("RENDER-BLOCKING")).toBe("Loading/Find-render-blocking-resources");
  });

  it("finds a real snippet asked under the wrong category", () => {
    expect(resolveSnippetName("Loading/LCP-Subparts")).toBe("CoreWebVitals/LCP-Subparts");
    expect(resolveSnippetName("loading/lcp-subparts")).toBe("CoreWebVitals/LCP-Subparts");
    expect(resolveSnippetName("Media/render-blocking")).toBe("Loading/Find-render-blocking-resources");
  });

  it("does not take any other prefix for a category", () => {
    expect(() => resolveSnippetName("../LCP-Subparts")).toThrow(/Unknown snippet/);
    expect(() => resolveSnippetName("Nope/LCP-Subparts")).toThrow(/Unknown snippet/);
    expect(() => resolveSnippetName("Loading/CoreWebVitals/LCP-Subparts")).toThrow(/Unknown snippet/);
  });
});

describe("the suggestions for an unknown snippet", () => {
  const suggestionsFor = (name) => {
    try {
      resolveSnippetName(name);
    } catch (err) {
      return err.message.match(/Closest: (.+?)\. /)?.[1].split(", ") ?? [];
    }
    throw new Error(`${name} resolved`);
  };
  const isImageSnippet = (path) => /image/i.test(path);

  // The guesses agents made in the evals of the MCP server
  it("reaches the image snippets from Image-Loading-Priority", () => {
    const suggestions = suggestionsFor("Image-Loading-Priority");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(isImageSnippet)).toBe(true);
    expect(suggestions).toContain("Loading/Find-Images-With-Lazy-and-Fetchpriority");
    expect(suggestions).toContain("Loading/Find-Above-The-Fold-Lazy-Loaded-Images");
  });

  it("reaches the image snippets from Image-Loading-Audit, the audit first", () => {
    const suggestions = suggestionsFor("Image-Loading-Audit");
    expect(suggestions[0]).toBe("Media/Image-Element-Audit");
    expect(suggestions.every(isImageSnippet)).toBe(true);
  });

  it.each(["Scripts", "scripts"])("reaches the script snippets from %s", (guess) => {
    const suggestions = suggestionsFor(guess);
    expect(suggestions[0]).toBe("Loading/Script-Loading");
    expect(suggestions.length).toBeGreaterThan(1);
    expect(suggestions.every((path) => /script/i.test(path))).toBe(true);
  });

  it("reaches LongTask from long-tasks", () => {
    expect(suggestionsFor("long-tasks")[0]).toBe("Interaction/LongTask");
  });

  it("uses the words of the aliases", () => {
    expect(suggestionsFor("Eager-Below-Fold-Check")[0]).toBe("Loading/Find-non-Lazy-Loaded-Images-outside-of-the-viewport");
  });

  it("does not let a word that says nothing of the snippet reach it", () => {
    expect(suggestionsFor("Font-Audit").sort()).toEqual(["Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold", "Loading/Webfont-Usage-Analyzer"]);
    expect(suggestionsFor("Script-Audit")).not.toContain("Loading/Compression-Audit");
  });

  it("does not mix a name spelled alike with the ones that have the word", () => {
    expect(suggestionsFor("CSS")).not.toContain("CoreWebVitals/CLS");
    expect(suggestionsFor("Hints")).not.toContain("Loading/Fonts-Preloaded-Loaded-and-used-above-the-fold");
  });

  it("does not take a short word for its neighbour, or a word for a part of it", () => {
    expect(suggestionsFor("Size")).not.toContain("Loading/Client-Side-Redirect-Detection");
    expect(suggestionsFor("Preload")).not.toContain("Loading/Script-Loading");
    expect(suggestionsFor("Preload")).toContain("Loading/Validate-Preload-Async-Defer-Scripts");
  });

  it("offers a real snippet under a category that does not exist", () => {
    expect(suggestionsFor("Nope/LCP-Subparts")[0]).toBe("CoreWebVitals/LCP-Subparts");
  });

  it.each([
    ["Compresion-Audit", "Loading/Compression-Audit"],
    ["Compression-Audt", "Loading/Compression-Audit"],
    ["Compressoin-Audit", "Loading/Compression-Audit"],
    ["LPC", "CoreWebVitals/LCP"],
    ["LCPP", "CoreWebVitals/LCP"],
    ["CSL", "CoreWebVitals/CLS"],
    ["IPN", "CoreWebVitals/INP"],
    ["TTBF", "Loading/TTFB"],
    ["FPC", "Loading/FCP"],
    ["LCP-Subpart", "CoreWebVitals/LCP-Subparts"],
    ["LCP-Sub-Parts", "CoreWebVitals/LCP-Subparts"],
    ["LCP_Subparts", "CoreWebVitals/LCP-Subparts"],
    ["LCPSubparts", "CoreWebVitals/LCP-Subparts"],
    ["lcpsubparts", "CoreWebVitals/LCP-Subparts"],
    ["TTFB-Subparts", "Loading/TTFB-Sub-Parts"],
    ["Long-Animation-Frame", "Interaction/Long-Animation-Frames"],
    ["Long-Task", "Interaction/LongTask"],
    ["LongTasks", "Interaction/LongTask"],
    ["Scroll-Perfomance", "Interaction/Scroll-Performance"],
    ["Resorce-Hints", "Loading/Resource-Hints"],
    ["Resource-Hint-Validation", "Loading/Resource-Hints-Validation"],
    ["Webfont-Usage-Analyser", "Loading/Webfont-Usage-Analyzer"],
    ["Cache-Strategy-Analisis", "Loading/Cache-Strategy-Analysis"],
    ["render-blockng", "Loading/Find-render-blocking-resources"],
    ["prioritiy-hints", "Loading/Priority-Hints-Audit"],
    ["Oversize-Images", "Media/Oversized-Images"],
    ["Image-Elment-Audit", "Media/Image-Element-Audit"],
    ["Back-Forward-Cach", "Loading/Back-Forward-Cache"],
    ["DOM-Size", "Interaction/DOM-Size-and-Depth"],
    ["Service-Workers", "Loading/Service-Worker-Analysis"],
    ["Speculation-Rules", "Loading/Speculation-Rules-Inspector"],
    ["JS-Execution-Time", "Loading/JS-Execution-Time-Breakdown"],
    ["Input-Latency", "Interaction/Input-Latency-Breakdown"],
  ])("puts the right snippet first for the typo %s", (typo, path) => {
    expect(suggestionsFor(typo)[0]).toBe(path);
  });

  it.each(["xyz", "qwerty", "banana", "foo-bar", "Nope", "Find-Slow-Things", "and", "Audit", "Loading/Nope", "../package"])(
    "offers no unrelated names for %s, and says where the names are",
    (guess) => {
      expect(suggestionsFor(guess)).toEqual([]);
      expect(() => resolveSnippetName(guess)).toThrow(/No snippet has a close name/);
      expect(() => resolveSnippetName(guess)).toThrow(/list_snippets/);
      expect(() => resolveSnippetName(guess)).toThrow(/llms\.txt/);
    }
  );

  it("says where the names are next to the suggestions too", () => {
    expect(() => resolveSnippetName("Scripts")).toThrow(/Closest: .*list_snippets/);
  });
});
