// The formats of the values of a result, with the numbers written as the locale writes them. A field
// without a format in fields.js takes it from the suffix of its key.

const KB = 1024
const MB = 1024 * 1024

const number = (value, locale, digits = 0, minimum = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: minimum }).format(value)

const FORMATS = {
  ms: (value, locale) => `${number(Math.round(value), locale)} ms`,
  bytes: (value, locale) =>
    value >= MB ? `${number(value / MB, locale, 1, 1)} MB` : value >= KB ? `${number(value / KB, locale, 1, 1)} KB` : `${number(value, locale)} B`,
  percent: (value, locale) => new Intl.NumberFormat(locale, { style: 'unit', unit: 'percent', maximumFractionDigits: 1 }).format(value),
  count: (value, locale) => number(value, locale),
  score: (value, locale) => number(value, locale, 3, 3),
  bpp: (value, locale) => `${number(value, locale, 3, 3)} bpp`,
  fps: (value, locale) => `${number(Math.round(value), locale)} fps`,
  px: (value, locale) => `${number(Math.round(value), locale)} px`,
}

// The suffixes that name a unit, and the format each one gives
export const SUFFIXES = [
  ['Ms', 'ms'],
  ['Bytes', 'bytes'],
  ['Percent', 'percent'],
  ['Count', 'count'],
  ['Px', 'px'],
]

export const formatOfKey = (key) => SUFFIXES.find(([suffix]) => key.endsWith(suffix) && key !== suffix)?.[1]

// Text as it is, a number in its format, and an object or a list as compact JSON
export function formatValue(value, format, locale = 'en') {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return (FORMATS[format] ?? ((v, l) => number(v, l, 3)))(value, locale)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
