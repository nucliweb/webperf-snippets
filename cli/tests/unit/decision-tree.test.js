import { describe, it, expect } from "vitest";
import { nextSteps } from "../../src/decision-tree.js";

describe("nextSteps", () => {
  it("returns empty array when no rules match", () => {
    const results = [{ id: "LCP", status: "ok", value: 1200 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("appends LCP-Subparts when LCP > 2500ms", () => {
    const results = [{ id: "LCP", status: "ok", value: 3000 }];
    const steps = nextSteps(results);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("LCP-Subparts");
    expect(steps[0].path).toBe("CoreWebVitals/LCP-Subparts");
    expect(steps[0].reason).toMatch(/LCP > 2\.5s/);
  });

  it("does not append LCP-Subparts when LCP === 2500ms (boundary)", () => {
    const results = [{ id: "LCP", status: "ok", value: 2500 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("does not append LCP-Subparts when LCP status is error", () => {
    const results = [{ id: "LCP", status: "error", value: 3000 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("handles empty results", () => {
    expect(nextSteps([])).toEqual([]);
  });

  // TTFB rule
  it("appends ttfb-subparts when TTFB > 600ms", () => {
    const results = [{ id: "TTFB", status: "ok", value: 601 }];
    const steps = nextSteps(results);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("ttfb-subparts");
    expect(steps[0].path).toBe("Loading/TTFB-Sub-Parts");
    expect(steps[0].reason).toMatch(/TTFB > 600ms/);
  });

  it("does not append ttfb-subparts when TTFB === 600ms (boundary)", () => {
    const results = [{ id: "TTFB", status: "ok", value: 600 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("does not append ttfb-subparts when TTFB status is error", () => {
    const results = [{ id: "TTFB", status: "error", value: 800 }];
    expect(nextSteps(results)).toEqual([]);
  });

  // FCP rule
  it("appends render-blocking when FCP > 1800ms", () => {
    const results = [{ id: "FCP", status: "ok", value: 1801 }];
    const steps = nextSteps(results);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("render-blocking");
    expect(steps[0].path).toBe("Loading/Find-render-blocking-resources");
    expect(steps[0].reason).toMatch(/FCP > 1\.8s/);
  });

  it("does not append render-blocking when FCP === 1800ms (boundary)", () => {
    const results = [{ id: "FCP", status: "ok", value: 1800 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("does not append render-blocking when FCP status is error", () => {
    const results = [{ id: "FCP", status: "error", value: 2000 }];
    expect(nextSteps(results)).toEqual([]);
  });

  it("fires multiple rules in a single call when several results match", () => {
    const results = [
      { id: "LCP", status: "ok", value: 3000 },
      { id: "TTFB", status: "ok", value: 700 },
    ];
    const steps = nextSteps(results);
    expect(steps.map((s) => s.id)).toEqual(["LCP-Subparts", "ttfb-subparts"]);
  });

  // LCP element rules
  const lcp = (details, value = 1500) => ({ id: "LCP", status: "ok", value, details });
  const ids = (results) => nextSteps(results).map((s) => s.id);

  it("checks the entropy and the attributes of the LCP image when the LCP element is an image", () => {
    const steps = nextSteps([lcp({ elementType: "Image", url: "https://x.test/hero.jpg" })]);
    expect(steps.map((s) => s.id)).toEqual(["LCP-Image-Entropy", "image-audit"]);
    expect(steps.map((s) => s.path)).toEqual(["CoreWebVitals/LCP-Image-Entropy", "Media/Image-Element-Audit"]);
    expect(steps.every((s) => /LCP is an image/.test(s.reason))).toBe(true);
  });

  it("checks the video when the LCP element is the poster of a video", () => {
    const steps = nextSteps([lcp({ elementType: "Video poster", url: "https://x.test/poster.jpg" })]);
    expect(steps.map((s) => s.path)).toEqual(["CoreWebVitals/LCP-Video-Candidate", "Media/Video-Element-Audit"]);
    expect(steps.every((s) => /LCP is a video/.test(s.reason))).toBe(true);
  });

  it("adds nothing for an LCP that is text or a CSS background", () => {
    expect(ids([lcp({ elementType: "Text block", url: null })])).toEqual([]);
    expect(ids([lcp({ elementType: "h3", url: null })])).toEqual([]);
    expect(ids([lcp({ elementType: "Background image", url: "https://x.test/bg.jpg" })])).toEqual([]);
  });

  it("does not read the element of an LCP that failed or has no details", () => {
    expect(ids([{ id: "LCP", status: "error", details: { elementType: "Image" } }])).toEqual([]);
    expect(ids([{ id: "LCP", status: "ok", value: 1500 }])).toEqual([]);
  });

  // LCP poor
  it("lists the LCP candidates when LCP > 4000ms, and not at the boundary", () => {
    expect(ids([lcp({}, 4001)])).toEqual(["LCP-Subparts", "LCP-Trail"]);
    expect(ids([lcp({}, 4000)])).toEqual(["LCP-Subparts"]);
    expect(nextSteps([lcp({}, 4001)])[1].reason).toMatch(/LCP > 4s/);
  });

  // CLS rules
  const cls = (value) => ({ id: "CLS", status: "ok", value });

  it("separates the layout shifts of the load from those of the interactions when CLS > 0.1", () => {
    const steps = nextSteps([cls(0.11)]);
    expect(steps.map((s) => s.id)).toEqual(["layout-shifts"]);
    expect(steps[0].path).toBe("Interaction/Layout-Shift-Loading-and-Interaction");
    expect(steps[0].reason).toMatch(/CLS > 0\.1/);
  });

  it("does not add the layout shift steps at CLS === 0.1 (boundary) or for a failed CLS", () => {
    expect(ids([cls(0.1)])).toEqual([]);
    expect(ids([{ id: "CLS", status: "error", value: 0.5 }])).toEqual([]);
    expect(ids([{ id: "CLS", status: "unsupported" }])).toEqual([]);
  });

  it("looks for the usual causes of a poor CLS when CLS > 0.25", () => {
    const steps = nextSteps([cls(0.26)]);
    expect(steps.map((s) => s.id)).toEqual(["layout-shifts", "lazy-atf", "fonts", "critical-css", "image-audit"]);
    expect(steps.slice(1).every((s) => /CLS > 0\.25/.test(s.reason))).toBe(true);
    expect(ids([cls(0.25)])).toEqual(["layout-shifts"]);
  });

  it("does not repeat a step that two rules ask for", () => {
    const all = ids([lcp({ elementType: "Image", url: "https://x.test/a.jpg" }), cls(0.3)]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((id) => id === "image-audit")).toHaveLength(1);
  });
});
