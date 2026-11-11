// The audit: the snippets of the audit workflow of the CLI (cli/src/workflows/audit.js), run one after
// the other on the inspected page, and summed up in one row each

import { formatValue } from './render.js'
import { auditReport, describeOverview, issuesOf, overviewOf, summarizeIssues } from './view/index.js'

const SEVERITY = ['error', 'warning', 'info']
const COUNT_NAMES = { error: 'errors', warning: 'warnings', info: 'infos' }
const RATING = { good: 'good', 'needs-improvement': 'needs improvement', poor: 'poor' }

// What a result found (the view of the results, snippets/_view/report.js: its issues by severity and the
// worst of them), and for a metric its value and rating, as the row of the audit shows it
export function summarize(result) {
  const summary = summarizeIssues(result)
  if (summary.status === 'error' || typeof result.value !== 'number') return summary
  const rating = RATING[result.rating]
  return { ...summary, metric: rating ? `${formatValue(result.value, result.unit)} · ${rating}` : formatValue(result.value, result.unit) }
}

// Errors first, then warnings, then the rest; Array.prototype.sort keeps the order of the audit otherwise
export const bySeverity = (a, b) =>
  Math.sign(b.summary.errors) - Math.sign(a.summary.errors) ||
  Math.sign(b.summary.warnings) - Math.sign(a.summary.warnings) ||
  Math.sign(b.summary.infos) - Math.sign(a.summary.infos)

// The filters of the audit table: the snippets with errors, with errors or warnings, or all of them.
// A filter the panel does not know shows every row
const FILTERS = {
  errors: (r) => r.summary.errors > 0,
  issues: (r) => r.summary.errors > 0 || r.summary.warnings > 0,
  all: () => true,
}
export const filterRows = (rows, filter) => rows.filter(FILTERS[filter] ?? FILTERS.all)
export const filterCounts = (rows) => Object.fromEntries(Object.keys(FILTERS).map((f) => [f, filterRows(rows, f).length]))

export const overview = (rows) => describeOverview(overviewOf(rows.map((r) => r.summary)))

// The audit as JSON, to export or analyze: the results in the shape of the CLI
// (webperf-snippets <url> --workflow audit --json), each with the id of its step, plus the overview and
// every issue of every snippet in one list, by severity. A snippet that returned nothing gives an error
export function report({ url, date, rows }) {
  const results = rows.map(({ snippet, result }) => ({
    id: snippet.auditId,
    path: snippet.path,
    ...(result && typeof result === 'object' ? result : { status: 'error', error: 'The snippet returned nothing' }),
  }))
  return auditReport({ url, date, results })
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
// its snippet by the id of its step, and a result of a snippet that is gone is left out. The JSON of the
// CLI names its workflow in its conditions
export function fromReport(saved, snippets) {
  if (!saved || (saved.workflow ?? saved.conditions?.workflow) !== 'audit' || !Array.isArray(saved.results)) return null
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

// The text of an issue without its times, which move on every run: "until 1543ms", "2.4 s"
const withoutTimes = (message) => String(message).replace(/\d+(?:[.,]\d+)?\s?m?s\b/g, '#t')

// An issue is the same in two audits when its snippet, code and target match. A snippet without codes
// on one side, as in an audit saved before them, pairs by severity and message once the numbers are
// left out: "7 resources delay rendering until 1543ms" and "6 resources … 1210ms" are one issue
const byMessage = (i) => `${i.id}|${i.severity}|${withoutTimes(i.message).replace(/\d+(?:[.,]\d+)?/g, '#')}`
const keyFor = (byMessageOnly) => (i) => (i.code && !byMessageOnly.has(i.id) ? `${i.id}|${i.code}|${i.target ?? ''}` : byMessage(i))

// The snippets whose issues, in one of the audits, all lack a code
function uncoded(issues) {
  const ids = new Set(issues.map((i) => i.id))
  for (const i of issues) if (i.code) ids.delete(i.id)
  return ids
}

// What changed from an audit to a later one of the same page: the issues that are new, the ones that
// are gone, the ones whose numbers or severity moved (changed, with the text before and after, and the
// severity before when it moved; a time alone does not count), how many errors, warnings and info each
// has, and the metrics whose value or rating moved. A message that appears several times counts as many
// times
export function compare(after, before) {
  const old = issuesOf(before.results)
  const now = issuesOf(after.results)
  const issueKey = keyFor(new Set([...uncoded(old), ...uncoded(now)]))
  const waiting = new Map() // key -> issues of the audit before, not matched yet, in their order
  for (const i of old) waiting.set(issueKey(i), [...(waiting.get(issueKey(i)) ?? []), i])
  const added = []
  const changed = []
  let unchanged = 0
  for (const i of now) {
    const match = waiting.get(issueKey(i))?.shift()
    if (!match) added.push(i)
    else if (match.severity !== i.severity) changed.push({ id: i.id, severity: i.severity, severityBefore: match.severity, before: match.message, after: i.message })
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

// The audits of the same page that came before, in a history that is newest first, so the one just
// before is the first
export const earlierOf = (history, saved) => history.filter((r) => r !== saved && r.url === saved.url && r.date < saved.date)
export const previousOf = (history, saved) => earlierOf(history, saved)[0]

// A number in the text of an issue, with its unit when it has one: 706 KB, 1543ms, 12%, 1,200
const NUMBER = /\d[\d,]*(?:\.\d+)?(?:\s?(?:KB|MB|GB|kB|B|ms|s|px|x|%)(?![A-Za-z]))?/g

// What moved between two texts of the same issue, as the numbers before and after: "1759 nodes
// exceeds 1400" and "1745 nodes exceeds 1400" is 1759 → 1745. Nothing when the words changed too, or
// nothing did, so the texts themselves say what changed
export function changeOf(before, after) {
  const words = (text) => String(text).replace(NUMBER, '#')
  if (words(before) !== words(after)) return null
  const was = String(before).match(NUMBER) ?? []
  const is = String(after).match(NUMBER) ?? []
  const moved = was.flatMap((n, i) => (n === is[i] ? [] : [`${n} → ${is[i]}`]))
  return moved.length ? moved.join(' · ') : null
}
