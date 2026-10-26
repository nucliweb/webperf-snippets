import { describeResult } from "../view.js";

// A result with a count and details but no value and no issues, such as the long tasks: whether it is
// one, and its first numbers with the labels and formats of the view, which both reports show
export const isSummaryResult = (r) => r.value === undefined && !Array.isArray(r.issues) && (r.count !== undefined || r.details !== undefined);

export function summaryNumbers(r) {
  return describeResult(r)
    .details.filter((d) => typeof d.value === "number")
    .slice(0, 3)
    .map((d) => `${d.label} ${d.text}`);
}
