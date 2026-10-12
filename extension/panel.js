import { filterSnippets, groupByCategory } from './lib/catalog.js'
import { renderResult } from './lib/render.js'
import { readTrackingData, runSnippet } from './lib/run.js'
import { copyText, promptForPage } from './lib/clipboard.js'

// The panel: the list of snippets, and the result of the one that runs on the inspected page

if (chrome.devtools?.panels?.themeName === 'dark') document.documentElement.classList.add('dark')

// Runs an expression in the inspected page and resolves with its value
const evaluate = (expression) =>
  new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exception) => {
      if (exception) reject(new Error(exception.value || exception.description || 'The page could not run the snippet'))
      else resolve(result)
    })
  })

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const list = document.getElementById('list')
const main = document.getElementById('main')
const search = document.getElementById('search')
let snippets = []
let current = null
let lastResult

// What the panel remembers between openings of DevTools. Storage can be unavailable, and the panel
// works the same without it
const remember = (key, value) => {
  try {
    localStorage.setItem(`webperf-snippets:${key}`, value)
  } catch {
    // Nothing to remember then
  }
}
const recall = (key) => {
  try {
    return localStorage.getItem(`webperf-snippets:${key}`)
  } catch {
    return null
  }
}

const toggle = document.getElementById('toggle-sidebar')
function setSidebar(expanded) {
  document.body.classList.toggle('sidebar-collapsed', !expanded)
  toggle.setAttribute('aria-expanded', String(expanded))
  toggle.title = expanded ? 'Hide the list' : 'Show the list'
  remember('sidebar', expanded ? 'expanded' : 'collapsed')
}
toggle.addEventListener('click', () => setSidebar(document.body.classList.contains('sidebar-collapsed')))
if (recall('sidebar') === 'collapsed') setSidebar(false)

// Copies text and says so on the button for a moment
async function copyFrom(button, text) {
  const label = button.textContent
  await copyText(text)
  button.textContent = 'Copied'
  setTimeout(() => (button.textContent = label), 2000)
}

function showList() {
  const groups = groupByCategory(filterSnippets(snippets, search.value))
  list.innerHTML = groups.length
    ? groups
        .map(
          ([label, items]) =>
            `<h2>${escape(label)} <span class="count">${items.length}</span></h2>${items
              .map((s) => `<button type="button" data-id="${escape(s.id)}" title="${escape(s.description)}"${s.id === current?.id ? ' aria-current="true"' : ''}>${escape(s.title)}</button>`)
              .join('')}`
        )
        .join('')
    : '<p class="empty">No snippet matches.</p>'
}

function showSnippet(snippet) {
  current = snippet
  remember('snippet', snippet.id)
  showList()
  const tracking = snippet.tracking
    ? '<p class="note">This snippet records what happens after it runs: run it, use the page, then read the result.</p>'
    : ''
  main.innerHTML = `<h1>${escape(snippet.title)}</h1>
    <p>${escape(snippet.description)}</p>${tracking}
    <div class="actions">
      <button type="button" id="run">Run</button>
      <button type="button" id="read" hidden>Read result</button>${snippet.prompt ? '<button type="button" id="copy-prompt" class="secondary" title="Copy a prompt that runs this snippet on the inspected page with the CLI, for an AI agent">Copy prompt</button>' : ''}
      <a href="${escape(snippet.url)}" target="_blank" rel="noopener">Documentation</a>
    </div>
    <div id="result" aria-live="polite"></div>`
  document.getElementById('run').addEventListener('click', () => run(snippet))
  document.getElementById('copy-prompt')?.addEventListener('click', async (event) => {
    // event.currentTarget is null once the handler awaits
    const button = event.currentTarget
    const url = await evaluate('location.href').catch(() => undefined)
    await copyFrom(button, promptForPage(snippet.prompt, url))
  })
  document.getElementById('result').addEventListener('click', (event) => {
    const button = event.target.closest('.copy-json')
    if (button) copyFrom(button, JSON.stringify(lastResult, null, 2))
    const selector = event.target.closest('.inspect')
    if (selector) inspectElement(selector)
  })
}

// Selects the element of a selector in the Elements panel, with inspect() of the DevTools console
async function inspectElement(button) {
  const found = await evaluate(
    `(() => { try { const el = document.querySelector(${JSON.stringify(button.dataset.selector)}); if (!el) return false; inspect(el); return true } catch { return false } })()`
  ).catch(() => false)
  button.classList.toggle('not-found', !found)
  button.title = found ? 'Inspect in Elements' : 'No element matches this selector on the page now'
}

async function show(snippet, work, button) {
  const result = document.getElementById('result')
  button.disabled = true
  result.innerHTML = '<p class="note">Running…</p>'
  let value
  try {
    value = await work()
  } catch (error) {
    value = { status: 'error', error: error.message }
  }
  // The user may have chosen another snippet meanwhile
  if (current !== snippet) return
  button.disabled = false
  lastResult = value
  result.innerHTML = renderResult(value)
  return value
}

async function run(snippet) {
  const value = await show(snippet, () => runSnippet(evaluate, snippet.expression), document.getElementById('run'))
  const read = document.getElementById('read')
  if (!read || current !== snippet) return
  // A tracking snippet answers later through the function its result names
  if (value?.status === 'tracking' && value.getDataFn) {
    read.hidden = false
    read.onclick = () => show(snippet, () => readTrackingData(evaluate, value.getDataFn), read)
  } else {
    read.hidden = true
  }
}

// A reload or a navigation of the inspected page clears what a tracking snippet recorded, so its
// Read result has nothing left to read
chrome.devtools.network?.onNavigated?.addListener(() => {
  const read = document.getElementById('read')
  if (!read || read.hidden) return
  read.hidden = true
  document.getElementById('result').insertAdjacentHTML(
    'afterbegin',
    '<p class="note">The page navigated, which clears what the snippet recorded. Run the snippet again.</p>'
  )
})

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]')
  if (button) showSnippet(snippets.find((s) => s.id === button.dataset.id))
})
search.addEventListener('input', showList)

// Keyboard: / goes to the search box, the arrows move through the list, Enter opens a snippet,
// Ctrl+Enter or Cmd+Enter runs it, and Escape clears the search
const typing = (el) => el?.matches?.('input, textarea, select, [contenteditable="true"]')
const listButtons = () => [...list.querySelectorAll('button[data-id]')]
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !typing(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    if (document.body.classList.contains('sidebar-collapsed')) setSidebar(true)
    search.focus()
    search.select()
    return
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && current) {
    event.preventDefault()
    document.getElementById('run')?.click()
    return
  }
  if (event.key === 'Escape' && event.target === search && search.value) {
    search.value = ''
    showList()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = listButtons()
  if (buttons.length === 0) return
  const at = buttons.indexOf(event.target)
  if (event.target !== search && at === -1) return
  event.preventDefault()
  if (event.key === 'ArrowDown') buttons[Math.min(at + 1, buttons.length - 1)].focus()
  else if (at <= 0) search.focus()
  else buttons[at - 1].focus()
})

fetch('snippets.json')
  .then((response) => response.json())
  .then((data) => {
    snippets = data
    const last = snippets.find((s) => s.id === recall('snippet'))
    if (last) showSnippet(last)
    else showList()
  })
  .catch(() => {
    list.innerHTML = '<p class="empty">snippets.json is missing: run npm run extension:build.</p>'
  })
