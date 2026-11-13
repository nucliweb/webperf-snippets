// The results that make the command exit with 1: a snippet that failed, and an issue of the severities
// that count in a step the workflow runs itself. A follow-up (a result with a reason) only informs: its
// issues show in the report and leave the exit code to the budgets and to the steps.
function failing(results, severities) {
  const issues = [];
  for (const r of results) {
    if (r.status === "error") issues.push({ id: r.id, message: r.error });
    if (r.reason || !Array.isArray(r.issues)) continue;
    for (const issue of r.issues) {
      if (severities.includes(issue.severity)) {
        issues.push({ id: r.id, message: issue.message, ...(issue.code ? { code: issue.code } : {}), ...(issue.target ? { target: issue.target } : {}) });
      }
    }
  }
  return issues;
}

// The errors that decide the exit code by default, and the ones --baseline compares
export const blockingErrors = (results) => failing(results, ["error"]);

// What --fail-on takes: the issues that make the command exit with 1. error, the default, is the errors
// above; warning adds the warnings of the steps; never leaves the exit code to the budgets,
// --fail-on-regression and the runs that fail.
export const FAIL_ON = ["error", "warning", "never"];

export function parseFailOn(value) {
  if (value === undefined) return "error";
  if (FAIL_ON.includes(value)) return value;
  throw new Error(`--fail-on must be error, warning or never, not "${value}"`);
}

export function failingIssues(results, failOn = "error") {
  if (failOn === "never") return [];
  return failing(results, failOn === "warning" ? ["error", "warning"] : ["error"]);
}
