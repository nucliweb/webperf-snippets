import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSnippets, VIEWPORT_PRESETS } from "../../src/runner.js";
import { loadSnippet } from "../../src/load-snippet.js";
import { auditWorkflow } from "../../src/workflows/audit.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "../fixtures");

const GREEN_HTML = readFileSync(join(FIXTURES, "audit-green.html"), "utf8");
const VIOLATIONS_HTML = readFileSync(join(FIXTURES, "audit-violations.html"), "utf8");

// Minimal 1×1 transparent GIF served for all image requests.
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createServer((req, res) => {
        if (req.url.match(/\.(gif|png|jpg|jpeg|webp|avif)$/)) {
          res.writeHead(200, { "Content-Type": "image/gif" });
          res.end(PIXEL_GIF);
          return;
        }
        if (req.url.endsWith(".css")) {
          res.writeHead(200, { "Content-Type": "text/css" });
          res.end("body { color: black; font-family: sans-serif; }");
          return;
        }
        if (req.url === "/big.js") {
          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end("/* padding */\n".repeat(400));
          return;
        }
        if (req.url.endsWith(".js")) {
          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end("// placeholder");
          return;
        }
        if (req.url === "/wide") {
          // A 3 KB parser-blocking inline script, a prefetch of a file the page also loads, and a bare video
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title><script>/* ${"x".repeat(3000)} */ window.__inline = 1;</script>` +
              `<script src="/used.js"></script><link rel="prefetch" href="/used.js"></head>` +
              `<body><h1>t</h1><video src="/clip.mp4" autoplay></video></body></html>`
          );
          return;
        }
        if (req.url === "/uncompressed") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title><script src="/big.js"></script></head><body><h1>t</h1></body></html>');
          return;
        }
        const html = req.url === "/violations" ? VIOLATIONS_HTML : GREEN_HTML;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    }),
  10000
);

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve);
    })
);

// The steps of the real audit workflow, so a step added there is covered by every test below
const AUDIT_STEPS = auditWorkflow.steps;

function makeItems(steps) {
  return steps.map((step) => ({
    id: step.id,
    path: step.path,
    source: loadSnippet(step.path),
  }));
}

async function runAudit(url, steps = AUDIT_STEPS) {
  const { results } = await runSnippets({
    url,
    items: makeItems(steps),
    waitMs: 500,
    viewport: VIEWPORT_PRESETS.mobile,
  });
  return results;
}

function step(id) {
  return AUDIT_STEPS.filter((s) => s.id === id);
}

// ─── Green fixture — expects no violations ────────────────────────────────────

describe("Audit workflow", () => {
  it("has unique step ids and paths", () => {
    const ids = AUDIT_STEPS.map((s) => s.id);
    const paths = AUDIT_STEPS.map((s) => s.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("runs the steps that make their own requests after the rest", () => {
    const ids = AUDIT_STEPS.map((s) => s.id);
    for (const late of ["oversized-images", "image-audit", "svg-bitmaps"]) {
      expect(ids.indexOf(late)).toBeGreaterThan(ids.indexOf("compression"));
      expect(ids.indexOf(late)).toBeGreaterThan(ids.indexOf("dom-size"));
    }
  });
});

describe("Audit snippets — green fixture (no violations)", () => {
  it(
    "all snippets execute without errors",
    async () => {
      const results = await runAudit(baseUrl);
      for (const r of results) {
        expect(r.status, `${r.id} threw: ${r.error}`).not.toBe("error");
      }
    },
    60000,
  );

  it(
    "all non-TTFB snippets return an issues array",
    async () => {
      const results = await runAudit(baseUrl);
      for (const r of results.filter((r) => r.id !== "ttfb")) {
        expect(Array.isArray(r.issues), `${r.id} missing issues array`).toBe(true);
      }
    },
    60000,
  );

  it(
    "TTFB returns a metric with a rating",
    async () => {
      const [r] = await runAudit(baseUrl, step("ttfb"));
      expect(r.status).toBe("ok");
      expect(r.metric).toBe("TTFB");
      expect(typeof r.value).toBe("number");
      expect(["good", "needs-improvement", "poor"]).toContain(r.rating);
    },
    30000,
  );

  it(
    "render-blocking — 🟢 no blocking resources on a page with only inline styles",
    async () => {
      const [r] = await runAudit(baseUrl, step("render-blocking"));
      // renderBlockingStatus requires Chrome 107+; skip gracefully if unavailable
      if (r.status === "unsupported") return;
      expect(r.status).toBe("ok");
      expect(r.count).toBe(0);
      expect(r.issues).toEqual([]);
    },
    30000,
  );

  it(
    "compression — 🟢 no text resource goes out uncompressed",
    async () => {
      const [r] = await runAudit(baseUrl, step("compression"));
      expect(r.status).toBe("ok");
      expect(r.count).toBe(0);
      expect(r.issues).toEqual([]);
    },
    30000,
  );

  it(
    "lazy-atf — 🟢 no lazy images above fold",
    async () => {
      const [r] = await runAudit(baseUrl, step("lazy-atf"));
      expect(r.status).toBe("ok");
      expect(r.count).toBe(0);
      expect(r.issues).toEqual([]);
    },
    30000,
  );

  it(
    "lazy-conflict — 🟢 no lazy+fetchpriority conflicts",
    async () => {
      const [r] = await runAudit(baseUrl, step("lazy-conflict"));
      expect(r.status).toBe("ok");
      expect(r.count).toBe(0);
      expect(r.issues).toEqual([]);
    },
    30000,
  );

  it(
    "eager-below-fold — 🟢 all below-fold images are properly lazy",
    async () => {
      const [r] = await runAudit(baseUrl, step("eager-below-fold"));
      expect(r.status).toBe("ok");
      expect(r.issues).toEqual([]);
    },
    30000,
  );
});

// ─── Violations fixture — expects specific issues ──────────────────────────────

describe("Audit snippets — violations fixture (deliberate issues)", () => {
  it(
    "render-blocking — 🔴 detects the blocking external CSS file",
    async () => {
      const [r] = await runAudit(`${baseUrl}/violations`, step("render-blocking"));
      if (r.status === "unsupported") return;
      expect(r.status).toBe("ok");
      expect(r.count).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    },
    30000,
  );

  it(
    "compression — 🟡 flags a text resource sent without compression",
    async () => {
      const [r] = await runAudit(`${baseUrl}/uncompressed`, step("compression"));
      expect(r.status).toBe("ok");
      expect(r.count).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.severity === "warning")).toBe(true);
      expect(r.items.some((i) => i.url?.endsWith("/big.js") || i.shortName === "big.js")).toBe(true);
    },
    30000,
  );

  it(
    "the audit steps all run without errors on a page with deliberate violations",
    async () => {
      const results = await runAudit(`${baseUrl}/wide`);
      expect(results).toHaveLength(AUDIT_STEPS.length);
      for (const r of results) {
        expect(r.status, `${r.id} threw: ${r.error}`).not.toBe("error");
      }
    },
    60000,
  );

  it(
    "inline-scripts — 🔴 flags a large inline script that blocks the parser in the head",
    async () => {
      const [r] = await runAudit(`${baseUrl}/wide`, step("inline-scripts"));
      expect(r.status).toBe("ok");
      expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    },
    30000,
  );

  it(
    "prefetch — 🔴 flags a prefetch for a file the current page already uses",
    async () => {
      const [r] = await runAudit(`${baseUrl}/wide`, step("prefetch"));
      expect(r.status).toBe("ok");
      expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    },
    30000,
  );

  it(
    "video — 🟡 flags a video without a poster",
    async () => {
      const [r] = await runAudit(`${baseUrl}/wide`, step("video"));
      expect(r.status).toBe("ok");
      expect(r.issues.some((i) => i.severity === "warning" && /poster/.test(i.message))).toBe(true);
    },
    30000,
  );

  it(
    "lazy-atf — 🔴 detects lazy image above the fold",
    async () => {
      const [r] = await runAudit(`${baseUrl}/violations`, step("lazy-atf"));
      expect(r.status).toBe("ok");
      expect(r.count).toBeGreaterThan(0);
      expect(r.issues.length).toBeGreaterThan(0);
    },
    30000,
  );

  it(
    "lazy-conflict — 🔴 detects image with loading=lazy and fetchpriority=high",
    async () => {
      const [r] = await runAudit(`${baseUrl}/violations`, step("lazy-conflict"));
      expect(r.status).toBe("ok");
      expect(r.count).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.severity === "error")).toBe(true);
    },
    30000,
  );

  it(
    "eager-below-fold — 🟡 detects images below viewport without lazy loading",
    async () => {
      const [r] = await runAudit(`${baseUrl}/violations`, step("eager-below-fold"));
      expect(r.status).toBe("ok");
      expect(r.count).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.severity === "warning")).toBe(true);
    },
    30000,
  );
});
