import { describe, it, expect } from "vitest";
import { reportJson } from "../../src/reporters/json.js";
import { reportHuman } from "../../src/reporters/human.js";
import { reportMarkdown } from "../../src/reporters/markdown.js";

const samplePayload = {
  url: "https://web.dev",
  navMs: 850,
  results: [
    { id: "LCP", status: "ok", metric: "LCP", value: 1200, unit: "ms", rating: "good" },
    { id: "CLS", status: "ok", metric: "CLS", value: 0, unit: "score", rating: "good" },
  ],
  pageErrors: [],
};

describe("reportJson", () => {
  it("returns valid JSON", () => {
    const output = reportJson(samplePayload);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("includes url, navMs, and results", () => {
    const parsed = JSON.parse(reportJson(samplePayload));
    expect(parsed.url).toBe("https://web.dev");
    expect(parsed.navMs).toBe(850);
    expect(parsed.results).toHaveLength(2);
  });

  it("preserves result fields", () => {
    const parsed = JSON.parse(reportJson(samplePayload));
    expect(parsed.results[0]).toMatchObject({
      id: "LCP",
      status: "ok",
      metric: "LCP",
      value: 1200,
      unit: "ms",
      rating: "good",
    });
  });
});

describe("reportHuman", () => {
  it("includes the URL in the output", () => {
    const output = reportHuman(samplePayload);
    expect(output).toContain("https://web.dev");
  });

  it("includes metric IDs", () => {
    const output = reportHuman(samplePayload);
    expect(output).toContain("LCP");
    expect(output).toContain("CLS");
  });

  it("reports error results", () => {
    const payload = {
      ...samplePayload,
      results: [{ id: "LCP", status: "error", error: "No LCP entries buffered" }],
    };
    const output = reportHuman(payload);
    expect(output).toContain("No LCP entries buffered");
  });

  it("reports page errors section when present", () => {
    const payload = { ...samplePayload, pageErrors: ["TypeError: x is not defined"] };
    const output = reportHuman(payload);
    expect(output).toContain("TypeError: x is not defined");
  });

  it("renders fonts snippet result with counts and issues", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "fonts",
          script: "Fonts-Preloaded-Loaded-and-used-above-the-fold",
          status: "ok",
          count: 2,
          details: { preloadedCount: 1, loadedCount: 2, usedAboveFoldCount: 2, preloadedNotUsedCount: 1, usedNotPreloadedCount: 0 },
          items: [],
          issues: [{ severity: "warning", message: "Preloaded but not used above fold: font.woff2" }],
        },
      ],
      pageErrors: [],
    };
    const output = reportHuman(payload);
    expect(output).toContain("preloaded: 1");
    expect(output).toContain("loaded: 2");
    expect(output).toContain("Preloaded but not used above fold: font.woff2");
  });

  it("renders fonts snippet result with no issues as optimized", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "Fonts-Preloaded-Loaded-and-used-above-the-fold",
          script: "Fonts-Preloaded-Loaded-and-used-above-the-fold",
          status: "ok",
          count: 1,
          details: { preloadedCount: 1, loadedCount: 1, usedAboveFoldCount: 1, preloadedNotUsedCount: 0, usedNotPreloadedCount: 0 },
          items: [],
          issues: [],
        },
      ],
      pageErrors: [],
    };
    const output = reportHuman(payload);
    expect(output).toContain("Font loading looks optimized");
  });

  it("renders audit result with no issues as passing", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "render-blocking",
          script: "Find-render-blocking-resources",
          status: "ok",
          count: 0,
          details: { totalBlockingUntilMs: 0, totalSizeBytes: 0, byType: {} },
          items: [],
          issues: [],
        },
      ],
      pageErrors: [],
    };
    const output = reportHuman(payload);
    expect(output).toContain("render-blocking");
    expect(output).toContain("No issues");
  });

  it("renders audit result with error issues showing the message", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "lazy-conflict",
          script: "Find-Images-With-Lazy-and-Fetchpriority",
          status: "ok",
          count: 2,
          items: [],
          issues: [{ severity: "error", message: "2 element(s) have conflicting loading=\"lazy\" and fetchpriority=\"high\"" }],
        },
      ],
      pageErrors: [],
    };
    const output = reportHuman(payload);
    expect(output).toContain("lazy-conflict");
    expect(output).toContain("2 element(s) have conflicting");
  });

  it("renders audit result with warning issues", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "eager-below-fold",
          script: "Find-non-Lazy-Loaded-Images-outside-of-the-viewport",
          status: "ok",
          count: 5,
          items: [],
          issues: [{ severity: "warning", message: "5 image(s) outside the viewport are missing loading=\"lazy\"" }],
        },
      ],
      pageErrors: [],
    };
    const output = reportHuman(payload);
    expect(output).toContain("eager-below-fold");
    expect(output).toContain("5 image(s) outside the viewport");
  });
});

