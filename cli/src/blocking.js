// The results that make the command exit with 1: a snippet that failed, and an issue of severity
// error in a step the workflow runs itself. A follow-up (a result with a reason) only informs: its
// error issues show in the report and leave the exit code to the budgets and to the steps.
export function blockingErrors(results) {
  const errors = [];
  for (const r of results) {
    if (r.status === "error") errors.push({ id: r.id, message: r.error });
    if (r.reason || !Array.isArray(r.issues)) continue;
    for (const issue of r.issues) if (issue.severity === "error") errors.push({ id: r.id, message: issue.message });
  }
  return errors;
}
