// A long URL takes one line: its start and its end, with an ellipsis in the middle, as the title of
// the DevTools window shows a page, so two URLs that start alike, such as those of a page with other
// query parameters, stay apart. A button after the text shows the whole URLs it holds, and folds them.

import { escape } from './html.js'

// The length of a shortened URL, with the ellipsis; a URL up to this length stays whole
export const MAX_URL = 80
// The share of the length kept from the end, where the query parameters that tell URLs apart are
const TAIL = 0.4

export function middleEllipsis(url, max = MAX_URL) {
  if (url.length <= max) return url
  const tail = Math.floor((max - 1) * TAIL)
  return `${url.slice(0, max - 1 - tail)}…${url.slice(-tail)}`
}

// A URL in a text ends before a space, a quote or a bracket, and leaves out a full stop or a comma after it
const URL_IN_TEXT = /https?:\/\/[^\s"'<>()[\]]+[^\s"'<>()[\].,;:!?]/g

// The text as HTML, each long URL in it shortened, with the whole URL in data-full and in its title
export function withLongUrls(text) {
  const value = String(text ?? '')
  let html = ''
  let last = 0
  let long = false
  for (const match of value.matchAll(URL_IN_TEXT)) {
    const url = match[0]
    if (url.length <= MAX_URL) continue
    long = true
    html += `${escape(value.slice(last, match.index))}<span class="long-url" data-full="${escape(url)}" title="${escape(url)}">${escape(middleEllipsis(url))}</span>`
    last = match.index + url.length
  }
  return { html: html + escape(value.slice(last)), long }
}

// The button that shows the whole URLs of the element it follows
export const EXPAND_URLS =
  '<button type="button" class="expand-urls" aria-expanded="false" title="Show the whole URL" aria-label="Show the whole URL">' +
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'

// A text and its button, when the text holds a long URL
export const textWithUrls = (text) => {
  const { html, long } = withLongUrls(text)
  return long ? html + EXPAND_URLS : html
}

// Shows the whole URLs of the element the button is in, or shortens them again
export function toggleUrls(button) {
  const expand = button.getAttribute('aria-expanded') !== 'true'
  for (const span of button.parentElement.querySelectorAll('.long-url')) {
    if (!span.dataset.short) span.dataset.short = span.textContent
    span.textContent = expand ? span.dataset.full : span.dataset.short
  }
  const label = expand ? 'Show the URL shortened' : 'Show the whole URL'
  button.setAttribute('aria-expanded', String(expand))
  button.setAttribute('title', label)
  button.setAttribute('aria-label', label)
}