describe("reportMarkdown", () => {
  it("includes the URL as an h2 heading", () => {
    const output = reportMarkdown(samplePayload);
    expect(output).toContain("## WebPerf Results — https://web.dev");
  });

  it("includes navMs in the header", () => {
    const output = reportMarkdown(samplePayload);
    expect(output).toContain("850ms");
  });

  it("renders metric results as a markdown table with pipe syntax", () => {
    const output = reportMarkdown(samplePayload);
    expect(output).toContain("| Metric | Value | Status |");
    expect(output).toContain("| LCP |");
    expect(output).toContain("| CLS |");
  });

  it("formats ms values — uses seconds when >= 1000ms", () => {
    const payload = {
      ...samplePayload,
      results: [{ id: "LCP", status: "ok", metric: "LCP", value: 2300, unit: "ms", rating: "good" }],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("2.30s");
  });

  it("formats ms values — keeps ms when < 1000ms", () => {
    const payload = {
      ...samplePayload,
      results: [{ id: "LCP", status: "ok", metric: "LCP", value: 850, unit: "ms", rating: "good" }],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("850ms");
  });

  it("uses ✅ for good, ⚠️ for needs-improvement, ❌ for poor", () => {
    const payload = {
      ...samplePayload,
      results: [
        { id: "LCP", status: "ok", metric: "LCP", value: 1200, unit: "ms", rating: "good" },
        { id: "FCP", status: "ok", metric: "FCP", value: 2000, unit: "ms", rating: "needs-improvement" },
        { id: "CLS", status: "ok", metric: "CLS", value: 0.3, unit: "score", rating: "poor" },
      ],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("✅");
    expect(output).toContain("⚠️");
    expect(output).toContain("❌");
  });

  it("renders audit results with Check/Status/Issues columns", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "render-blocking",
          status: "ok",
          count: 0,
          issues: [],
        },
      ],
      pageErrors: [],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("| Check | Status | Issues |");
    expect(output).toContain("render-blocking");
    expect(output).toContain("🟢 pass");
    expect(output).toContain("No issues");
  });

  it("renders audit errors with 🔴 fail", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        {
          id: "lazy-conflict",
          status: "ok",
          count: 2,
          issues: [{ severity: "error", message: "2 conflicting elements" }],
        },
      ],
      pageErrors: [],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("🔴 fail");
    expect(output).toContain("2 conflicting elements");
  });

  it("renders snippet errors with ❌ error and the message", () => {
    const payload = {
      ...samplePayload,
      results: [{ id: "LCP", status: "error", error: "No LCP entries buffered" }],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("❌ error");
    expect(output).toContain("No LCP entries buffered");
  });

  it("renders page errors in a separate section", () => {
    const payload = { ...samplePayload, pageErrors: ["TypeError: x is not defined"] };
    const output = reportMarkdown(payload);
    expect(output).toContain("### ⚠ Page Errors");
    expect(output).toContain("- TypeError: x is not defined");
  });

  it("renders follow-up results in a separate section with the reason", () => {
    const payload = {
      url: "https://web.dev",
      navMs: 500,
      results: [
        { id: "LCP", status: "ok", metric: "LCP", value: 2600, unit: "ms", rating: "poor" },
        { id: "LCP-Subparts", status: "ok", metric: "LCP", value: 2600, unit: "ms", rating: "poor", reason: "LCP > 2.5s — drilling into sub-parts" },
      ],
      pageErrors: [],
    };
    const output = reportMarkdown(payload);
    expect(output).toContain("### Results");
    expect(output).toContain("### Follow-up *(LCP > 2.5s — drilling into sub-parts)*");
    expect(output).toContain("LCP-Subparts");
  });

  it("omits the page errors section when there are no page errors", () => {
    const output = reportMarkdown(samplePayload);
    expect(output).not.toContain("Page Errors");
  });
});

describe("a skipped result", () => {
  const skipped = {
    ...samplePayload,
    results: [
      ...samplePayload.results,
      { id: "interactions", status: "skipped", reason: "The interactions have no click or type step" },
    ],
  };

  it("shows in the human report with its reason, and not as an error", () => {
    const output = reportHuman(skipped);
    expect(output).toContain("interactions");
    expect(output).toContain("skipped");
    expect(output).toContain("The interactions have no click or type step");
    expect(output).not.toContain("✗");
  });

  it("shows in the markdown report as skipped with its reason, and not as an error", () => {
    const output = reportMarkdown(skipped);
    expect(output).toMatch(/\| interactions \| .*skipped .*\| The interactions have no click or type step \|/);
    expect(output).not.toContain("❌");
  });

  it("is kept as it is in the JSON report", () => {
    const parsed = JSON.parse(reportJson(skipped));
    expect(parsed.results.at(-1)).toEqual({
      id: "interactions",
      status: "skipped",
      reason: "The interactions have no click or type step",
    });
  });
});

describe("the human report for the Interaction snippets", () => {
  const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
  const payload = (results) => ({ url: "https://web.dev", navMs: 100, results, pageErrors: [] });

  it("summarizes a result that has a count and details but no value and no issues", () => {
    const output = strip(
      reportHuman(
        payload([
          {
            id: "long-tasks",
            status: "ok",
            count: 4,
            details: { totalBlockingTimeMs: 36, worstTaskMs: 77, bySeverity: { low: 4 } },
            items: [{ startTimeMs: 2271, durationMs: 77, severity: "low" }],
          },
        ])
      )
    );
    expect(output).not.toContain("undefined");
    expect(output).toMatch(/long-tasks\s+4/);
    expect(output).toContain("totalBlockingTimeMs 36");
    expect(output).toContain("worstTaskMs 77");
    expect(output).not.toContain("bySeverity");
  });

  it("says there is nothing to report for a result with a count of 0", () => {
    const output = strip(reportHuman(payload([{ id: "long-tasks", status: "ok", count: 0, details: {}, items: [] }])));
    expect(output).not.toContain("undefined");
    expect(output).toMatch(/long-tasks\s+0/);
  });

  it("lists the items of a result that names them by kind, target and detail", () => {
    const output = strip(
      reportHuman(
        payload([
          {
            id: "scroll",
            status: "ok",
            details: {},
            issues: [{ severity: "warning", message: "2 non-passive listener(s)" }],
            items: [{ kind: "non-passive-listener", target: "Window", detail: "touchstart" }],
          },
        ])
      )
    );
    expect(output).toContain("non-passive-listener");
    expect(output).toContain("Window");
    expect(output).toContain("touchstart");
    expect(output).not.toMatch(/·\s*$/m);
  });
});
