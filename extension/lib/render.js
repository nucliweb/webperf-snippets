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
const bySeverity = (list) => [...list].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity))

// Table cells do not wrap, so a column is as wide as its values; only long ones, such as URLs, wrap
const LONG = 40
// The colours of the phases, in order, as the diagrams of the documentation draw them
const PHASE_COLORS = 10

const inspect = (selector) =>
  `<button type="button" class="inspect" data-selector="${escape(selector)}" title="Inspect in Elements">${escape(selector)}</button>`

const percentOf = (value, max) => `${Math.round((value / max) * 1000) / 10}%`

// The phases of a metric: a bar with a segment per phase over the zones of its thresholds, and a row
// per phase with its colour, name, value and share, the slowest one marked
function phasesOf(f) {
  const { scale, parts } = f
  const sum = parts.reduce((total, p) => total + p.value, 0)
  // The poor threshold at 90% of the width, as in the documentation: 0 to 2000 ms for TTFB
  const max = Math.max(scale.total, sum, scale.poor ? scale.poor / 0.9 : 0) || 1
  const zones = scale.good
    ? `<span class="zone zone-good" style="width:${percentOf(scale.good, max)}"></span><span class="zone zone-ni" style="width:${percentOf(scale.poor - scale.good, max)}"></span><span class="zone zone-poor"></span>`
    : ''
  let start = 0
  const segments = parts
    .map((p, i) => {
      const segment = p.value > 0 ? `<span class="phase phase-${i % PHASE_COLORS}" style="left:${percentOf(start, max)};width:${percentOf(p.value, max)}" title="${escape(p.label)} ${escape(p.text)}"></span>` : ''
      start += p.value
      return segment
    })
    .join('')
  const ticks = scale.good
    ? `<div class="phase-ticks"><span style="left:${percentOf(scale.good, max)}">${escape(formatValue(scale.good, 'ms'))}</span><span style="left:${percentOf(scale.poor, max)}">${escape(formatValue(scale.poor, 'ms'))}</span></div>`
    : ''
  const rows = parts
    .map(
      (p, i) =>
        `<li class="phase-row${p.slowest ? ' slowest' : ''}${p.overTarget ? ' over' : ''}"><span class="swatch phase-${i % PHASE_COLORS}"></span><span class="phase-name">${escape(p.label)}</span><span class="phase-value">${escape(p.text)}</span><span class="phase-percent">${escape(formatValue(p.percent, 'percent'))}</span></li>`
    )
    .join('')
  return `<div class="phases"><p class="phases-label">${escape(f.label)}</p><div class="phase-bar" role="img" aria-label="${escape(f.text)}">${zones}${segments}</div>${ticks}<ul class="phase-list">${rows}</ul></div>`
}

const nestedTable = (f) => `<details class="nested"><summary>${escape(f.text)}</summary>${tableOf(f)}</details>`

// The icons of the actions of a resource
const SOURCES_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const COPY_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'

// A URL as its file, with the whole URL as its title, and two actions that panel.js gives their work:
// open it in Sources, and copy it to filter Network by it, since DevTools lets no extension open
// Network on a request. The actions sit over the end of the text, so they take no width of a column.
const resource = (f) =>
  `<span class="resource"><span class="url" title="${escape(f.href)}">${escape(f.text)}</span><span class="resource-actions">` +
  `<button type="button" class="open-source" data-url="${escape(f.href)}" title="Open in Sources" aria-label="Open ${escape(f.text)} in Sources">${SOURCES_ICON}</button>` +
  `<button type="button" class="copy-url" data-url="${escape(f.href)}" title="Copy URL, to filter Network by it" aria-label="Copy the URL of ${escape(f.text)}">${COPY_ICON}</button>` +
  `</span></span>`

// A cell or a field of the view in its format
function field(f) {
  switch (f.format) {
    case 'selector':
      return typeof f.value === 'string' && f.value.trim() !== '' ? inspect(f.value) : escape(f.text)
    case 'url':
      return resource(f)
    case 'distribution':
      return f.parts.length ? f.parts.map((p) => `${escape(p.label)} <b>${escape(p.text)}</b>`).join(' · ') : escape(f.text)
    case 'table':
      return nestedTable(f)
    case 'flags':
      return f.flags.map((flag) => `<span class="flag">${escape(flag)}</span>`).join('')
    case 'fields':
      return `<dl class="details nested">${f.fields.map((n) => `<dt>${escape(n.label)}</dt><dd>${field(n)}</dd>`).join('')}</dl>`
    default:
      return escape(f.text)
  }
}

// A number aligns to the right, a mark is centred, and a long text, a selector among them, wraps
const cellClass = (cell) =>
  typeof cell.value === 'number'
    ? ' class="num"'
    : cell.format === 'boolean'
      ? ' class="mark"'
      : cell.format === 'flags'
        ? ' class="flags"'
        : cell.format === 'url'
          ? ' class="url"'
        : cell.text.length > LONG
          ? ' class="long"'
          : ''
