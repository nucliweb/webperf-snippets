// The view of a snippet result, shared by the panel of the extension, the reports of the CLI and the
// visualizer of the site: the title of its table, its details and its columns with labels, formats and
// order. Each one paints the view its own way, so this module writes no HTML. A field with no entry in
// fields.js or locales/ still reads well: its format comes from the suffix of its key, and its label
// from the key in words.

import FIELDS from './fields.js'
import en from './locales/en.js'
import { formatOfKey, formatValue, SUFFIXES } from './format.js'

export { formatValue }

const LOCALES = { en }

// Kept in capitals when a key is turned into words
const ACRONYMS = new Set(
  'api bfcache cdn cls cors cpu css csr dns dom ect fcp fid fps html http https id inp js json lcp loaf loafs rtt ssr svg sw tbt tcp tls ttfb ui url urls'.split(' ')
)
const CAPITALS = { bfcache: 'bfcache', loaf: 'LoAF', loafs: 'LoAFs', urls: 'URLs' }

// A key in words, without the unit its suffix names, since the value shows it: totalBlockingUntilMs is
// "Total blocking until", isLCP "Is LCP"
export function words(key) {
  const suffix = SUFFIXES.find(([s]) => key.endsWith(s) && key !== s)?.[0]
  const stem = suffix ? key.slice(0, -suffix.length) : key
  const parts = stem
    // Words in mixed case that the split by capitals would break
    .replace(/LoAF(s?)/g, ' loaf$1 ')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase()
      if (ACRONYMS.has(lower)) return CAPITALS[lower] ?? lower.toUpperCase()
      return w.length > 1 && w === w.toUpperCase() ? w : lower
    })
  const text = parts.join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// A field with nothing to show: no value, an empty string, or an empty list or object
const isEmpty = (value) =>
  value === undefined || value === null || value === '' || (typeof value === 'object' && Object.keys(value).length === 0)

// The locale, its language, and English, which has every word
const chainOf = (locale) => [...new Set([locale, locale.split('-')[0], 'en'])]

function dictionaries(script, { locale = 'en', fields = {}, locales = {} }) {
  const allFields = { ...FIELDS, ...fields }
  const allLocales = { ...LOCALES, ...locales }
  const chain = chainOf(locale).map((l) => allLocales[l]).filter(Boolean)
  // The entries of the snippet come before the general ones in any language: a key can mean something
  // else in a snippet, and its own label in English says it better than a general one translated
  const scopes = [...chain.map((d) => d[script]), ...chain.map((d) => d['*'])].filter(Boolean)
  // The words of the view itself (Yes, No, none, rows), in the first language that has them
  const ui = (name) => chain.map((l) => l['*']?.words?.[name]).find((w) => w !== undefined)
  return {
    title: scopes.find((s) => s.title)?.title,
    // Label and phrase come from the same entry, so a sentence never mixes two languages
    words: (key) => scopes.find((s) => s.fields?.[key])?.fields[key] ?? {},
    shape: (key) => ({ ...allFields['*']?.[key], ...allFields[script]?.[key] }),
    ui,
    locale,
  }
}

function describeField(key, d) {
  const shape = d.shape(key)
  const { label, phrase } = d.words(key)
  return { key, label: label ?? words(key), format: shape.format ?? formatOfKey(key), order: shape.order, hidden: shape.hidden, phrase }
}

// A lower order first; a field without one keeps its place after them
const byOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)

const splitPhrase = (template) => {
  const [before, after = ''] = template.split('{value}')
  return { before, after }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The format a value has by its shape, when neither its entry nor the suffix of its key gives one
function shapeOf(value) {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return 'url'
  if (Array.isArray(value)) return value.every(isObject) ? 'table' : 'list'
  if (!isObject(value)) return undefined
  const values = Object.values(value)
  if (values.every((v) => typeof v === 'number')) return 'distribution'
  if (values.every((v) => isObject(v) && typeof v.value === 'number')) return 'phases'
  if (values.every(isObject)) return 'table'
  return 'fields'
}

// The file of a URL, or its host when the path has none
function shortUrl(url) {
  try {
    const { hostname, pathname } = new URL(url)
    return pathname.split('/').filter(Boolean).pop() ?? hostname
  } catch {
    return url
  }
}

// A part of a distribution reads inside a line, so in lower case, unless it starts with an acronym
const inLine = (label) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)

const plural = (forms, n, locale) => (forms?.[new Intl.PluralRules(locale).select(n)] ?? forms?.other ?? '{n}').replace('{n}', n)

