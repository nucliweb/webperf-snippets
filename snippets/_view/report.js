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

// A result that measured nothing: the browser lacks the API it reads, it waits for interactions that did
// not happen, or the run skipped it. It has no issue only because it did not look.
const NOT_MEASURED = new Set(['unsupported', 'tracking', 'skipped'])

// How many results, from their summaries, have errors, have warnings and no error, have nothing to fix,
// or measured nothing
export function overviewOf(summaries) {
  const withErrors = summaries.filter((s) => s.errors > 0).length
  const withWarnings = summaries.filter((s) => s.errors === 0 && s.warnings > 0).length
  const notMeasured = summaries.filter((s) => s.errors === 0 && s.warnings === 0 && NOT_MEASURED.has(s.status)).length
  return { snippets: summaries.length, withErrors, withWarnings, withNothingToFix: summaries.length - withErrors - withWarnings - notMeasured, notMeasured }
}

// The snippets that measured nothing go last, and only when there are some
export const describeOverview = ({ snippets, withErrors, withWarnings, withNothingToFix, notMeasured = 0 }) =>
  `${snippets} snippet${snippets === 1 ? '' : 's'}: ${withErrors} with errors, ${withWarnings} with warnings, ${withNothingToFix} with nothing to fix${notMeasured ? `, ${notMeasured} not measured` : ''}`

// Every issue of a list of results, in their order, each with the id of its result; a result that
// failed gives an error issue with its message
export function issuesOf(results) {
  return results.flatMap((result) => {
    const failed = !result || result.status === 'error'
    const list = failed ? [{ severity: 'error', message: result?.error ?? NOTHING }] : Array.isArray(result.issues) ? result.issues : []
    return list.map((i) => ({ ...(i.code ? { code: i.code } : {}), severity: i.severity, id: result?.id, message: i.message, ...(i.target ? { target: i.target } : {}) }))
  })
}

// Every issue of the results in one list, by severity, each with the id of its result and the path of
// its snippet: the one the result carries, or the one pathOf gives for it. Array.prototype.sort keeps the
// order of the results within a severity
export function issueList(results, pathOf = (result) => result?.path) {
  return results
    .flatMap((result) =>
      issuesOf([result]).map(({ code, severity, id, message, target }) => ({ ...(code ? { code } : {}), severity, id, path: pathOf(result), message, ...(target ? { target } : {}) }))
    )
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
}

// The audit as JSON: the results, each with the id and the path of its step, plus the overview and every
// issue of every result in one list, by severity, with the path of its snippet
export function auditReport({ url, date, results }) {
  return { workflow: 'audit', url: url ?? null, date, overview: overviewOf(results.map(summarizeIssues)), issues: issueList(results), results }
}
