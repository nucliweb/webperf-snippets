// The HTML of a snippet result, following the return contract of snippets/SCHEMA.md: the metric and
// its rating, the issues, the items as a table, the details, and the whole result as JSON. Every
// value comes from the inspected page, so all of it is escaped.

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const number = (value, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export function formatValue(value, unit) {
  if (typeof value !== 'number') return String(value)
  switch (unit) {
    case 'ms':
      return `${number(Math.round(value))} ms`
    case 'score':
      return value.toFixed(3)
    case 'bytes':
      return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`
    case 'bpp':
      return `${value.toFixed(3)} bpp`
    case 'fps':
      return `${Math.round(value)} fps`
    default:
      return number(value, 3)
  }
}

const RATING = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor' }
const STATUS = { ok: 'OK', tracking: 'Tracking', error: 'Error', unsupported: 'Unsupported' }
const SEVERITY = ['error', 'warning', 'info']

// A cell or a field: text as it is, and an object or a list as compact JSON
const cell = (value) => (value === undefined || value === null ? '' : escape(typeof value === 'object' ? JSON.stringify(value) : value))

function metric(result) {
  if (typeof result.value !== 'number') return ''
  const rating = result.rating ? `<span class="rating rating-${escape(result.rating)}">${escape(RATING[result.rating] ?? result.rating)}</span>` : ''
  const t = result.thresholds
  const thresholds = t
    ? `<p class="thresholds">Good up to ${escape(formatValue(t.good, result.unit))}, poor above ${escape(formatValue(t.needsImprovement, result.unit))}</p>`
    : ''
  return `<div class="metric"><span class="metric-name">${escape(result.metric ?? result.script ?? '')}</span><span class="metric-value">${escape(formatValue(result.value, result.unit))}</span>${rating}</div>${thresholds}`
}

function issues(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const sorted = [...list].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))
  const items = sorted.map((i) => `<li class="issue issue-${escape(i.severity)}">${escape(i.message)}</li>`).join('')
  return `<section><h3>Issues</h3><ul class="issues">${items}</ul></section>`
}

function items(result) {
  if (!Array.isArray(result.items) || result.items.length === 0) return ''
  const rows = result.items.map((item) => (item && typeof item === 'object' ? item : { value: item }))
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const head = columns.map((c) => `<th>${escape(c)}</th>`).join('')
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${cell(row[c])}</td>`).join('')}</tr>`).join('')
  const total = typeof result.count === 'number' && result.count > rows.length ? `<p class="note">${rows.length} of ${result.count} items</p>` : ''
  return `<section><h3>Items</h3>${total}<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`
}

function details(object) {
  if (!object || typeof object !== 'object') return ''
  const fields = Object.entries(object).map(([key, value]) => `<dt>${escape(key)}</dt><dd>${cell(value)}</dd>`).join('')
  return `<section><h3>Details</h3><dl class="details">${fields}</dl></section>`
}

export function renderResult(result) {
  if (result === undefined) return '<p class="status status-error">The snippet returned nothing.</p>'
  // panel.js gives the button its action
  const json = `<div class="raw-actions"><button type="button" class="copy-json">Copy JSON</button></div><details class="raw"><summary>JSON</summary><pre>${escape(JSON.stringify(result, null, 2))}</pre></details>`
  if (!result || typeof result !== 'object') return json

  const status = `<p class="status status-${escape(result.status)}">${escape(STATUS[result.status] ?? result.status ?? '')}${
    result.error ? `: ${escape(result.error)}` : ''
  }${result.message ? `. ${escape(result.message)}` : ''}</p>`
  const cors = result.corsLimitedAnalysis
    ? '<p class="note">Some cross-origin resources hide their sizes and timings, so these are lower bounds.</p>'
    : ''

  return [status, metric(result), cors, issues(result.issues), items(result), details(result.details), json].join('')
}