// The phases of a metric: a part each, with its share of the whole and the slowest marked, and the
// thresholds of the metric as the scale to draw them on
function phases(value, d, result) {
  const entries = Object.entries(value).map(([key, v]) => [key, typeof v === 'number' ? { value: v } : v])
  const sum = entries.reduce((total, [, v]) => total + v.value, 0)
  // The snippet knows which one is the slowest, also on a tie; otherwise, the longest
  const named = result?.details?.slowestPhase
  const slowest = entries.some(([key]) => key === named)
    ? named
    : entries.reduce((max, [key, v]) => (v.value > (max?.value ?? 0) ? { key, value: v.value } : max), null)?.key
  const parts = entries.map(([key, v]) => ({
    key,
    label: describeField(key, d).label,
    value: v.value,
    text: formatValue(v.value, 'ms', d.locale),
    percent: v.percent ?? (sum > 0 ? Math.round((v.value / sum) * 100) : 0),
    overTarget: v.overTarget === true,
    slowest: key === slowest,
  }))
  const t = result?.thresholds
  const scale = { total: typeof result?.value === 'number' ? result.value : sum, ...(t ? { good: t.good, poor: t.needsImprovement } : {}) }
  const text = parts
    .filter((p) => p.value > 0)
    .map((p) => `${p.label} ${p.text} (${formatValue(p.percent, 'percent', d.locale)})`)
    .join(' · ')
  return { parts, scale, text }
}

// A list of objects as a table: its columns, each with its label, and a row of cells per object
function table(items, d) {
  const rows = items.map((item) => (isObject(item) ? item : { value: item }))
  // A column empty in every row says nothing
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((key) => rows.some((row) => !isEmpty(row[key])))
    .map((key) => describeField(key, d))
    .filter((c) => !c.hidden)
    .sort(byOrder)
    .map(({ key, label, format }) => ({ key, label, format }))
  return {
    columns,
    rows: rows.map((row) => ({ cells: columns.map(({ key }) => describeValue(key, row[key], d, { inTable: true })) })),
  }
}

// A value with its label and its text, and the parts, fields or rows of a value made of others
function describeValue(key, value, d, { inTable = false, result } = {}) {
  const field = describeField(key, d)
  const format = field.format ?? shapeOf(value)
  const base = { key, label: field.label, format, value }
  if (value === undefined || value === null) return { ...base, text: '' }
  switch (format) {
    case 'distribution': {
      const parts = Object.entries(value)
        .filter(([, n]) => n !== 0)
        .map(([k, n]) => ({ key: k, label: inLine(describeField(k, d).label), value: n, text: formatValue(n, 'count', d.locale) }))
      return { ...base, parts, text: parts.length ? parts.map((p) => `${p.label} ${p.text}`).join(' · ') : d.ui('none') }
    }
    case 'phases':
      return { ...base, ...phases(value, d, result) }
    case 'key':
      return { ...base, text: describeField(String(value), d).label }
    case 'table': {
      // An object of objects is a table too, with the key of each one in its row
      const items = Array.isArray(value) ? value : Object.entries(value).map(([name, v]) => ({ name, ...v }))
      return { ...base, ...table(items, d), text: plural(d.ui('rows'), items.length, d.locale) }
    }
    case 'fields': {
      const fields = Object.entries(value)
        .filter(([k, v]) => !isEmpty(v) && !describeField(k, d).hidden)
        .map(([k, v]) => describeValue(k, v, d))
      return { ...base, fields, text: fields.map((f) => `${f.label} ${f.text}`).join(' · ') }
    }
    case 'list':
      return { ...base, text: value.map((v) => formatValue(v, undefined, d.locale)).join(', ') }
    case 'boolean':
      return { ...base, text: inTable ? (value ? '✓' : '') : d.ui(value ? 'yes' : 'no') }
    case 'url':
      return { ...base, text: shortUrl(value), href: value }
    default:
      return { ...base, text: formatValue(value, format, d.locale) }
  }
}

export function describeResult(result, options = {}) {
  const d = dictionaries(result?.script, options)

  const details = Object.entries(isObject(result?.details) ? result.details : {})
    .filter(([, value]) => !isEmpty(value))
    .map(([key, value]) => ({ field: describeField(key, d), value, key }))
    .filter(({ field }) => !field.hidden)
    .sort((a, b) => byOrder(a.field, b.field))
    .map(({ field, key, value }) => ({
      ...describeValue(key, value, d, { result }),
      ...(field.phrase ? { phrase: splitPhrase(field.phrase) } : {}),
    }))

  const { columns, rows } = table(Array.isArray(result?.items) ? result.items : [], d)
  return { title: d.title, details, columns, rows }
}
