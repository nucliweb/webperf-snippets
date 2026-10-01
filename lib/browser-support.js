// Browser support computed from MDN browser-compat-data, never typed by hand.
//
// A page lists the features it needs in its frontmatter (`browserSupport:
// [api.LayoutShift, api.PerformanceObserver]`). This module turns those keys into
// one row per feature and a combined row: the snippet works in a browser only
// when every feature does, from the highest of the versions that introduced them.
// The remark plugin (lib/remark-browser-support.js) draws the result at build time.

const BROWSERS = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'edge', label: 'Edge' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'safari', label: 'Safari' },
]

// Compares dotted versions numerically: "26.2" > "15.4", "9" < "10".
function compareVersions(a, b) {
  const left = String(a).split('.').map(Number)
  const right = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff) return diff
  }
  return 0
}

// One browser of one feature: { state: 'yes' | 'partial' | 'no', version }.
// A support statement is an entry or a list of entries, newest first. Entries
// behind a flag, with a vendor prefix or under another name do not count.
function cellFor(statement) {
  const entries = Array.isArray(statement) ? statement : statement ? [statement] : []
  const entry = entries.find((e) => !e.flags && !e.prefix && !e.alternative_name)
  if (!entry || entry.version_removed) return { state: 'no', version: null }

  const added = entry.version_added
  if (added === false || added === 'preview' || added == null) return { state: 'no', version: null }
  const version = added === true ? null : String(added).replace('≤', '')
  return { state: entry.partial_implementation ? 'partial' : 'yes', version }
}

// The browser needs every feature: one gap breaks it, a partial one keeps it
// partial, and the version is the highest of the versions that introduced them.
function combineCells(cells) {
  if (cells.some((c) => c.state === 'no')) return { state: 'no', version: null }
  const state = cells.some((c) => c.state === 'partial') ? 'partial' : 'yes'
  if (cells.some((c) => c.version === null)) return { state, version: null }
  const version = cells.map((c) => c.version).reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b))
  return { state, version }
}

// The `__compat` block of a feature key such as "api.LayoutShift".
function lookupFeature(bcd, key) {
  const node = key.split('.').reduce((current, part) => current && current[part], bcd)
  if (!node || !node.__compat) throw new Error(`Unknown browser-compat-data feature: ${key}`)
  return node.__compat
}

function supportFor(bcd, keys) {
  const features = keys.map((key) => {
    const compat = lookupFeature(bcd, key)
    const cells = Object.fromEntries(BROWSERS.map((b) => [b.id, cellFor(compat.support[b.id])]))
    return { key, label: featureLabel(key), mdnUrl: compat.mdn_url || null, cells }
  })
  const combined = Object.fromEntries(
    BROWSERS.map((b) => [b.id, combineCells(features.map((f) => f.cells[b.id]))]),
  )
  return { features, combined }
}

// "api.LayoutShift" -> "LayoutShift", "html.elements.img.loading" -> "<img loading>".
function featureLabel(key) {
  const parts = key.split('.')
  if (parts[0] === 'api') return parts.slice(1).join('.')
  if (parts[0] === 'css' && parts[1] === 'properties') return parts.slice(2).join('.')
  if (parts[0] === 'html' && parts[1] === 'elements') {
    const [element, attribute, value] = parts.slice(2)
    if (!attribute) return `<${element}>`
    return value ? `<${element} ${attribute}="${value}">` : `<${element} ${attribute}>`
  }
  return key
}

// The icon emojis are the ones the rehype plugin (lib/rehype-icons.js) turns into
// icons, so the generated text gets the same marks as the rest of the site.
const MARK = { yes: '✅', partial: '⚠️', no: '❌' }

function badgeText(label, cell) {
  if (cell.state === 'no') return `${MARK.no} ${label}`
  const version = cell.version ? ` ${cell.version}+` : ''
  const note = cell.state === 'partial' ? ' (partial)' : ''
  return `${MARK[cell.state]} ${label}${version}${note}`
}

function cellText(cell) {
  if (cell.state === 'no') return MARK.no
  return cell.version ? `${MARK[cell.state]} ${cell.version}` : MARK[cell.state]
}

module.exports = {
  BROWSERS,
  badgeText,
  cellFor,
  cellText,
  combineCells,
  compareVersions,
  featureLabel,
  lookupFeature,
  supportFor,
}
