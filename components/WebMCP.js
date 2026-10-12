"use client";

import { useEffect } from 'react'
import { modelContextOf, registerTools, snippetTools, unregisterTools } from '../lib/webmcp'

// Registers the snippet tools for the AI agent of the browser (lib/webmcp.js). The registry, with the
// code of every snippet, loads only in a browser that has WebMCP.
export function WebMCP() {
  useEffect(() => {
    const modelContext = modelContextOf(window)
    if (!modelContext) return

    const controller = new AbortController()
    let tools = []

    import(/* webpackChunkName: "snippets-registry" */ '../lib/snippets-registry').then(async ({ snippets }) => {
      if (controller.signal.aborted) return
      tools = snippetTools(snippets)
      const errors = await registerTools(modelContext, tools, controller.signal)
      for (const error of errors) console.warn('WebMCP: a tool was not registered.', error)
    })

    return () => {
      controller.abort()
      unregisterTools(modelContext, tools)
    }
  }, [])

  return null
}
