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

// The Copy prompt of a snippet for the inspected page: the URL goes in the place of <url> in the
// command, quoted for the shell, and at the end as the page to measure, so an agent can run it as it
// is. A page the CLI cannot load, such as chrome://, keeps the prompt as it is, which asks for the URL.
export function promptForPage(prompt, url) {
  if (!/^https?:\/\//.test(url ?? '')) return prompt
  return `${prompt.replaceAll('<url>', shellQuote(url))}\nPage to measure: ${url}\n`
}
