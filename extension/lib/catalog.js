// The list of snippets in the panel: the categories in the order of the site, and the search

const CATEGORIES = [
  ['CoreWebVitals', 'Core Web Vitals'],
  ['Loading', 'Loading'],
  ['Interaction', 'Interaction'],
  ['Media', 'Media'],
  ['Resources', 'Resources'],
  ['DevTools-Overrides', 'DevTools overrides'],
]

export function groupByCategory(snippets) {
  return CATEGORIES.map(([id, label]) => [label, snippets.filter((s) => s.category === id)]).filter(([, list]) => list.length > 0)
}

export function filterSnippets(snippets, query) {
  const q = query.trim().toLowerCase()
  if (!q) return snippets
  return snippets.filter((s) => [s.id, s.title, s.description].some((text) => text.toLowerCase().includes(q)))
}