const td = (cell, before = '') => `<td${cellClass(cell)}>${before}${field(cell)}</td>`

// The issues of a row, as dots of their severity at the start of its first cell
const dotsOf = (issues) =>
  issues?.length ? `<span class="dots">${bySeverity(issues).map((i) => `<span class="dot dot-${escape(i.severity)}" title="${escape(i.message)}"></span>`).join('')}</span>` : ''

// The columns with the same value in every row, as a line above the table
const constantsOf = (constants) =>
  constants.length ? `<p class="constants">${constants.map((c) => `${escape(c.label)} <b>${escape(c.text)}</b>`).join(' · ')}</p>` : ''

function tableOf({ columns, constants, rows }) {
  const head = columns.map((c) => `<th>${escape(c.label)}</th>`).join('')
  // The rows of the table of the result know their place, which an issue about one of them leads to
  const body = rows
    .map((row, i) => `<tr${row.issues ? ` data-row="${i}"` : ''}>${row.cells.map((cell, c) => td(cell, c === 0 ? dotsOf(row.issues) : '')).join('')}</tr>`)
    .join('')
  return `${constantsOf(constants)}<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

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
  const sorted = bySeverity(list)
  // An issue about a row of the table leads to it (panel.js)
  const items = sorted
    .map(
      (i) =>
        `<li class="issue issue-${escape(i.severity)}">${
          i.row === undefined ? escape(i.message) : `<button type="button" class="to-row" data-row="${i.row}" title="Show its row">${escape(i.message)}</button>`
        }</li>`
    )
    .join('')
  const count = SEVERITY.map((s) => [s, list.filter((i) => i.severity === s).length])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => plural(n, s))
    .join(', ')
  return `<section><h3>Issues <span class="count">${escape(count)}</span></h3><ul class="issues">${items}</ul></section>`
}

function items(result, view) {
  if (view.rows.length === 0) return ''
  const total = typeof result.count === 'number' && result.count > view.rows.length ? `<p class="note">${view.rows.length} of ${result.count} items</p>` : ''
  return `<section><h3>${escape(view.title)}</h3>${total}${tableOf(view)}</section>`
}

// A field with a phrase reads as a sentence and the phases of a metric are a chart, both before the
// list of the others
function details(view) {
  if (view.details.length === 0) return ''
  const phrases = view.details
    .filter((f) => f.phrase)
    .map((f) => `<p class="phrase">${escape(f.phrase.before)}<strong>${field(f)}</strong>${escape(f.phrase.after)}</p>`)
    .join('')
  const charts = view.details.filter((f) => !f.phrase && f.format === 'phases').map(phasesOf).join('')
  const fields = view.details
    .filter((f) => !f.phrase && f.format !== 'phases')
    .map((f) => `<dt>${escape(f.label)}</dt><dd>${field(f)}</dd>`)
    .join('')
  return `<section><h3>Details</h3>${phrases}${charts}${fields ? `<dl class="details">${fields}</dl>` : ''}</section>`
}

// The next steps of a result, the most important first
const recommendations = (list) =>
  list.length ? `<section><h3>Recommendations</h3><ol class="recommendations">${list.map((r) => `<li>${escape(r)}</li>`).join('')}</ol></section>` : ''

export function renderResult(result) {
  if (result === undefined) return '<p class="status status-error">The snippet returned nothing.</p>'
  // panel.js gives the button its action
  const json = `<div class="raw-actions"><button type="button" class="copy-json">Copy JSON</button></div><details class="raw"><summary>JSON</summary><pre>${escape(JSON.stringify(result, null, 2))}</pre></details>`
  if (!result || typeof result !== 'object') return json

  const view = describeResult(result)
  // "ok" means the snippet ran, not that the page is fine, so it shows nothing; the other states matter.
  // The message is the one of the view, which speaks to the panel rather than to the console
  const status =
    result.status === 'ok'
      ? view.message
        ? `<p class="note">${escape(view.message)}</p>`
        : ''
      : `<p class="status status-${escape(result.status)}">${escape(STATUS[result.status] ?? result.status ?? '')}${
          result.error ? `: ${escape(result.error)}` : ''
        }${view.message ? `. ${escape(view.message)}` : ''}</p>`
  // An audit without findings says so; a metric speaks through its value and rating
  const clean =
    result.status === 'ok' && typeof result.value !== 'number' && !(Array.isArray(result.issues) && result.issues.length > 0)
      ? '<p class="summary">No issues found</p>'
      : ''
  const cors = result.corsLimitedAnalysis
    ? '<p class="note">Some cross-origin resources hide their sizes and timings, so these are lower bounds.</p>'
    : ''

  return [status, metric(result), clean, cors, issues(view.issues), items(result, view), details(view), recommendations(view.recommendations), json].join('')
}
