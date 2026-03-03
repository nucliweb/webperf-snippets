import { useEffect } from 'react'

export function WebMCP() {
  useEffect(() => {
    if (!navigator.modelContext) return

    import(/* webpackChunkName: "snippets-registry" */ '../lib/snippets-registry').then(({ snippets }) => {
    navigator.modelContext.registerTool({
      name: 'list_snippets',
      description:
        'List all web performance measurement snippets available on this site. Returns metadata without code.',
      inputSchema: { type: 'object', properties: {} },
      execute: () =>
        snippets.map(({ id, category, title, description, url }) => ({
          id,
          category,
          title,
          description,
          url,
        })),
    })

    navigator.modelContext.registerTool({
      name: 'get_snippet',
      description:
        'Get the full JavaScript code for a specific web performance snippet by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Snippet ID (e.g. "LCP", "CLS", "TTFB", "INP"). Use list_snippets to discover available IDs.',
          },
        },
        required: ['id'],
      },
      execute: ({ id }) => {
        const snippet = snippets.find((s) => s.id === id)
        if (!snippet) {
          return { error: `Snippet "${id}" not found. Use list_snippets to see available IDs.` }
        }
        return snippet
      },
    })

    navigator.modelContext.registerTool({
      name: 'search_snippets',
      description:
        'Search web performance snippets by category and/or keyword. Returns metadata without code.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Filter by category. One of: CoreWebVitals, Loading, Interaction, Media, Resources.',
          },
          query: {
            type: 'string',
            description: 'Keyword to filter by title or description.',
          },
        },
      },
      execute: ({ category, query } = {}) => {
        let results = snippets

        if (category) {
          results = results.filter((s) => s.category === category)
        }

        if (query) {
          const q = query.toLowerCase()
          results = results.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q)
          )
        }

        return results.map(({ id, category, title, description, url }) => ({
          id,
          category,
          title,
          description,
          url,
        }))
      },
    })
    })
  }, [])

  return null
}
