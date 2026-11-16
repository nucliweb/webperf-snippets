// What a command says on stderr when it ends and the code it exits with, from what the run found.
// 0: nothing failed. 1: the page does not pass, by its budgets, by the comparison with a baseline when
// --fail-on-regression or --fail-on-inconclusive ask for it, or by the issues --fail-on counts.

// One page. stderr names the budgets that failed, also with --json, whose report is on stdout; with
// one of them, the comparison is not named. `failing` is whether its issues fail the run
export function pageOutcome({ budgetViolations, regressions, inconclusive, against, failing }) {
  if (budgetViolations.length > 0) return { lines: budgetViolations.map((v) => `Budget violation: ${v}`), code: 1 };
  const lines = [...regressions.map((r) => `Regression against ${against}: ${r}`), ...inconclusive.map((i) => `Inconclusive against ${against}: ${i}`)];
  return { lines, code: lines.length > 0 || failing ? 1 : 0 };
}

// A matrix: the same rules, for every combination. `failed` is whether a combination failed every run
// or has issues that fail the run
export function matrixOutcome({ budgetViolations, regressions, inconclusive, against, failed }) {
  const lines = [
    ...budgetViolations.map((v) => `Budget violation: ${v}`),
    ...regressions.map((r) => `Regression against ${against} in ${r}`),
    ...inconclusive.map((i) => `Inconclusive against ${against} in ${i}`),
  ];
  return { lines, code: lines.length > 0 || failed ? 1 : 0 };
}
