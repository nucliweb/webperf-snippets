import test from 'node:test'
import assert from 'node:assert/strict'
import { filterSnippets, groupByCategory } from './catalog.js'

const SNIPPETS = [
  { id: 'TTFB', category: 'Loading', title: 'Time to first byte', description: 'Server response' },
  { id: 'LCP', category: 'CoreWebVitals', title: 'Largest contentful paint (LCP)', description: 'Loading performance' },
  { id: 'INP', category: 'CoreWebVitals', title: 'Interaction to next paint (INP)', description: 'Responsiveness' },
  { id: 'Fetch-XHR-Timeline-inject', category: 'DevTools-Overrides', title: 'Fetch XHR', description: 'Overrides' },
]

test('groupByCategory follows the order of the site and keeps the order of the snippets', () => {
  assert.deepEqual(
    groupByCategory(SNIPPETS).map(([category, list]) => [category, list.map((s) => s.id)]),
    [['Core Web Vitals', ['LCP', 'INP']], ['Loading', ['TTFB']], ['DevTools overrides', ['Fetch-XHR-Timeline-inject']]]
  )
})

test('filterSnippets matches the ID, title or description, ignoring case', () => {
  assert.deepEqual(filterSnippets(SNIPPETS, 'paint').map((s) => s.id), ['LCP', 'INP'])
  assert.deepEqual(filterSnippets(SNIPPETS, 'server').map((s) => s.id), ['TTFB'])
  assert.deepEqual(filterSnippets(SNIPPETS, '  ').map((s) => s.id), ['TTFB', 'LCP', 'INP', 'Fetch-XHR-Timeline-inject'])
})
