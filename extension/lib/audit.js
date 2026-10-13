// The audit: the snippets of the audit workflow of the CLI (cli/src/workflows/audit.js), run one after
// the other on the inspected page, and summed up in one row each

import { formatValue } from './render.js'

const SEVERITY = ['error', 'warning', 'info']
const RATING = { good: 'good', 'needs-improvement': 'needs improvement', poor: 'poor' }

// What a result found: its issues by severity and the worst of them, and for a metric its value and
// rating. A result that failed counts as an error, and a rating that is not good as a warning when no
// issue says more
export function summarize(result) {
  if (!result || typeof result !== 'object' || result.status === 'error') {
    return { status: 'error', errors: 1, warnings: 0, infos: 0, top: result?.error ?? 'The snippet returned nothing' }
  }
  const issues = Array.isArray(result.issues) ? result.issues : []
  const count = (severity) => issues.filter((i) => i.severity === severity).length
  const worst = [...issues].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))[0]
  const summary = { status: result.status, errors: count('error'), warnings: count('warning'), infos: count('info'), top: worst?.message ?? '' }
  if (typeof result.value === 'number') {
    const rating = RATING[result.rating]
    summary.metric = rating ? `${formatValue(result.value, result.unit)} · ${rating}` : formatValue(result.value, result.unit)
  }
  if (issues.length === 0 && (result.rating === 'poor' || result.rating === 'needs-improvement')) {
    return { ...summary, warnings: 1, top: `Rated ${RATING[result.rating]}` }
  }
  return summary
}

// Errors first, then warnings, then the rest; Array.prototype.sort keeps the order of the audit otherwise
export const bySeverity = (a, b) =>
  Math.sign(b.summary.errors) - Math.sign(a.summary.errors) ||
  Math.sign(b.summary.warnings) - Math.sign(a.summary.warnings) ||
  Math.sign(b.summary.infos) - Math.sign(a.summary.infos)

function counts(rows) {
  const withErrors = rows.filter((r) => r.summary.errors > 0).length
  const withWarnings = rows.filter((r) => r.summary.errors === 0 && r.summary.warnings > 0).length
  return { snippets: rows.length, withErrors, withWarnings, withNothingToFix: rows.length - withErrors - withWarnings }
}

export function overview(rows) {
  const c = counts(rows)
  return `${c.snippets} snippets: ${c.withErrors} with errors, ${c.withWarnings} with warnings, ${c.withNothingToFix} with nothing to fix`
}

// The audit as JSON, to export or analyze: the results in the shape of the CLI
// (webperf-snippets <url> --workflow audit --json), each with the id of its step, plus the overview and
// every issue of every snippet in one list, by severity. A snippet that failed gives an error issue
export function report({ url, date, rows }) {
  const issues = rows.flatMap(({ snippet, result }) => {
    const own = Array.isArray(result?.issues) ? result.issues : []
    const failed = !result || typeof result !== 'object' || result.status === 'error'
    const list = failed ? [{ severity: 'error', message: result?.error ?? 'The snippet returned nothing' }] : own
    return list.map((i) => ({ severity: i.severity, id: snippet.auditId, path: snippet.path, message: i.message }))
  })
  issues.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
  return {
    workflow: 'audit',
    url: url ?? null,
    date,
    overview: counts(rows),
    issues,
    results: rows.map(({ snippet, result }) => ({
      id: snippet.auditId,
      path: snippet.path,
      ...(result && typeof result === 'object' ? result : { status: 'error', error: 'The snippet returned nothing' }),
    })),
  }
}

// webperf-audit-<host>-<YYYY-MM-DD-HHMM>.json, in UTC like the date of the report. The host goes
// without its port: a colon is not valid in a file name everywhere
export function reportFileName(url, date) {
  let host = 'page'
  try {
    host = new URL(url).hostname || host
  } catch {
    // Not a URL: a generic name
  }
  const stamp = date.slice(0, 16).replace('T', '-').replace(':', '')
  return `webperf-audit-${host}-${stamp}.json`
}

// The audit of a report, to show the last one again after the panel closes: each result goes back to
// its snippet by the id of its step, and a result of a snippet that is gone is left out
export function fromReport(saved, snippets) {
  if (!saved || saved.workflow !== 'audit' || !Array.isArray(saved.results)) return null
  const byAuditId = new Map(snippets.filter((s) => s.auditId).map((s) => [s.auditId, s]))
  const rows = saved.results.flatMap(({ id, path, ...result }) => {
    const snippet = byAuditId.get(id)
    return snippet ? [{ snippet, result, summary: summarize(result) }] : []
  })
  return { steps: rows.map((r) => r.snippet), rows, done: true, url: saved.url ?? undefined, date: saved.date }
}

// The audits the panel keeps, as reports, newest first. Each takes 50 to 150 KB, so the last ten fit
// in chrome.storage.local with room to spare
export function addToHistory(history, saved, max = 10) {
  return [saved, ...(history ?? [])].slice(0, max)
}

export const removeFromHistory = (history, date) => history.filter((r) => r.date !== date)
