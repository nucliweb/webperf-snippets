import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchCrux, fetchCruxHistory } from "../../src/crux.js";
import { cliEnv } from "../helpers/cli-env.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "../../src/bin.js");

// The LCP entry needs a moment after load to be reported; with no wait a loaded runner
// sometimes returns "No LCP entries buffered" and the CLI exits 1.
const WAIT_MS = "500";

let pageServer;
let pageUrl;
let cruxServer;
let cruxEndpoint;
let requests;
let respond;

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// What the CrUX API returns: LCP and INP p75 as numbers, CLS p75 as a string.
const RECORD = {
  record: {
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 2800 } },
      cumulative_layout_shift: { percentiles: { p75: "0.08" } },
      interaction_to_next_paint: { percentiles: { p75: 220 } },
    },
  },
};

// What the History API returns: three weekly periods, oldest first
const HISTORY = {
  record: {
    key: { formFactor: "PHONE", url: "https://example.com/page" },
    collectionPeriods: [
      { firstDate: { year: 2026, month: 9, day: 13 }, lastDate: { year: 2026, month: 10, day: 10 } },
      { firstDate: { year: 2026, month: 9, day: 20 }, lastDate: { year: 2026, month: 10, day: 17 } },
      { firstDate: { year: 2026, month: 9, day: 27 }, lastDate: { year: 2026, month: 10, day: 24 } },
    ],
    metrics: {
      largest_contentful_paint: { percentilesTimeseries: { p75s: [2875, 2990, 3097] } },
      cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.26", "0.24", "0.21"] } },
      interaction_to_next_paint: { percentilesTimeseries: { p75s: [248, 249, 251] } },
    },
  },
};
const isHistory = (path) => path.includes("records:queryHistoryRecord");

const ok = (res, body = RECORD) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const notFound = (res) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { code: 404, message: "chrome ux report data not found" } }));
};

beforeAll(async () => {
  pageServer = await listen((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(join(HERE, "../fixtures/index.html")));
  });
  pageUrl = `http://127.0.0.1:${pageServer.address().port}`;

  cruxServer = await listen((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, body: JSON.parse(body || "{}") });
      respond(res, JSON.parse(body || "{}"), req.url);
    });
  });
  cruxEndpoint = `http://127.0.0.1:${cruxServer.address().port}/v1/records:queryRecord`;
}, 10000);

afterAll(async () => {
  pageServer.closeAllConnections();
  cruxServer.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => pageServer.close(resolve)),
    new Promise((resolve) => cruxServer.close(resolve)),
  ]);
});

beforeEach(() => {
  requests = [];
  respond = (res, body, path) => ok(res, isHistory(path) ? HISTORY : RECORD);
});

describe("fetchCruxHistory", () => {
  const call = (extra = {}) =>
    fetchCruxHistory({ url: "https://example.com/page", apiKey: "secret-key", weeks: 3, endpoint: cruxEndpoint, ...extra });

  it("asks the History API for the weeks of the URL, with the key in the query string", async () => {
    const history = await call();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toMatch(/\/v1\/records:queryHistoryRecord\?key=secret-key$/);
    expect(requests[0].body).toEqual({ url: "https://example.com/page", formFactor: "PHONE", collectionPeriodCount: 3 });
    expect(history).toMatchObject({ scope: "url", formFactor: "PHONE", weeks: 3 });
    expect(history.metrics.LCP).toMatchObject({ p75s: [2875, 2990, 3097], change: 7.7, trend: "worsening" });
    expect(history.metrics.CLS).toMatchObject({ p75s: [0.26, 0.24, 0.21], trend: "improving" });
  });

  it("falls back to the origin when the URL has too little traffic, and says so", async () => {
    respond = (res, body, path) => (body.url ? notFound(res) : ok(res, isHistory(path) ? HISTORY : RECORD));
    const history = await call();
    expect(requests.map((r) => r.body.url ?? r.body.origin)).toEqual(["https://example.com/page", "https://example.com"]);
    expect(history.scope).toBe("origin");
  });

  it("is unavailable when neither the URL nor the origin has data, and a failure without the key on an API error", async () => {
    respond = (res) => notFound(res);
    expect(await call()).toEqual({ unavailable: "not in the CrUX dataset" });
    respond = (res) => {
      res.writeHead(500);
      res.end("{}");
    };
    const failed = await call();
    expect(failed).toEqual({ unavailable: "the CrUX History API answered 500", failed: true });
    expect(JSON.stringify(failed)).not.toContain("secret-key");
  });
});

