import { readFileSync } from "node:fs";
import { blockingErrors } from "./blocking.js";
import { describeThrottling } from "./throttling.js";
import { mannWhitneyGreater, hodgesLehmann } from "./stats.js";

// A measurement compared with an earlier one, its baseline: which metrics got worse or better beyond
// the noise of the lab, which errors appeared or went away, and what differs in how both were
// measured. Pure functions over the JSON the CLI prints with --json, so a baseline is any earlier
// output saved with --json > baseline.json.

const METRICS = ["LCP", "FCP", "TTFB", "CLS", "INP"];

// A change counts when it beats the larger of a share of the baseline and a minimum: 10% of a 3 s LCP
// is 300 ms, and 10% of a 200 ms TTFB would be noise. CLS is a score, with no relative part.
export const DEFAULT_THRESHOLDS = {
  LCP: { relative: 0.1, absolute: 100 },
  FCP: { relative: 0.1, absolute: 100 },
  TTFB: { relative: 0.1, absolute: 100 },
  INP: { relative: 0.1, absolute: 50 },
  CLS: { absolute: 0.05 },
};

// The baseline in a file, as { kind: "page" | "matrix", file, data }. Throws with what to do when
// the file is not an output of the CLI.
export function readBaseline(text, file) {
  const howTo = `save one with webperf-snippets <url> --json > ${file}`;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${file} is not JSON: ${howTo}`);
  }
  if (Array.isArray(data?.combinations)) return { kind: "matrix", file, data };
  if (typeof data?.url === "string" && Array.isArray(data.results)) return { kind: "page", file, data };
  throw new Error(`${file} is not an output of webperf-snippets --json: it has neither the results of a page nor the combinations of a matrix; ${howTo}`);
}

export function loadBaseline(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Cannot read the baseline ${path}: ${err.code === "ENOENT" ? "the file does not exist" : err.message}`);
  }
  return readBaseline(text, path);
}

// One part of the threshold of a metric, from --threshold: LCP=15% (relative), LCP=200ms
// (absolute), CLS=0.1 (CLS has only an absolute part, with no unit)
export function parseThreshold(raw) {
  const match = /^([A-Za-z]+)=(\d+(?:\.\d+)?)(%|ms)?$/.exec(raw.trim());
  if (!match) throw new Error(`Invalid --threshold "${raw}": give METRIC=VALUE with its unit, such as LCP=15%, LCP=200ms or CLS=0.1`);
  const [, name, number, unit] = match;
  const metric = name.toUpperCase();
  if (!METRICS.includes(metric)) throw new Error(`Unknown metric "${name}" in --threshold "${raw}". Choose from: ${METRICS.join(", ")}`);
  const value = Number(number);
  if (metric === "CLS") {
    if (unit) throw new Error(`Invalid --threshold "${raw}": CLS is a score, with no unit and no relative part, such as CLS=0.1`);
    return { metric, absolute: value };
  }
  if (unit === "%") return { metric, relative: value / 100 };
  if (unit === "ms") return { metric, absolute: value };
  throw new Error(`Invalid --threshold "${raw}": give the unit, such as ${metric}=15% or ${metric}=200ms`);
}

// The default thresholds with the parts that --threshold changes
export function thresholdsWith(overrides) {
  const thresholds = Object.fromEntries(Object.entries(DEFAULT_THRESHOLDS).map(([metric, parts]) => [metric, { ...parts }]));
  for (const { metric, ...part } of overrides) Object.assign(thresholds[metric], part);
  return thresholds;
}

const round = (n) => Math.round(n * 10000) / 10000;

// The value of a metric in a page: the median of its runs, with their range and their values when there
// are two or more, or its one result, as runs.js picks it
function measured(payload, metric) {
  const summary = payload.runs?.summary?.[metric];
  if (summary) {
    const values = summary.values.filter((value) => value !== null);
    return { value: summary.median, ...(values.length >= 2 ? { range: { min: summary.min, max: summary.max }, values } : {}) };
  }
  const result = payload.results?.find((r) => r.metric === metric && r.status === "ok" && typeof r.value === "number");
  return result ? { value: result.value } : null;
}

// With five runs or more a side, Mann-Whitney U can tell a change from the noise of the runs; with
// fewer, its p-value cannot go under 0.05 (three a side give 0.05 at best), so the range decides.
export const RUNS_FOR_STATISTICS = 5;
const ALPHA = 0.05;

