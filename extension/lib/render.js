// The HTML of a snippet result, following the return contract of snippets/SCHEMA.md: the metric and
// its rating, the issues, the items as a table, the details, and the whole result as JSON. Every
// value comes from the inspected page, so all of it is escaped.

import { describeResult, formatValue } from './view/index.js'

// The labels, formats and order of the fields come from the view of the result (snippets/_view/,
// copied to lib/view/ by npm run extension:build)
export { formatValue }

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const RATING = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor' }
const STATUS = { ok: 'OK', tracking: 'Tracking', error: 'Error', unsupported: 'Unsupported' }
const SEVERITY = ['error', 'warning', 'info']

// Table cells do not wrap, so a column is as wide as its values; only long ones, such as URLs, wrap
const LONG = 40
// The fields that hold a CSS selector of an element of the page, which the panel can inspect
const SELECTOR_FIELDS = new Set(['selector', 'element', 'lcpElement', 'finalElement'])
const isSelector = (key, value) => SELECTOR_FIELDS.has(key) && typeof value === 'string' && value.trim() !== ''
// A cell or a field of the view, with the text of its format
const field = ({ key, value, text }) =>
  isSelector(key, value)
    ? `<button type="button" class="inspect" data-selector="${escape(value)}" title="Inspect in Elements">${escape(value)}</button>`
    : escape(text)

// A selector is text too, and a long one wraps like a URL
const cellClass = ({ value, text }) => (typeof value === 'number' ? ' class="num"' : text.length > LONG ? ' class="long"' : '')
const td = (cell) => `<td${cellClass(cell)}>${field(cell)}</td>`

function metric(result) {
  if (typeof result.value !== 'number') return ''
  const rating = result.rating ? `<span class="rating rating-${escape(result.rating)}">${escape(RATING[result.rating] ?? result.rating)}</span>` : ''
  const t = result.thresholds
  const thresholds = t
    ? `<p class="thresholds">Good up to ${escape(formatValue(t.good, result.unit))}, poor above ${escape(formatValue(t.needsImprovement, result.unit))}</p>`
    : ''
  return `<div class="metric"><span class="metric-name">${escape(result.metric ?? result.script ?? '')}</span><span class="metric-value">${escape(formatValue(result.value, result.unit))}</span>${rating}</div>${thresholds}`
}

const plural = (n, word) => `${n} ${word}${n === 1 || word === 'info' ? '' : 's'}`

function issues(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const sorted = [...list].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
  const items = sorted.map((i) => `<li class="issue issue-${escape(i.severity)}">${escape(i.message)}</li>`).join('')
  const count = SEVERITY.map((s) => [s, list.filter((i) => i.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => plural(n, s))
    .join(', ')
  return `<section><h3>Issues <span class="count">${escape(count)}</span></h3><ul class="issues">${items}</ul></section>`
}

function items(result, view) {
  if (view.rows.length === 0) return ''
  const head = view.columns.map((c) => `<th>${escape(c.label)}</th>`).join('')
  const body = view.rows.map((row) => `<tr>${row.cells.map(td).join('')}</tr>`).join('')
  const total = typeof result.count === 'number' && result.count > view.rows.length ? `<p class="note">${view.rows.length} of ${result.count} items</p>` : ''
  return `<section><h3>${escape(view.title)}</h3>${total}<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`
}

// A field with a phrase reads as a sentence, before the list of the others
function details(view) {
  if (view.details.length === 0) return ''
  const phrases = view.details
    .filter((f) => f.phrase)
    .map((f) => `<p class="phrase">${escape(f.phrase.before)}<strong>${field(f)}</strong>${escape(f.phrase.after)}</p>`)
    .join('')
  const fields = view.details
    .filter((f) => !f.phrase)
    .map((f) => `<dt>${escape(f.label)}</dt><dd>${field(f)}</dd>`)
    .join('')
  return `<section><h3>Details</h3>${phrases}${fields ? `<dl class="details">${fields}</dl>` : ''}</section>`
}

export function renderResult(result) {
  if (result === undefined) return '<p class="status status-error">The snippet returned nothing.</p>'
  // panel.js gives the button its action
  const json = `<div class="raw-actions"><button type="button" class="copy-json">Copy JSON</button></div><details class="raw"><summary>JSON</summary><pre>${escape(JSON.stringify(result, null, 2))}</pre></details>`
  if (!result || typeof result !== 'object') return json

  // "ok" means the snippet ran, not that the page is fine, so it shows nothing; the other states matter
  const status =
    result.status === 'ok'
      ? result.message
        ? `<p class="note">${escape(result.message)}</p>`
        : ''
      : `<p class="status status-${escape(result.status)}">${escape(STATUS[result.status] ?? result.status ?? '')}${
          result.error ? `: ${escape(result.error)}` : ''
        }${result.message ? `. ${escape(result.message)}` : ''}</p>`
  // An audit without findings says so; a metric speaks through its value and rating
  const clean =
    result.status === 'ok' && typeof result.value !== 'number' && !(Array.isArray(result.issues) && result.issues.length > 0)
      ? '<p class="summary">No issues found</p>'
      : ''
  const cors = result.corsLimitedAnalysis
    ? '<p class="note">Some cross-origin resources hide their sizes and timings, so these are lower bounds.</p>'
    : ''

  const view = describeResult(result)
  return [status, metric(result), clean, cors, issues(result.issues), items(result, view), details(view), json].join('')
}
