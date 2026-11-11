// What a set of results found, the same for the audit of the extension and the reports of the CLI: the
// issues of each result by severity, the overview of all of them and every issue in one list. Only
// counts and order: how each one shows them is its own.

const SEVERITY = ['error', 'warning', 'info']
const RATING = { good: 'good', 'needs-improvement': 'needs improvement', poor: 'poor' }
const NOTHING = 'The snippet returned nothing'

// The issues of a result by severity and the worst of them. A result that failed counts as an error,
// and a rating that is not good as a warning when no issue says more
export function summarizeIssues(result) {
  if (!result || typeof result !== 'object' || result.status === 'error') {
    return { status: 'error', errors: 1, warnings: 0, infos: 0, top: result?.error ?? NOTHING }
  }
  const issues = Array.isArray(result.issues) ? result.issues : []
  const count = (severity) => issues.filter((i) => i.severity === severity).length
  const worst = [...issues].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))[0]
  const summary = { status: result.status, errors: count('error'), warnings: count('warning'), infos: count('info'), top: worst?.message ?? '' }
  if (issues.length === 0 && (result.rating === 'poor' || result.rating === 'needs-improvement')) {
    return { ...summary, warnings: 1, top: `Rated ${RATING[result.rating]}` }
  }
  return summary
}

// How many results, from their summaries, have errors, have warnings and no error, or have nothing to fix
export function overviewOf(summaries) {
  const withErrors = summaries.filter((s) => s.errors > 0).length
  const withWarnings = summaries.filter((s) => s.errors === 0 && s.warnings > 0).length
  return { snippets: summaries.length, withErrors, withWarnings, withNothingToFix: summaries.length - withErrors - withWarnings }
}

export const describeOverview = ({ snippets, withErrors, withWarnings, withNothingToFix }) =>
  `${snippets} snippets: ${withErrors} with errors, ${withWarnings} with warnings, ${withNothingToFix} with nothing to fix`

// Every issue of a list of results, in their order, each with the id of its result; a result that
// failed gives an error issue with its message
export function issuesOf(results) {
  return results.flatMap((result) => {
    const failed = !result || result.status === 'error'
    const list = failed ? [{ severity: 'error', message: result?.error ?? NOTHING }] : Array.isArray(result.issues) ? result.issues : []
    return list.map((i) => ({ ...(i.code ? { code: i.code } : {}), severity: i.severity, id: result?.id, message: i.message, ...(i.target ? { target: i.target } : {}) }))
  })
}

// The audit as JSON: the results, each with the id and the path of its step, plus the overview and every
// issue of every result in one list, by severity, with the path of its snippet. Array.prototype.sort
// keeps the order of the audit within a severity
export function auditReport({ url, date, results }) {
  const pathOf = new Map(results.map((r) => [r.id, r.path]))
  const issues = issuesOf(results)
    .map(({ code, severity, id, message, target }) => ({ ...(code ? { code } : {}), severity, id, path: pathOf.get(id), message, ...(target ? { target } : {}) }))
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
  return { workflow: 'audit', url: url ?? null, date, overview: overviewOf(results.map(summarizeIssues)), issues, results }
}
