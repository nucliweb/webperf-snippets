import { describe, it, expect } from "vitest";
import { reportJson } from "../../src/reporters/json.js";
import { reportHuman, reportMatrixHuman } from "../../src/reporters/human.js";
import { reportMarkdown, reportMatrixMarkdown } from "../../src/reporters/markdown.js";

const samplePayload = {
  url: "https://example.com",
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
    expect(parsed.url).toBe("https://example.com");
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
    expect(output).toContain("https://example.com");
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
      url: "https://example.com",
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
      url: "https://example.com",
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
      url: "https://example.com",
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
      url: "https://example.com",
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
      url: "https://example.com",
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

  describe("the LCP sub-parts", () => {
    const subParts = (resourceLoadTime) => ({
      ...samplePayload,
      results: [
        {
          id: "LCP-Subparts",
          status: "ok",
          metric: "LCP",
          value: 2036,
          unit: "ms",
          rating: "good",
          details: {
            subParts: {
              ttfb: { value: 7, percent: 0, overTarget: false },
              resourceLoadDelay: { value: 13, percent: 1, overTarget: false },
              resourceLoadTime,
              elementRenderDelay: { value: 12, percent: 1, overTarget: false },
            },
            slowestPhase: "resourceLoadTime",
          },
        },
      ],
    });

    it("split the Resource Load Time into the wait for the server and the download", () => {
      const output = reportHuman(subParts({ value: 2004, percent: 98, overTarget: true, waiting: 2002, download: 2 }));
      expect(output).toMatch(/2002ms waiting for the server, 2ms downloading/);
    });

    it("show no split when the snippet could not measure it", () => {
      const output = reportHuman(subParts({ value: 2004, percent: 98, overTarget: true }));
      expect(output).not.toContain("waiting for the server");
    });
  });
});

