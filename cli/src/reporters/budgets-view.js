// The budgets as the reports show them, each report with its own format of a value: a row per budget,
// passed or not, with by how much it was exceeded or why its metric was not measured.

const difference = (budget) => {
  const over = budget.value - budget.budget;
  return budget.unit === "ms" ? Math.round(over) : Math.round(over * 10000) / 10000;
};

export function budgetRows(budgets, format) {
  return budgets.map((b) => ({
    metric: b.metric,
    value: b.value == null ? "·" : format(b.value, b.unit),
    budget: format(b.budget, b.unit),
    passed: b.verdict === "passed",
    verdict:
      b.verdict === "exceeded"
        ? `exceeded by ${format(difference(b), b.unit)}`
        : b.verdict === "not measured"
          ? `not measured${b.note ? `: ${b.note}` : ""}`
          : "passed",
  }));
}

// The failed budgets of a matrix, each named with its combination, or null when no combination had
// budgets to check
export function matrixBudgetFailures(combinations, format) {
  const checked = combinations.filter((c) => Array.isArray(c.budgets) && c.budgets.length > 0);
  if (checked.length === 0) return null;
  return checked.flatMap((c) =>
    c.budgets
      .filter((b) => b.verdict !== "passed")
      .map((b) =>
        b.verdict === "exceeded"
          ? `${c.id}: ${b.metric} ${format(b.value, b.unit)} exceeds budget ${format(b.budget, b.unit)}`
          : `${c.id}: ${b.metric} was not measured${b.note ? ` (${b.note})` : ""}`
      )
  );
}
