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
const text = (value) => (value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))
const cell = (value) => escape(text(value))

// A field with nothing to show: no value, an empty string, or an empty list or object
const isEmpty = (value) =>
  value === undefined || value === null || value === '' || (typeof value === 'object' && Object.keys(value).length === 0)

// Table cells do not wrap, so a column is as wide as its values; only long ones, such as URLs, wrap
const LONG = 40
// The fields that hold a CSS selector of an element of the page, which the panel can inspect
const SELECTOR_FIELDS = new Set(['selector', 'element', 'lcpElement', 'finalElement'])
const isSelector = (key, value) => SELECTOR_FIELDS.has(key) && typeof value === 'string' && value.trim() !== ''
const field = (key, value) =>
  isSelector(key, value)
    ? `<button type="button" class="inspect" data-selector="${escape(value)}" title="Inspect in Elements">${escape(value)}</button>`
    : cell(value)

const cellClass = (value) => (typeof value === 'number' ? ' class="num"' : text(value).length > LONG ? ' class="long"' : '')
const td = (value, key) => `<td${isSelector(key, value) ? '' : cellClass(value)}>${field(key, value)}</td>`

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

function items(result) {
  if (!Array.isArray(result.items) || result.items.length === 0) return ''
  const rows = result.items.map((item) => (item && typeof item === 'object' ? item : { value: item }))
  // A column empty in every row says nothing
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((c) => rows.some((row) => !isEmpty(row[c])))
  const head = columns.map((c) => `<th>${escape(c)}</th>`).join('')
  const body = rows.map((row) => `<tr>${columns.map((c) => td(row[c], c)).join('')}</tr>`).join('')
  const total = typeof result.count === 'number' && result.count > rows.length ? `<p class="note">${rows.length} of ${result.count} items</p>` : ''
  return `<section><h3>Items</h3>${total}<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`
}

function details(object) {
  if (!object || typeof object !== 'object') return ''
  const fields = Object.entries(object)
    .filter(([, value]) => !isEmpty(value))
    .map(([key, value]) => `<dt>${escape(key)}</dt><dd>${field(key, value)}</dd>`).join('')
  return `<section><h3>Details</h3><dl class="details">${fields}</dl></section>`
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

  return [status, metric(result), clean, cors, issues(result.issues), items(result), details(result.details), json].join('')
}