describe("reportMarkdown", () => {
  it("includes the URL as an h2 heading", () => {
    const output = reportMarkdown(samplePayload);
    expect(output).toContain("## WebPerf Results — https://example.com");
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
      url: "https://example.com",
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
      url: "https://example.com",
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
      url: "https://example.com",
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

describe("the conditions of the measurement", () => {
  const throttled = { ...samplePayload, throttling: { cpu: 4, network: "slow-4g" } };

  it("are named under the header of the human report", () => {
    expect(reportHuman(throttled)).toContain("Throttling: CPU 4x, Slow 4G");
    expect(reportHuman({ ...samplePayload, throttling: { network: "3g" } })).toContain("Throttling: 3G");
    expect(reportHuman({ ...samplePayload, throttling: { cpu: 6 } })).toContain("Throttling: CPU 6x");
  });

  it("are named under the header of the markdown report", () => {
    expect(reportMarkdown(throttled)).toContain("> Throttling: CPU 4x, Slow 4G");
  });

  it("leave both reports as they were without throttling", () => {
    expect(reportHuman(samplePayload)).not.toContain("Throttling");
    expect(reportMarkdown(samplePayload)).not.toContain("Throttling");
  });
});

describe("the runs of a measurement", () => {
  const measured = {
    ...samplePayload,
    runs: {
      count: 3,
      failed: 1,
      medianRun: 2,
      medianBy: "LCP",
      summary: {
        LCP: { median: 1200, min: 980, max: 2610, values: [2610, 1200, null, 980], unit: "ms" },
        CLS: { median: 0.04, min: 0.02, max: 0.11, values: [0.11, 0.04, null, 0.02], unit: "score" },
      },
    },
  };

  it("are named under the header of the human report, with the median, min and max of each metric", () => {
    const output = reportHuman(measured);
    expect(output).toContain("3 runs, median by LCP: run 2 (1 failed)");
    expect(output).toMatch(/LCP\s+median 1\.20s\s+min 980ms\s+max 2\.61s/);
    expect(output).toMatch(/CLS\s+median 0\.0400\s+min 0\.0200\s+max 0\.1100/);
  });

  it("say run, not runs, for one run", () => {
    expect(reportHuman({ ...measured, runs: { ...measured.runs, count: 1, failed: 0, medianRun: 1 } })).toContain("1 run, median by LCP: run 1");
  });

  it("say when the median fell back from the metric asked for", () => {
    const fellBack = { ...measured, runs: { ...measured.runs, failed: 0, medianByRequested: "INP" } };
    expect(reportHuman(fellBack)).toContain("3 runs, median by LCP (no run measured INP): run 2");
  });

  it("are a table in the markdown report", () => {
    const output = reportMarkdown(measured);
    expect(output).toContain("3 runs, median by LCP: run 2 (1 failed)");
    expect(output).toContain("| Metric | Median | Min | Max |");
    expect(output).toContain("| LCP | 1.20s | 980ms | 2.61s |");
  });

  it("leave both reports as they were without runs", () => {
    expect(reportHuman(samplePayload)).not.toContain("median by");
    expect(reportMarkdown(samplePayload)).not.toContain("| Metric | Median |");
  });
});

// A matrix of three combinations: two measured, one whose runs all failed
const combination = (name, device, variant, lcp, cls, results = []) => ({
  id: `${name} · ${device} · ${variant}`,
  name,
  device,
  variant,
  url: `https://example.com/${name}`,
  navMs: 900,
  results,
  pageErrors: [],
  runs: {
    count: 3,
    failed: 0,
    medianRun: 2,
    medianBy: "LCP",
    summary: {
      LCP: { median: lcp, min: lcp, max: lcp, values: [lcp, lcp, lcp], unit: "ms" },
      CLS: { median: cls, min: cls, max: cls, values: [cls, cls, cls], unit: "score" },
    },
  },
});
const matrix = {
  matrix: "work/matrix.json",
  runs: 3,
  combinations: [
    combination("home", "mobile", "no-consent", 1980, 0.02),
    combination("home", "mobile", "consent", 2710, 0.31, [
      { id: "render-blocking", status: "ok", issues: [{ severity: "error", message: "3 render-blocking stylesheets" }] },
      { id: "image-audit", status: "ok", reason: "follow-up", issues: [{ severity: "error", message: "only informs" }] },
    ]),
    { id: "article · desktop · consent", name: "article", device: "desktop", variant: "consent", url: "https://example.com/article", status: "error", error: "Every run failed: net::ERR_CONNECTION_REFUSED", runs: { count: 3, failed: 3 } },
  ],
};

describe("the human report of a matrix", () => {
  it("names the file, the combinations, the runs and the metric of the median", () => {
    expect(reportMatrixHuman(matrix)).toContain("WebPerf Snippets — matrix.json (3 combinations, 3 runs each, median by LCP)");
    expect(reportMatrixHuman({ ...matrix, runs: 1 })).toContain("(3 combinations, 1 run each, median by LCP)");
  });

  it("has one row per combination with the rated median of each metric", () => {
    const lines = reportMatrixHuman(matrix).split("\n");
    expect(lines.find((l) => l.includes("Page"))).toMatch(/Page\s+Device\s+Variant\s+LCP\s+CLS/);
    expect(lines.find((l) => l.includes("no-consent"))).toMatch(/home\s+mobile\s+no-consent\s+🟢 1\.98s\s+🟢 0\.0200/);
    expect(lines.find((l) => /mobile\s+consent/.test(l))).toMatch(/🟡 2\.71s\s+🔴 0\.3100/);
    expect(lines.find((l) => l.includes("article"))).toMatch(/article\s+desktop\s+consent\s+✗ every run failed/);
  });

  it("lists the errors that decide the exit code, and leaves out the ones of follow-ups", () => {
    const output = reportMatrixHuman(matrix);
    expect(output).toContain("home · mobile · consent: render-blocking: 3 render-blocking stylesheets");
    expect(output).toContain("article · desktop · consent: Every run failed: net::ERR_CONNECTION_REFUSED");
    expect(output).not.toContain("only informs");
  });

  it("adds the report of the median run of each combination with --verbose, titled with its id and URL", () => {
    const plain = reportMatrixHuman(matrix);
    const verbose = reportMatrixHuman({ ...matrix, verbose: true });
    expect(plain).not.toContain("Navigated in");
    expect(verbose).toContain("home · mobile · no-consent — https://example.com/home");
    expect(verbose.match(/Navigated in 900ms/g)).toHaveLength(2);
    expect(verbose).toContain("3 runs, median by LCP: run 2");
    expect(verbose).not.toContain("WebPerf Snippets — https://example.com/home");
  });
});

describe("a matrix without variants", () => {
  const plain = {
    ...matrix,
    combinations: matrix.combinations.slice(0, 1).map(({ variant, ...c }) => ({ ...c, id: "home · mobile" })),
  };

  it("has no Variant column in the human or markdown table", () => {
    expect(reportMatrixHuman(plain)).toMatch(/Page\s+Device\s+LCP/);
    expect(reportMatrixHuman(plain)).not.toContain("Variant");
    expect(reportMatrixMarkdown(plain)).toContain("| Page | Device | LCP | CLS |");
    expect(reportMatrixMarkdown(plain)).toContain("| home | mobile | ✅ 1.98s | ✅ 0.0200 |");
  });
});

describe("the markdown report of a matrix", () => {
  const output = () => reportMatrixMarkdown(matrix);

  it("names the file, the combinations, the runs and the metric of the median", () => {
    expect(output()).toContain("## WebPerf Results — matrix.json");
    expect(output()).toContain("> 3 combinations, 3 runs each, median by LCP");
  });

  it("has a table with the rated median of each combination", () => {
    expect(output()).toContain("| Page | Device | Variant | LCP | CLS |");
    expect(output()).toContain("| home | mobile | no-consent | ✅ 1.98s | ✅ 0.0200 |");
    expect(output()).toContain("| home | mobile | consent | ⚠️ 2.71s | ❌ 0.3100 |");
    expect(output()).toContain("| article | desktop | consent | ❌ every run failed | |");
  });

  it("lists the errors and folds the report of each combination into a details block", () => {
    expect(output()).toContain("- home · mobile · consent: render-blocking: 3 render-blocking stylesheets");
    expect(output()).toContain("<details><summary>home · mobile · no-consent</summary>");
    expect(output().match(/<details>/g)).toHaveLength(2);
    expect(output()).not.toContain("## WebPerf Results — https://");
  });
});

describe("a tracking snippet with nothing recorded", () => {
  const notYet = {
    ...samplePayload,
    results: [
      ...samplePayload.results,
      { id: "INP", script: "INP", status: "tracking", getDataFn: "getINP", message: "No interactions yet: click, tap or type on the page, then call getINP() again." },
    ],
  };

  it("shows in the human report as not measured, with its message, and not as an error", () => {
    const output = reportHuman(notYet);
    expect(output).toMatch(/INP\s+.*not measured: No interactions yet/);
    expect(output).not.toContain("✗");
  });

  it("shows in the markdown report as not measured, and not as an error", () => {
    const output = reportMarkdown(notYet);
    expect(output).toMatch(/\| INP \| · not measured \| No interactions yet: click, tap or type on the page, then call getINP\(\) again\. \|/);
    expect(output).not.toContain("❌");
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
  const payload = (results) => ({ url: "https://example.com", navMs: 100, results, pageErrors: [] });

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

describe("the budgets in the reports", () => {
  const budgets = [
    { metric: "LCP", budget: 2500, value: 1980, unit: "ms", verdict: "passed" },
    { metric: "INP", budget: 200, value: 260, unit: "ms", verdict: "exceeded" },
    { metric: "CLS", budget: 0.1, value: 0.12, unit: "score", verdict: "exceeded" },
    { metric: "TTFB", budget: 800, value: null, unit: "ms", verdict: "not measured", note: "No navigation entry" },
  ];
  const withBudgets = { ...samplePayload, budgets };

  it("lists every budget in the human report, passed or not, with by how much it was exceeded or why it was not measured", () => {
    const output = reportHuman(withBudgets);
    expect(output).toContain("Budgets");
    expect(output).toMatch(/LCP\s+1\.98s\s+budget 2\.50s\s+passed/);
    expect(output).toMatch(/INP\s+260ms\s+budget 200ms\s+exceeded by 60ms/);
    expect(output).toMatch(/CLS\s+0\.1200\s+budget 0\.1000\s+exceeded by 0\.0200/);
    expect(output).toMatch(/TTFB\s+·\s+budget 800ms\s+not measured: No navigation entry/);
  });

  it("gives the markdown report a table of the budgets, for the comment of a pull request", () => {
    const output = reportMarkdown(withBudgets);
    expect(output).toContain("### Budgets");
    expect(output).toContain("| Metric | Value | Budget | Verdict |");
    expect(output).toContain("| LCP | 1.98s | 2.50s | ✅ passed |");
    expect(output).toContain("| INP | 260ms | 200ms | ❌ exceeded by 60ms |");
    expect(output).toContain("| TTFB | · | 800ms | ❌ not measured: No navigation entry |");
  });

  it("adds no section without budgets", () => {
    expect(reportHuman(samplePayload)).not.toContain("Budgets");
    expect(reportMarkdown(samplePayload)).not.toContain("Budgets");
  });

  it("keeps the budgets in the JSON report", () => {
    expect(JSON.parse(reportJson(withBudgets)).budgets).toEqual(budgets);
  });

  it("names the combination of each failed budget in a matrix, or says that every budget passed", () => {
    const lcp = (value, verdict) => [{ metric: "LCP", budget: 2500, value, unit: "ms", verdict }];
    const [first, second, failed] = matrix.combinations;
    const failing = { ...matrix, combinations: [{ ...first, budgets: lcp(1980, "passed") }, { ...second, budgets: lcp(2710, "exceeded") }, failed] };
    expect(reportMatrixHuman(failing)).toMatch(/Budgets[\s\S]*home · mobile · consent: LCP 2\.71s exceeds budget 2\.50s/);
    expect(reportMatrixMarkdown(failing)).toMatch(/### Budgets\n- ❌ home · mobile · consent: LCP 2\.71s exceeds budget 2\.50s/);
    const passing = { ...matrix, combinations: [{ ...first, budgets: lcp(1980, "passed") }, failed] };
    expect(reportMatrixHuman(passing)).toMatch(/Budgets[\s\S]*Every budget passed/);
    expect(reportMatrixMarkdown(passing)).toContain("✅ Every budget passed");
    expect(reportMatrixMarkdown(matrix)).not.toContain("Budgets");
  });
});
