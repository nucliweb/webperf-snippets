// Single source of truth for the emoji to icon mapping used on the website.
//
// The MDX sources keep the emojis: the skills, llms.txt and the CLI read them as
// plain text. The rehype plugin swaps them for icons only when the page renders.
//
// `kind: "dot"` draws a filled disc (ratings and categories), `kind: "icon"` draws
// an inline SVG. `tone` picks the color token (`--ic-<tone>` in styles/globals.css).
// Shapes are 24 px, stroke only; stroke width and fill live in CSS.

const SHAPES = {
  'check-circle': [
    ['circle', { cx: '12', cy: '12', r: '9.5' }],
    ['path', { d: 'm8 12.5 3 3 5-6' }],
  ],
  'x-circle': [
    ['circle', { cx: '12', cy: '12', r: '9.5' }],
    ['path', { d: 'm9 9 6 6M15 9l-6 6' }],
  ],
  alert: [
    ['path', { d: 'M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z' }],
    ['path', { d: 'M12 9.5v4.2M12 17h.01' }],
  ],
  info: [
    ['circle', { cx: '12', cy: '12', r: '9.5' }],
    ['path', { d: 'M12 11v5.5M12 7.5h.01' }],
  ],
  lightbulb: [
    ['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' }],
    ['path', { d: 'M9 18h6M10 22h4' }],
  ],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  x: [['path', { d: 'm6 6 12 12M18 6 6 18' }]],
}

const dot = (tone, label) => ({ kind: 'dot', tone, label })
const icon = (shape, tone, label) => ({ kind: 'icon', shape, tone, label })

const ICONS = {
  // Ratings
  '🟢': dot('good', 'Good'),
  '🟡': dot('mid', 'Needs improvement'),
  '🔴': dot('poor', 'Poor'),
  // Categories
  '🔵': dot('info', 'Blue'),
  '🟠': dot('orange', 'Orange'),
  '🟣': dot('purple', 'Purple'),
  '🟤': dot('brown', 'Brown'),
  '⚫': dot('dark', 'Black'),
  '⚪': dot('neutral', 'White'),
  // Status
  '✅': icon('check-circle', 'good', 'Yes'),
  '✓': icon('check', 'good', 'Yes'),
  '❌': icon('x-circle', 'poor', 'No'),
  '✗': icon('x', 'poor', 'No'),
  '⚠️': icon('alert', 'mid', 'Warning'),
  '⚠': icon('alert', 'mid', 'Warning'),
  'ℹ️': icon('info', 'info', 'Info'),
  'ℹ': icon('info', 'info', 'Info'),
  '💡': icon('lightbulb', 'orange', 'Tip'),
}

// Longest keys first so "⚠️" (with the variation selector) wins over "⚠".
const EMOJI_PATTERN = Object.keys(ICONS)
  .sort((a, b) => b.length - a.length)
  .join('|')

module.exports = { ICONS, SHAPES, EMOJI_PATTERN }
