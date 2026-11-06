// Copies text, with the fallback the site uses for a page that blocks the Clipboard API, which a
// DevTools panel can do. env gives the navigator and document, for the tests.
export async function copyText(text, env = globalThis) {
  try {
    await env.navigator.clipboard.writeText(text)
  } catch {
    const { document } = env
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

// A URL as one shell argument: in single quotes, so ? or & do not break the command
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`

// Whether the CLI can load the page: chrome:// or a file of an extension cannot be measured
export const isLoadable = (url) => /^https?:\/\//.test(url ?? '')

// The inspected page in the place of <url> in a command, quoted for the shell, so an agent can run it
// as it is. A page the CLI cannot load keeps <url>, and the prompt asks for the URL.
export const withPageUrl = (text, url) => (isLoadable(url) ? text.replaceAll('<url>', shellQuote(url)) : text)

// The Copy prompt of a snippet for the inspected page, which also ends with the page to measure
export function promptForPage(prompt, url) {
  if (!isLoadable(url)) return prompt
  return `${withPageUrl(prompt, url)}\nPage to measure: ${url}\n`
}
