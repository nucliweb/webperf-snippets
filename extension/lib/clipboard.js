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

// The Copy prompt of a snippet with the inspected page as the page to measure, so it can be pasted
// into an agent as it is. A page the CLI cannot load, such as chrome://, keeps the prompt as it is,
// which asks for the URL.
export function promptForPage(prompt, url) {
  return /^https?:\/\//.test(url ?? '') ? `${prompt}\nPage to measure: ${url}\n` : prompt
}
