import { filterSnippets, groupByCategory } from './lib/catalog.js'
import { renderResult } from './lib/render.js'
import { readTrackingData, runSnippet } from './lib/run.js'

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

function showList() {
  const groups = groupByCategory(filterSnippets(snippets, search.value))
  list.innerHTML = groups.length
    ? groups
        .map(
          ([label, items]) =>
            `<h2>${escape(label)}</h2>${items
              .map((s) => `<button type="button" data-id="${escape(s.id)}" title="${escape(s.description)}"${s.id === current?.id ? ' aria-current="true"' : ''}>${escape(s.title)}</button>`)
              .join('')}`
        )
        .join('')
    : '<p class="empty">No snippet matches.</p>'
}

function showSnippet(snippet) {
  current = snippet
  showList()
  const tracking = snippet.tracking
    ? '<p class="note">This snippet records what happens after it runs: run it, use the page, then read the result.</p>'
    : ''
  main.innerHTML = `<h1>${escape(snippet.title)}</h1>
    <p>${escape(snippet.description)}</p>${tracking}
    <div class="actions">
      <button type="button" id="run">Run</button>
      <button type="button" id="read" hidden>Read result</button>
      <a href="${escape(snippet.url)}" target="_blank" rel="noopener">Documentation</a>
    </div>
    <div id="result" aria-live="polite"></div>`
  document.getElementById('run').addEventListener('click', () => run(snippet))
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
  result.innerHTML = renderResult(value)
  return value
}

async function run(snippet) {
  const value = await show(snippet, () => runSnippet(evaluate, snippet.code), document.getElementById('run'))
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

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]')
  if (button) showSnippet(snippets.find((s) => s.id === button.dataset.id))
})
search.addEventListener('input', showList)

fetch('snippets.json')
  .then((response) => response.json())
  .then((data) => {
    snippets = data
    showList()
  })
  .catch(() => {
    list.innerHTML = '<p class="empty">snippets.json is missing: run npm run extension:build.</p>'
  })
