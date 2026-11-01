import { DEFAULT_THRESHOLDS } from "./baseline.js";
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

// The sub-parts of the LCP as CrUX reports them, for the loads whose LCP is an image, by the names of
// the lab sub-parts of LCP-Subparts
const SUB_PARTS = [
  { part: "ttfb", label: "TTFB", key: "largest_contentful_paint_image_time_to_first_byte" },
  { part: "resourceLoadDelay", label: "Load delay", key: "largest_contentful_paint_image_resource_load_delay" },
  { part: "resourceLoadTime", label: "Load duration", key: "largest_contentful_paint_image_resource_load_duration" },
  { part: "elementRenderDelay", label: "Render delay", key: "largest_contentful_paint_image_element_render_delay" },
];

const p75Of = (record, key) => {
  const value = Number(record?.metrics?.[key]?.percentiles?.p75);
  return Number.isFinite(value) ? value : undefined;
};

// What else the record of a page says besides LCP, CLS and INP: the sub-parts of an image LCP, the
// share of loads whose LCP is an image, the round trip time and the navigation types, by share
export function parseFieldExtras(record) {
  const extras = {};
  const subParts = {};
  for (const { part, key } of SUB_PARTS) {
    const value = p75Of(record, key);
    if (value !== undefined) subParts[part] = value;
  }
  if (Object.keys(subParts).length) extras.subParts = subParts;
  const imageShare = record?.metrics?.largest_contentful_paint_resource_type?.fractions?.image;
  if (typeof imageShare === "number") extras.lcpImageShare = imageShare;
  const rtt = p75Of(record, "round_trip_time");
  if (rtt !== undefined) extras.roundTripTime = rtt;
  const fractions = record?.metrics?.navigation_types?.fractions;
  if (fractions) {
    const sorted = Object.entries(fractions).filter(([, share]) => share > 0).sort((a, b) => b[1] - a[1]);
    if (sorted.length) extras.navigationTypes = Object.fromEntries(sorted);
  }
  return extras;
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
    return { scope, formFactor, metrics, ...parseFieldExtras(answer.record) };
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

// The series as bars, a space for a period without data. The bars span the range of the series, or
// `minRange` when the series is narrower, centred in it: a CLS of 0.20 to 0.21 drawn from its lowest
// to its highest value looked like a big swing. Eight equal steps, so a flat series sits in the middle.
export function sparkline(values, minRange = 0) {
  const known = values.filter((v) => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  const range = Math.max(max - min, minRange);
  if (range === 0) return values.map((v) => (v === null ? " " : BARS[4])).join("");
  const low = max - min >= minRange ? min : (min + max) / 2 - range / 2;
  return values.map((v) => (v === null ? " " : BARS[Math.min(7, Math.floor(((v - low) / range) * 8))])).join("");
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
    // The smallest change --baseline counts for the metric is the least the bars span
    return { metric: m.name, unit: m.unit, first, last, change: changeText, trend: trend ?? "·", sparkline: sparkline(p75s, DEFAULT_THRESHOLDS[m.name].absolute) };
  });
  return { title, rows };
}

const share = (fraction) => (fraction < 0.01 ? `${Math.round(fraction * 1000) / 10}%` : `${Math.round(fraction * 100)}%`);

// A sub-part counts as different when one side is at least 1.5 times the other and 100 ms apart: less
// than that is within the noise of the lab and of a percentile
const differs = (slow, fast) => slow >= fast * 1.5 && slow - fast >= 100;

const rttNote = (rtt) => (rtt === undefined ? "" : ` (RTT p75 ${rtt} ms)`);
const FIELD_SLOWER = {
  ttfb: (rtt) => `real users wait longer for the server: network distance${rttNote(rtt)}, the CDN or cache misses the lab does not see`,
  resourceLoadDelay: () => 'the lab finds the image sooner: preload it or give it fetchpriority="high", or users run more scripts before it',
  resourceLoadTime: (rtt) => `slower connections in the field${rttNote(rtt)}: compress or resize the LCP image`,
  elementRenderDelay: () => "slower devices or more main-thread work in the field",
};
const LAB_SLOWER = "the lab is slower than users: check the CPU and network throttling of the lab";

// The sub-parts of the field next to those of LCP-Subparts in the lab, when it ran, with a note where
// they differ, and what the field sub-parts describe. Null without field sub-parts.
export function subPartsView(extras, results) {
  if (!extras.subParts) return null;
  const labResult = results.find((r) => r.script === "LCP-Subparts" && r.status === "ok");
  const labParts = labResult?.details?.subParts ?? {};
  // The field sub-parts are those of image LCPs: a lab LCP without a resource, such as text, has no load
  // delay or duration to set against them
  const labImage = !labResult || Boolean(labResult.details?.url);
  const rows = SUB_PARTS.filter(({ part }) => extras.subParts[part] !== undefined).map(({ part, label }) => {
    const field = extras.subParts[part];
    const comparable = labImage || part === "ttfb" || part === "elementRenderDelay";
    const lab = comparable ? (labParts[part]?.value ?? null) : null;
    let note = null;
    if (lab !== null && differs(field, lab)) note = FIELD_SLOWER[part](extras.roundTripTime);
    else if (lab !== null && differs(lab, field)) note = LAB_SLOWER;
    return { part, label, field, lab, note };
  });
  const caveats = [
    ...(extras.lcpImageShare !== undefined ? [`The field sub-parts describe the ${share(extras.lcpImageShare)} of loads whose LCP is an image.`] : []),
    ...(labImage ? [] : ["The LCP of the lab is not an image, so it has no load delay or duration to compare."]),
    "Each p75 is taken on its own, so the sub-parts do not add up to the p75 of LCP.",
  ];
  return { rows, caveats };
}

const NAVIGATION_LABELS = {
  navigate: "navigate",
  navigate_cache: "navigate from cache",
  reload: "reload",
  restore: "restore",
  back_forward: "back/forward",
  back_forward_cache: "back/forward cache",
  prerender: "prerender",
};

// How users arrive at the page, by share, and a pointer to Back-Forward-Cache when over 5 % of the
// visits come back without the back/forward cache, which would have shown the page at once
export function navigationView(extras) {
  if (!extras.navigationTypes) return null;
  const parts = Object.entries(extras.navigationTypes).map(([type, fraction]) => `${NAVIGATION_LABELS[type] ?? type} ${share(fraction)}`);
  const missed = extras.navigationTypes.back_forward ?? 0;
  return {
    line: `Navigations: ${parts.join(", ")}`,
    hint: missed > 0.05 ? `${share(missed)} of the visits come back without the back/forward cache: run Back-Forward-Cache to see what blocks it.` : null,
  };
}