describe("fetchCrux", () => {
  const call = (extra = {}) =>
    fetchCrux({ url: "https://example.com/page", apiKey: "secret-key", endpoint: cruxEndpoint, ...extra });

  it("returns the p75 of LCP, CLS and INP with a rating, CLS as a number", async () => {
    const result = await call();
    expect(result.scope).toBe("url");
    expect(result.formFactor).toBe("PHONE");
    expect(result.metrics.LCP).toEqual({ p75: 2800, rating: "needs-improvement", unit: "ms" });
    expect(result.metrics.CLS).toEqual({ p75: 0.08, rating: "good", unit: "score" });
    expect(result.metrics.INP).toEqual({ p75: 220, rating: "needs-improvement", unit: "ms" });
  });

  it("sends the key in the query string and the form factor in the body", async () => {
    await call({ formFactor: "DESKTOP" });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("key=secret-key");
    expect(requests[0].body).toMatchObject({ url: "https://example.com/page", formFactor: "DESKTOP" });
  });

  it("omits a metric the API does not return", async () => {
    respond = (res) =>
      ok(res, { record: { metrics: { largest_contentful_paint: { percentiles: { p75: 1200 } } } } });
    const result = await call();
    expect(Object.keys(result.metrics)).toEqual(["LCP"]);
  });

  it("retries with the origin when the URL has no data and labels the scope", async () => {
    respond = (res, body) => (body.url ? notFound(res) : ok(res));
    const result = await call();
    expect(requests).toHaveLength(2);
    expect(requests[1].body.origin).toBe("https://example.com");
    expect(requests[1].body.url).toBeUndefined();
    expect(result.scope).toBe("origin");
    expect(result.metrics.LCP.p75).toBe(2800);
  });

  it("reports unavailable when neither the URL nor the origin has data", async () => {
    respond = (res) => notFound(res);
    const result = await call();
    expect(result.unavailable).toMatch(/not in the CrUX dataset/);
    expect(result.metrics).toBeUndefined();
    // Missing data is an answer, not a failure of the request
    expect(result.failed).toBeUndefined();
  });

  it("reports unavailable without exposing the key on an API error", async () => {
    respond = (res) => {
      res.writeHead(429);
      res.end("quota");
    };
    const result = await call();
    expect(result.unavailable).toContain("429");
    expect(result.failed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  it("reports unavailable when the endpoint is unreachable", async () => {
    const result = await call({ endpoint: "http://127.0.0.1:1/v1/records:queryRecord" });
    expect(result.unavailable).toBeTruthy();
    expect(result.failed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });
});

describe("CrUX in the CLI", () => {
  function cli(args, env = {}) {
    return new Promise((resolve) => {
      execFile(
        "node",
        [BIN, pageUrl, "--snippet", "LCP", "--wait", WAIT_MS, ...args],
        { env: cliEnv({ WEBPERF_CRUX_ENDPOINT: cruxEndpoint, ...env }) },
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })
      );
    });
  }

  it("makes no request without a key", async () => {
    const { code } = await cli(["--json"]);
    expect(code).toBe(0);
    expect(requests).toHaveLength(0);
  }, 30000);

  it("adds the field data to the JSON output with --crux-key", async () => {
    const { stdout } = await cli(["--json", "--crux-key", "k1"]);
    expect(requests[0].url).toContain("key=k1");
    expect(JSON.parse(stdout).crux.metrics.LCP.p75).toBe(2800);
  }, 30000);

  it("reads the key from CRUX_API_KEY", async () => {
    await cli(["--json"], { CRUX_API_KEY: "k-env" });
    expect(requests[0].url).toContain("key=k-env");
  }, 30000);

  it("prints a field data section in the human output, next to the synthetic value", async () => {
    const { stdout } = await cli(["--crux-key", "k1"]);
    expect(stdout).toContain("Field data (CrUX p75, mobile)");
    expect(stdout).toMatch(/LCP\s+2\.80s/);
    expect(stdout).toContain("synthetic:");
  }, 30000);

  it("prints a field data table in the markdown output", async () => {
    const { stdout } = await cli(["--markdown", "--crux-key", "k1"]);
    expect(stdout).toContain("### Field data (CrUX p75, mobile)");
    expect(stdout).toContain("| LCP |");
  }, 30000);

  it("uses the desktop form factor with --viewport desktop", async () => {
    await cli(["--json", "--viewport", "desktop", "--crux-key", "k1"]);
    expect(requests[0].body.formFactor).toBe("DESKTOP");
  }, 30000);

  it("keeps the exit code and notes it when the page is not in CrUX", async () => {
    respond = (res) => notFound(res);
    const { code, stdout } = await cli(["--crux-key", "k1"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Field data: not available");
  }, 30000);

  it("adds the trend of the last weeks with --crux-history, to the JSON and to both reports", async () => {
    const json = await cli(["--json", "--crux-key", "k1", "--crux-history", "3"]);
    expect(json.code, json.stderr).toBe(0);
    const history = requests.find((r) => isHistory(r.url));
    expect(history.body.collectionPeriodCount).toBe(3);
    expect(JSON.parse(json.stdout).crux.history).toMatchObject({ scope: "url", weeks: 3, metrics: { LCP: { trend: "worsening" } } });

    const human = await cli(["--crux-key", "k1", "--crux-history", "3"]);
    expect(human.stdout).toContain("Field data trend (CrUX p75, 3 weeks, mobile)");
    expect(human.stdout).toMatch(/LCP\s+2\.88s → 3\.10s\s+▲ \+7\.7%\s+worsening\s+▁▅█/);
    expect(human.stdout).toMatch(/CLS\s+0\.2600 → 0\.2100\s+▼ −19\.2%\s+improving/);

    const markdown = await cli(["--markdown", "--crux-key", "k1", "--crux-history", "3"]);
    expect(markdown.stdout).toContain("### Field data trend (CrUX p75, 3 weeks, mobile)");
    expect(markdown.stdout).toContain("| LCP | 2.88s | 3.10s | ▲ +7.7% | worsening | ▁▅█ |");
  }, 60000);

  it("asks the History API only with --crux-history", async () => {
    await cli(["--json", "--crux-key", "k1"]);
    expect(requests.some((r) => isHistory(r.url))).toBe(false);
  }, 30000);

  it("refuses --crux-history outside 1 to 40 weeks, or without a key, before the page loads", async () => {
    for (const weeks of ["0", "41", "many"]) {
      const { code, stderr } = await cli(["--crux-key", "k1", "--crux-history", weeks]);
      expect(code).toBe(2);
      expect(stderr).toMatch(/--crux-history takes 1 to 40 weeks/);
    }
    const { code, stderr } = await cli(["--crux-history", "3"], { CRUX_API_KEY: "" });
    expect(code).toBe(2);
    expect(stderr).toMatch(/--crux-history needs a CrUX key: --crux-key or CRUX_API_KEY/);
    expect(requests).toHaveLength(0);
  }, 60000);
});
