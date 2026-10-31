import { rate } from "./ratings.js";

const DEFAULT_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
// The History API lives next to the daily one; an endpoint given for tests or a proxy points at both
const historyEndpointOf = (endpoint) => endpoint.replace(/records:queryRecord$/, "records:queryHistoryRecord");
const CRUX_TIMEOUT_MS = 10000;

const METRICS = [
  { name: "LCP", key: "largest_contentful_paint", unit: "ms" },
  { name: "CLS", key: "cumulative_layout_shift", unit: "score" },
  { name: "INP", key: "interaction_to_next_paint", unit: "ms" },
];

const FORM_FACTOR_LABEL = { PHONE: "mobile", DESKTOP: "desktop", TABLET: "tablet" };


// The viewport preset decides which population the field data describes.
export function formFactorFor(viewportName) {
  return viewportName === "desktop" ? "DESKTOP" : "PHONE";
}

function parseMetrics(record) {
  const metrics = {};
  for (const m of METRICS) {
    // CLS p75 comes as a string ("0.08"); LCP and INP as numbers.
    const p75 = Number(record?.metrics?.[m.key]?.percentiles?.p75);
    if (Number.isFinite(p75)) metrics[m.name] = { p75, rating: rate(m.name, p75), unit: m.unit };
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
// query string, so the request URL is never logged or put in an error). A page
// with no field data is an answer ({ unavailable }); an API error or no answer is
// a failure ({ unavailable, failed: true }).
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
    if (answer.status) return { unavailable: `the CrUX API answered ${answer.status}`, failed: true };
    const metrics = parseMetrics(answer.record);
    if (Object.keys(metrics).length === 0) return { unavailable: "no Core Web Vitals in the CrUX record" };
    return { scope, formFactor, metrics };
  } catch (err) {
    const reason = err.name === "TimeoutError" ? `no answer within ${timeoutMs}ms` : (err.cause?.code ?? "request failed");
    return { unavailable: reason, failed: true };
  }
}

// A trend compares the first and the last periods with data: each period already covers 28 days, so the
// series is smooth enough. Within 5 % it is stable; lower is better for every metric.
const STABLE_WITHIN = 5;

export function trendOf(p75s) {
  const values = p75s.filter((v) => v !== null);
  const first = values[0];
  const last = values.at(-1);
  if (values.length < 2) return { first, last, change: null, trend: null };
  const change = first === 0 ? null : Math.round(((last - first) / first) * 1000) / 10;
  const trend = change === null || Math.abs(change) <= STABLE_WITHIN ? "stable" : change < 0 ? "improving" : "worsening";
  return { first, last, change, trend };
}

const BARS = "▁▂▃▄▅▆▇█";

// The series as bars between its lowest and highest values, a space for a period without data
export function sparkline(values) {
  const known = values.filter((v) => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  return values.map((v) => (v === null ? " " : max === min ? BARS[3] : BARS[Math.round(((v - min) / (max - min)) * 7)])).join("");
}

const dateOf = ({ year, month, day }) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// The record of the History API as periods, oldest first, and the p75s of each Core Web Vital
export function parseHistory(record) {
  const periods = (record?.collectionPeriods ?? []).map((p) => ({ start: dateOf(p.firstDate), end: dateOf(p.lastDate) }));
  const metrics = {};
  for (const m of METRICS) {
    const raw = record?.metrics?.[m.key]?.percentilesTimeseries?.p75s;
    if (!raw) continue;
    // CLS comes as strings ("0.21"), and a period with too little data as null
    const p75s = raw.map((v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)));
    if (p75s.every((v) => v === null)) continue;
    metrics[m.name] = { unit: m.unit, p75s, ...trendOf(p75s) };
  }
  return { periods, metrics };
}

// The p75 of LCP, CLS and INP week by week over the last `weeks` periods (1 to 40), from the History
// API: the URL, or its origin when the URL has too little traffic. Never throws, and like fetchCrux
// never puts the key in a message.
export async function fetchCruxHistory({
  url,
  apiKey,
  weeks,
  formFactor = "PHONE",
  endpoint = process.env.WEBPERF_CRUX_ENDPOINT ?? DEFAULT_ENDPOINT,
  timeoutMs = CRUX_TIMEOUT_MS,
}) {
  const history = historyEndpointOf(endpoint);
  try {
    let scope = "url";
    let answer = await query({ endpoint: history, apiKey, body: { url, formFactor, collectionPeriodCount: weeks }, timeoutMs });
    if (answer.notFound) {
      scope = "origin";
      answer = await query({ endpoint: history, apiKey, body: { origin: new URL(url).origin, formFactor, collectionPeriodCount: weeks }, timeoutMs });
    }
    if (answer.notFound) return { unavailable: "not in the CrUX dataset" };
    if (answer.status) return { unavailable: `the CrUX History API answered ${answer.status}`, failed: true };
    const { periods, metrics } = parseHistory(answer.record);
    if (Object.keys(metrics).length === 0) return { unavailable: "no Core Web Vitals in the CrUX history" };
    return { scope, formFactor, weeks: periods.length, periods, metrics };
  } catch (err) {
    const reason = err.name === "TimeoutError" ? `no answer within ${timeoutMs}ms` : (err.cause?.code ?? "request failed");
    return { unavailable: reason, failed: true };
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

// The trend of the field data, shared by both reporters: per metric the first and last p75 of the
// weeks, the change and its direction, and the series as a sparkline
export function historyView(history) {
  const label = FORM_FACTOR_LABEL[history.formFactor] ?? history.formFactor.toLowerCase();
  const title = `Field data trend (CrUX p75, ${history.weeks} weeks, ${label}${history.scope === "origin" ? ", origin-level" : ""})`;
  const rows = METRICS.filter((m) => history.metrics[m.name]).map((m) => {
    const { p75s, first, last, change, trend } = history.metrics[m.name];
    const changeText = change === null ? "·" : `${change > 0 ? "▲ +" : change < 0 ? "▼ −" : "= "}${Math.abs(change)}%`;
    return { metric: m.name, unit: m.unit, first, last, change: changeText, trend: trend ?? "·", sparkline: sparkline(p75s) };
  });
  return { title, rows };
}