// The evidence of a change: the one-sided p-value in its direction, and the shift with its 95 % interval
function statsOf(base, current, delta) {
  if ((base.values?.length ?? 0) < RUNS_FOR_STATISTICS || (current.values?.length ?? 0) < RUNS_FOR_STATISTICS) return undefined;
  const { p, method } = delta < 0 ? mannWhitneyGreater(base.values, current.values) : mannWhitneyGreater(current.values, base.values);
  const { shift, ci } = hodgesLehmann(base.values, current.values);
  return { p: round(p), shift: round(shift), ci: ci.map(round), method };
}

// A regression must beat the threshold of its metric and, with five runs a side, be unlikely to come
// from the noise of the runs (p < 0.05). With fewer, when the baseline has several runs, it must beat
// the worst of them: a median inside the range of the baseline is noise the baseline already had.
function verdict(base, current, threshold, stats) {
  const worse = current.value - base.value > threshold;
  const better = base.value - current.value > threshold;
  if (stats) return stats.p < ALPHA ? (worse ? "regressed" : better ? "improved" : "unchanged") : "unchanged";
  if (worse && (!base.range || current.value > base.range.max)) return "regressed";
  if (better && (!base.range || current.value < base.range.min)) return "improved";
  return "unchanged";
}

function compareMetrics(base, current, thresholds) {
  const metrics = {};
  for (const metric of METRICS) {
    const b = measured(base, metric);
    const c = measured(current, metric);
    if (!b && !c) continue;
    if (!b || !c) {
      metrics[metric] = { ...(b ? { baseline: b.value } : { current: c.value }), verdict: "not measured" };
      continue;
    }
    const { relative = 0, absolute } = thresholds[metric];
    const threshold = round(Math.max(relative * b.value, absolute));
    const delta = c.value - b.value;
    const stats = statsOf(b, c, delta);
    metrics[metric] = {
      baseline: b.value,
      current: c.value,
      delta: round(delta),
      deltaPercent: b.value === 0 ? null : Math.round((delta / b.value) * 1000) / 10,
      threshold,
      verdict: verdict(b, c, threshold, stats),
      ...(stats ? { stats } : {}),
    };
  }
  return metrics;
}

// A resource of the page itself by its path and query, so the review app of a PR, on another host,
// matches main; any other target as it is
function targetOf(target, pageUrl) {
  if (!target) return "";
  try {
    const url = new URL(target);
    return url.origin === new URL(pageUrl).origin ? url.pathname + url.search : url.href;
  } catch {
    return target;
  }
}

// Two errors are the same when they share a code and a target or, when a snippet has no codes on one
// side (a baseline of 1.4.0), when their messages differ only in their figures: "Render-blocking CSS
// (69.21 KB)…" and "Render-blocking CSS (71.80 KB)…"
const byMessage = (error) => `${error.id}\u0000${error.message.replace(/\d+(?:[.,]\d+)*/g, "#")}`;

function compareErrors(base, current) {
  const baseErrors = blockingErrors(base.results ?? []);
  const currentErrors = blockingErrors(current.results ?? []);
  // The snippets whose errors on one side all lack a code pair by message on both
  const uncoded = (errors) => {
    const ids = new Set(errors.map((e) => e.id));
    for (const e of errors) if (e.code) ids.delete(e.id);
    return ids;
  };
  const byMessageOnly = new Set([...uncoded(baseErrors), ...uncoded(currentErrors)]);
  const keyOf = (error, pageUrl) =>
    error.code && !byMessageOnly.has(error.id) ? `${error.id}\u0000${error.code}\u0000${targetOf(error.target, pageUrl)}` : byMessage(error);
  const byKey = (errors, pageUrl) => new Map(errors.map((error) => [keyOf(error, pageUrl), error]));
  const b = byKey(baseErrors, base.url);
  const c = byKey(currentErrors, current.url);
  return {
    new: [...c].filter(([key]) => !b.has(key)).map(([, error]) => error),
    fixed: [...b].filter(([key]) => !c.has(key)).map(([, error]) => error),
  };
}

const describeWork = (conditions) => (conditions.snippet ? `snippet ${conditions.snippet}` : `workflow ${conditions.workflow}`);
const describeLoad = (throttling) => (throttling ? `with ${describeThrottling(throttling)}` : "without throttling");
const runCount = (payload) => payload.runs?.count ?? 1;
const pathOf = (url) => {
  try {
    const { pathname, search } = new URL(url);
    return pathname + search;
  } catch {
    return url;
  }
};

