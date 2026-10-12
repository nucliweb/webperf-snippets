"use client";

import { useEffect } from 'react'
import { modelContextOf, registerTools, snippetTools, unregisterTools } from '../lib/webmcp'

// The data of the tools, fetched from the site when an agent first calls one
const data = {
  registry: () => fetch('/webmcp/snippets.json').then((r) => r.json()),
  markdown: (url) => fetch(new URL(url).pathname).then((r) => r.text()),
}

// Registers the snippet tools for the AI agent of the browser (lib/webmcp.js)
export function WebMCP() {
  useEffect(() => {
    const modelContext = modelContextOf(window)
    if (!modelContext) return

    const controller = new AbortController()
    const tools = snippetTools(data)
    registerTools(modelContext, tools, controller.signal).then((errors) => {
      for (const error of errors) console.warn('WebMCP: a tool was not registered.', error)
    })

    return () => {
      controller.abort()
      unregisterTools(modelContext, tools)
    }
  }, [])

  return null
}
