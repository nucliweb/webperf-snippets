// Diagram labels are drawn as SVG text, where an emoji would render with the
// system emoji font. The node tone already carries the good or bad meaning, so
// the diagrams drop the emojis instead of drawing icons next to the text.

const EMOJI = /[\p{Extended_Pictographic}✓✗][️‍]*/gu
const TEXT_KEYS = new Set(['label', 'sub', 'text', 'title'])

function stripEmoji(text) {
  return String(text)
    .split('\n')
    .map((line) => line.replace(EMOJI, '').replace(/ {2,}/g, ' ').trim())
    .join('\n')
}

// Returns a copy of a diagram spec with the emojis removed from its text fields.
// Ids, tones and references between nodes are left as they are.
function cleanSpec(value, key) {
  if (typeof value === 'string') return TEXT_KEYS.has(key) ? stripEmoji(value) : value
  if (Array.isArray(value)) return value.map((item) => cleanSpec(item, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanSpec(v, k)]))
  }
  return value
}

module.exports = { stripEmoji, cleanSpec }
