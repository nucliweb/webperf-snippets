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

// A cell or a field of the view in its format
function field(f) {
  switch (f.format) {
    case 'selector':
      return typeof f.value === 'string' && f.value.trim() !== '' ? inspect(f.value) : escape(f.text)
    case 'url':
      return `<span class="url" title="${escape(f.href)}">${escape(f.text)}</span>`
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
const td = (cell) => `<td${cellClass(cell)}>${field(cell)}</td>`

// The columns with the same value in every row, as a line above the table
const constantsOf = (constants) =>
  constants.length ? `<p class="constants">${constants.map((c) => `${escape(c.label)} <b>${escape(c.text)}</b>`).join(' · ')}</p>` : ''

function tableOf({ columns, constants, rows }) {
  const head = columns.map((c) => `<th>${escape(c.label)}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.cells.map(td).join('')}</tr>`).join('')
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
