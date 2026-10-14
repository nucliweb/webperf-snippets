import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Where the Markdown version of a page is served (lib/page-markdown.mjs writes it before the build)

export const BASE_URL = 'https://webperf-snippets.net'

const CONTENT = join(process.cwd(), 'content')
const pageExists = (page) => existsSync(join(CONTENT, `${page}.mdx`))

// "CoreWebVitals/LCP" gives "/CoreWebVitals/LCP.md"
export const markdownPath = (page) => `/${page}.md`

// The page of a route of the site, as "Category/Name": the home is "index", and a folder with an
// index page is "Folder/index". A route with no page gives null.
export function pageOfRoute(segments = [], exists = pageExists) {
  const path = segments.join('/')
  if (!path) return 'index'
  if (exists(path)) return path
  if (exists(`${path}/index`)) return `${path}/index`
  return null
}

export function markdownUrlOfRoute(segments) {
  const page = pageOfRoute(segments)
  return page && `${BASE_URL}${markdownPath(page)}`
}
