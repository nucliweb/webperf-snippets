const DEFAULT_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const CRUX_TIMEOUT_MS = 10000;

// Good / needs-improvement upper bounds from web.dev/articles/vitals.
const METRICS = [
  { name: "LCP", key: "largest_contentful_paint", unit: "ms", good: 2500, poor: 4000 },
  { name: "CLS", key: "cumulative_layout_shift", unit: "score", good: 0.1, poor: 0.25 },
  { name: "INP", key: "interaction_to_next_paint", unit: "ms", good: 200, poor: 500 },
];

const FORM_FACTOR_LABEL = { PHONE: "mobile", DESKTOP: "desktop", TABLET: "tablet" };

const rate = (value, { good, poor }) => (value <= good ? "good" : value <= poor ? "needs-improvement" : "poor");

// The viewport preset decides which population the field data describes.
export function formFactorFor(viewportName) {
  return viewportName === "desktop" ? "DESKTOP" : "PHONE";
}

function parseMetrics(record) {
  const metrics = {};
  for (const m of METRICS) {
    // CLS p75 comes as a string ("0.08"); LCP and INP as numbers.
    const p75 = Number(record?.metrics?.[m.key]?.percentiles?.p75);
    if (Number.isFinite(p75)) metrics[m.name] = { p75, rating: rate(p75, m), unit: m.unit };
  }
  return metrics;
}

async function query({ endpoint, apiKey, body, timeoutMs }) {
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { status: res.status };
  return { record: (await res.json()).record };
}

// Never throws, and no message it returns contains the key (it travels in the
// query string, so the request URL is never logged or put in an error).
export async function fetchCrux({
  url,
  apiKey,
  formFactor = "PHONE",
  endpoint = process.env.WEBPERF_CRUX_ENDPOINT ?? DEFAULT_ENDPOINT,
  timeoutMs = CRUX_TIMEOUT_MS,
}) {
  try {
    let scope = "url";
    let answer = await query({ endpoint, apiKey, body: { url, formFactor }, timeoutMs });
    if (answer.notFound) {
      scope = "origin";
      answer = await query({ endpoint, apiKey, body: { origin: new URL(url).origin, formFactor }, timeoutMs });
    }
    if (answer.notFound) return { unavailable: "not in the CrUX dataset" };
    if (answer.status) return { unavailable: `the CrUX API answered ${answer.status}` };
    const metrics = parseMetrics(answer.record);
    if (Object.keys(metrics).length === 0) return { unavailable: "no Core Web Vitals in the CrUX record" };
    return { scope, formFactor, metrics };
  } catch (err) {
    const reason = err.name === "TimeoutError" ? `no answer within ${timeoutMs}ms` : (err.cause?.code ?? "request failed");
    return { unavailable: reason };
  }
}

// Shared by both reporters: what to show and next to which synthetic value.
export function fieldDataView(crux, results) {
  const label = FORM_FACTOR_LABEL[crux.formFactor] ?? crux.formFactor.toLowerCase();
  const title = `Field data (CrUX p75, ${label}${crux.scope === "origin" ? ", origin-level" : ""})`;
  const rows = METRICS.filter((m) => crux.metrics[m.name]).map((m) => {
    const synthetic = results.find((r) => r.status === "ok" && r.metric === m.name);
    return {
      metric: m.name,
      unit: m.unit,
      p75: crux.metrics[m.name].p75,
      rating: crux.metrics[m.name].rating,
      synthetic: synthetic ? synthetic.value : null,
    };
  });
  return { title, rows };
}
