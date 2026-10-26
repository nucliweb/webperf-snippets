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
  'api bfcache cdn cls cors cpu css csr dns dom ect fcp fid fps html http https id inp js json lcp loaf rtt ssr svg sw tbt tcp tls ttfb ui url urls'.split(' ')
)
const CAPITALS = { bfcache: 'bfcache', urls: 'URLs' }

// A key in words, without the unit its suffix names, since the value shows it: totalBlockingUntilMs is
// "Total blocking until", isLCP "Is LCP"
export function words(key) {
  const suffix = SUFFIXES.find(([s]) => key.endsWith(s) && key !== s)?.[0]
  const stem = suffix ? key.slice(0, -suffix.length) : key
  const parts = stem
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
  return {
    title: scopes.find((s) => s.title)?.title,
    // Label and phrase come from the same entry, so a sentence never mixes two languages
    words: (key) => scopes.find((s) => s.fields?.[key])?.fields[key] ?? {},
    shape: (key) => ({ ...allFields['*']?.[key], ...allFields[script]?.[key] }),
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

export function describeResult(result, options = {}) {
  const d = dictionaries(result?.script, options)

  const details = Object.entries(result?.details && typeof result.details === 'object' ? result.details : {})
    .filter(([, value]) => !isEmpty(value))
    .map(([key, value]) => ({ ...describeField(key, d), value }))
    .filter((f) => !f.hidden)
    .sort(byOrder)
    .map(({ key, label, format, value, phrase }) => ({
      key,
      label,
      format,
      value,
      text: formatValue(value, format, d.locale),
      ...(phrase ? { phrase: splitPhrase(phrase) } : {}),
    }))

  const items = Array.isArray(result?.items) ? result.items.map((item) => (item && typeof item === 'object' ? item : { value: item })) : []
  // A column empty in every row says nothing
  const columns = [...new Set(items.flatMap((row) => Object.keys(row)))]
    .filter((key) => items.some((row) => !isEmpty(row[key])))
    .map((key) => describeField(key, d))
    .filter((c) => !c.hidden)
    .sort(byOrder)
    .map(({ key, label, format }) => ({ key, label, format }))
  const rows = items.map((row) => ({
    cells: columns.map(({ key, format }) => ({ key, format, value: row[key], text: formatValue(row[key], format, d.locale) })),
  }))

  return { title: d.title, details, columns, rows }
}
