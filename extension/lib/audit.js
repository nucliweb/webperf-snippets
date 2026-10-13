// The audit: the snippets of the audit workflow of the CLI (cli/src/workflows/audit.js), run one after
// the other on the inspected page, and summed up in one row each

import { formatValue } from './render.js'

const SEVERITY = ['error', 'warning', 'info']
const COUNT_NAMES = { error: 'errors', warning: 'warnings', info: 'infos' }
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
  const results = rows.map(({ snippet, result }) => ({
    id: snippet.auditId,
    path: snippet.path,
    ...(result && typeof result === 'object' ? result : { status: 'error', error: 'The snippet returned nothing' }),
  }))
  const pathOf = new Map(results.map((r) => [r.id, r.path]))
  const issues = issuesOf(results)
    .map((i) => ({ severity: i.severity, id: i.id, path: pathOf.get(i.id), message: i.message }))
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
  return { workflow: 'audit', url: url ?? null, date, overview: counts(rows), issues, results }
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

// Every issue of a list of results, each with the id of its step; a result that failed gives an error
function issuesOf(results) {
  return results.flatMap((result) => {
    const own = Array.isArray(result?.issues) ? result.issues : []
    const failed = !result || result.status === 'error'
    const list = failed ? [{ severity: 'error', message: result?.error ?? 'The snippet returned nothing' }] : own
    return list.map((i) => ({ severity: i.severity, id: result.id, message: i.message }))
  })
}

// The text of an issue without its times, which move on every run: "until 1543ms", "2.4 s"
const withoutTimes = (message) => String(message).replace(/\d+(?:[.,]\d+)?\s?m?s\b/g, '#t')

// An issue is the same in two audits when its snippet, severity and message match once the numbers are
// left out: "7 resources delay rendering until 1543ms" and "6 resources … 1210ms" are one issue
const issueKey = (i) => `${i.id}|${i.severity}|${withoutTimes(i.message).replace(/\d+(?:[.,]\d+)?/g, '#')}`

// What changed from an audit to a later one of the same page: the issues that are new, the ones that
// are gone, the ones whose numbers moved (changed, with the text before and after; a time alone does
// not count), how many errors, warnings and info each has, and the metrics whose value or rating moved.
// A message that appears several times counts as many times
export function compare(after, before) {
  const old = issuesOf(before.results)
  const now = issuesOf(after.results)
  const waiting = new Map() // key -> issues of the audit before, not matched yet, in their order
  for (const i of old) waiting.set(issueKey(i), [...(waiting.get(issueKey(i)) ?? []), i])
  const added = []
  const changed = []
  let unchanged = 0
  for (const i of now) {
    const match = waiting.get(issueKey(i))?.shift()
    if (!match) added.push(i)
    else if (withoutTimes(match.message) !== withoutTimes(i.message)) changed.push({ id: i.id, severity: i.severity, before: match.message, after: i.message })
    else unchanged++
  }
  const left = new Set([...waiting.values()].flat())
  const resolved = old.filter((i) => left.has(i))
  const tally = (list, severity) => list.filter((i) => i.severity === severity).length
  const counts = Object.fromEntries(SEVERITY.map((s) => [COUNT_NAMES[s], [tally(old, s), tally(now, s)]]))
  const beforeById = new Map(before.results.map((r) => [r.id, r]))
  const metrics = after.results.flatMap((r) => {
    const b = beforeById.get(r.id)
    if (typeof r.value !== 'number' || typeof b?.value !== 'number') return []
    const [was, is] = [summarize(b).metric, summarize(r).metric]
    return was === is ? [] : [{ id: r.id, before: was, after: is }]
  })
  return { since: before.date, added, resolved, changed, unchanged, counts, metrics }
}

// The audit of the same page that came just before, in a history that is newest first
export const previousOf = (history, saved) => history.find((r) => r !== saved && r.url === saved.url && r.date < saved.date)
