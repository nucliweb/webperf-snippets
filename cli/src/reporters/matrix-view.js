import { basename } from "node:path";
import { rate } from "../ratings.js";
import { blockingErrors } from "../blocking.js";

// The order of the metric columns of the matrix table
const METRICS = ["LCP", "FCP", "TTFB", "CLS", "INP"];

// What the human and markdown reports of a matrix show, so they only differ in how they draw it:
// the title, the metric columns, one row per combination with the rated median of each metric, and
// the errors that decide the exit code.
export function matrixView({ matrix, runs, combinations }) {
  const measured = combinations.filter((c) => !c.error);
  const medianBys = [...new Set(measured.map((c) => c.runs.medianBy))];
  const metrics = METRICS.filter((metric) => measured.some((c) => c.runs.summary[metric]));
  const median = medianBys.length ? `, median by ${medianBys.join(", ")}` : "";

  return {
    file: basename(matrix),
    summary: `${combinations.length} combinations, ${runs} run${runs === 1 ? "" : "s"} each${median}`,
    metrics,
    rows: combinations.map((c) => ({
      combination: c,
      cells: c.error
        ? null
        : metrics.map((metric) => {
            const value = c.runs.summary[metric];
            return value ? { median: value.median, unit: value.unit, rating: rate(metric, value.median) } : null;
          }),
    })),
    errors: combinations.flatMap((c) =>
      c.error ? [`${c.id}: ${c.error}`] : blockingErrors(c.results).map((e) => `${c.id}: ${e.id}: ${e.message}`)
    ),
  };
}