// Machines whose benchmark indexes differ by more than 35 % give different timings for the same page,
// as do machines with other cores; within that, the noise of the index itself
const MACHINE_DIFFERENCE = 0.35;

function machineWarning(base, current) {
  if (!base || !current) return null;
  const ratio = base.benchmarkIndex / current.benchmarkIndex;
  const differs = Math.max(ratio, 1 / ratio) - 1 > MACHINE_DIFFERENCE;
  if (!differs && base.cores === current.cores) return null;
  const speed = ratio >= 1 ? `${Math.round((ratio - 1) * 100)}% faster` : `${Math.round((1 - ratio) * 100)}% slower`;
  const cores = base.cores === current.cores ? `${base.cores} cores both` : `${base.cores} cores against ${current.cores}`;
  return `the baseline was measured on a machine ${speed} than this one (benchmark index ${base.benchmarkIndex} against ${current.benchmarkIndex}, ${cores}); timings can differ for that alone`;
}

// What differs in how both were measured. The comparison goes on: the warnings say how far to trust it.
function warningsOf(base, current) {
  const warnings = [];
  const b = base.conditions;
  const c = current.conditions;
  if (!b) {
    warnings.push("the baseline comes from a CLI without conditions (1.3.0 or earlier); it cannot say how it was measured");
  } else if (c) {
    if (describeWork(b) !== describeWork(c)) warnings.push(`the baseline was measured with ${describeWork(b)}, and this run with ${describeWork(c)}`);
    if (b.viewport !== c.viewport) warnings.push(`the baseline was measured on ${b.viewport}, and this run on ${c.viewport}`);
    if (b.waitMs !== c.waitMs) warnings.push(`the baseline waited ${b.waitMs} ms after the load, and this run ${c.waitMs} ms`);
  }
  if (describeLoad(base.throttling) !== describeLoad(current.throttling)) {
    warnings.push(`the baseline was measured ${describeLoad(base.throttling)}, and this run ${describeLoad(current.throttling)}`);
  }
  if (runCount(base) < 2) warnings.push("the baseline has 1 run, so only the thresholds apply; measure both with --runs");
  else if (runCount(base) !== runCount(current)) warnings.push(`the baseline has ${runCount(base)} runs, and this run ${runCount(current)}`);
  const machine = machineWarning(b?.machine, c?.machine);
  if (machine) warnings.push(machine);
  if (b && c && b.cliVersion !== c.cliVersion) {
    warnings.push(`the baseline was measured with CLI ${b.cliVersion}, and this run with ${c.cliVersion}; the snippets may have changed`);
  }
  // Another host is the review app of a pull request against production: the same page
  if (pathOf(base.url) !== pathOf(current.url)) warnings.push(`the baseline measured ${pathOf(base.url)} and this run ${pathOf(current.url)}`);
  return warnings;
}

// A page against its baseline, as the `baseline` field of its JSON. The runs of the baseline say how
// much to trust its values, in the header of the reports.
export function compareRun(base, current, { file, thresholds = DEFAULT_THRESHOLDS }) {
  return {
    file,
    url: base.url,
    runs: base.runs ? { count: base.runs.count, medianBy: base.runs.medianBy } : { count: 1 },
    metrics: compareMetrics(base, current, thresholds),
    errors: compareErrors(base, current),
    warnings: warningsOf(base, current),
  };
}

// A matrix against a baseline matrix: each combination with the one of the same id, and the ids that
// only one side has
export function compareMatrix(base, current, { file, thresholds = DEFAULT_THRESHOLDS }) {
  const baseById = new Map(base.combinations.map((c) => [c.id, c]));
  const currentIds = new Set(current.combinations.map((c) => c.id));
  const combinations = {};
  for (const c of current.combinations) {
    if (baseById.has(c.id)) combinations[c.id] = compareRun(baseById.get(c.id), c, { file, thresholds });
  }
  return {
    root: {
      file,
      added: current.combinations.filter((c) => !baseById.has(c.id)).map((c) => c.id),
      missing: base.combinations.filter((c) => !currentIds.has(c.id)).map((c) => c.id),
      warnings: [],
    },
    combinations,
  };
}
