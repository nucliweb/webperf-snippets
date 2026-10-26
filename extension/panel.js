import { filterSnippets, groupByCategory } from './lib/catalog.js'
import { renderResult } from './lib/render.js'
import { readTrackingData, reloadPage, runSnippet } from './lib/run.js'
import { copyText, promptForPage } from './lib/clipboard.js'
import { createSettings } from './lib/settings.js'
import { addToHistory, bySeverity, changeOf, compare, earlierOf, filterCounts, filterRows, fromReport, overview, removeFromHistory, report, reportFileName, summarize } from './lib/audit.js'

// The panel: the list of snippets, and the result of the one that runs on the inspected page


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
const toTop = document.getElementById('to-top')
let snippets = []
let current = null
let lastResult

// What the panel remembers between openings of DevTools (lib/settings.js). The panel stays hidden
// until they are read, so it does not show the default theme or side first
const store = createSettings(chrome.storage)
const saved = await store.load()
const remember = (key, value) => store.save(key, value)
document.documentElement.classList.remove('loading')

// Settings: the theme, which follows DevTools unless the user picks one, and the side of the list
const settings = document.getElementById('settings')
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'devtools' && chrome.devtools?.panels?.themeName === 'dark')
  document.documentElement.classList.toggle('dark', dark)
}
function applySide(side) {
  document.body.classList.toggle('sidebar-right', side === 'right')
}
const chosen = { theme: saved.theme, side: saved.side }
applyTheme(chosen.theme)
applySide(chosen.side)
for (const [name, value] of Object.entries(chosen)) settings.querySelector(`input[name="${name}"][value="${value}"]`).checked = true
settings.addEventListener('change', (event) => {
  const { name, value } = event.target
  remember(name, value)
  if (name === 'theme') applyTheme(value)
  if (name === 'side') applySide(value)
})

// The shortcuts name the modifier key of the platform
const shortcuts = document.getElementById('shortcuts')
if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcuts.querySelector('.mod').textContent = '⌘'
document.getElementById('open-shortcuts').addEventListener('click', () => shortcuts.showModal())
document.getElementById('open-settings').addEventListener('click', () => settings.showModal())
for (const dialog of [shortcuts, settings]) dialog.querySelector('.close').addEventListener('click', () => dialog.close())

const toggle = document.getElementById('toggle-sidebar')
function setSidebar(expanded) {
  document.body.classList.toggle('sidebar-collapsed', !expanded)
  toggle.setAttribute('aria-expanded', String(expanded))
  toggle.title = expanded ? 'Hide the list' : 'Show the list'
  remember('sidebar', expanded ? 'expanded' : 'collapsed')
}
toggle.addEventListener('click', () => setSidebar(document.body.classList.contains('sidebar-collapsed')))
if (saved.sidebar === 'collapsed') setSidebar(false)

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

// The home page: what the snippets are, how to use them, the audit and the categories
const SITE = 'https://webperf-snippets.net'
function showHome() {
  current = null
  remember('snippet', null)
  showList()
  const auditCount = snippets.filter((s) => typeof s.audit === 'number').length
  const categories = groupByCategory(snippets)
    .map(([label, items]) => `<button type="button" data-category="${escape(label)}">${escape(label)} <span class="count">${items.length}</span></button>`)
    .join('')
  main.innerHTML = `<div class="home">
    <h1><img class="icon" src="icons/icon.svg" alt="" width="34" height="34"><img class="logo" src="logo.svg" alt="" width="348" height="48"><span class="visually-hidden">WebPerf Snippets</span></h1>
    <p class="lead">${snippets.length} scripts that measure the performance of the inspected page: Core Web Vitals, loading, interaction, media and network. Each one returns a structured result with its findings, the same one the CLI and AI agents read.</p>
    <ol class="steps">
      <li><strong>Choose a snippet</strong> in the list, or search for one with <kbd>/</kbd>.</li>
      <li><strong>Run it</strong> on the inspected page, with the button or <kbd class="mod">Ctrl</kbd> <kbd>Enter</kbd>.</li>
      <li><strong>Read the issues</strong>: each one says what is wrong and how to fix it. Snippets that record what happens, such as INP or long animation frames, run first; use the page, then press Read result.</li>
    </ol>
    <section class="home-card">
      <h2>Structural audit</h2>
      <p>Runs the ${auditCount} snippets of the audit of the CLI one after the other: render-blocking resources, resource hints, scripts, fonts, images, DOM size and more. Their checks do not depend on timing, so they give the same result on every run.</p>
      <div class="actions"><button type="button" id="run-audit">Run audit</button>
        <label class="option" title="Snippets that make requests of their own add them to Resource Timing, and the next audit would count them; a fresh load of the page starts each audit clean, as the CLI does">
          <input type="checkbox" id="reload-before-audit"${reloadBeforeAudit ? ' checked' : ''}> Reload the page before the audit
        </label>
      </div>
      ${auditList()}
    </section>
    <section class="home-card">
      <h2>Categories</h2>
      <div class="categories">${categories}</div>
    </section>
    <p class="links"><a href="${SITE}" target="_blank" rel="noopener">Documentation</a> · <a href="${SITE}/which-snippet" target="_blank" rel="noopener">Which snippet do I need?</a> · <a href="${SITE}/CLI" target="_blank" rel="noopener">Command-line tool</a></p>
  </div>`
  if (/Mac|iPhone|iPad/.test(navigator.platform)) main.querySelector('.mod').textContent = '⌘'
  document.getElementById('run-audit').addEventListener('click', runAudit)
  document.getElementById('reload-before-audit').addEventListener('change', (event) => {
    reloadBeforeAudit = event.target.checked
    remember('reloadBeforeAudit', reloadBeforeAudit)
  })
  main.querySelector('.audits')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-date]')
    if (!button) return
    const saved = audits.find((r) => r.date === button.dataset.date)
    if (!saved) return
    if (button.classList.contains('open-audit')) {
      audit = fromReport(saved, snippets)
      showAudit()
    } else if (button.classList.contains('download-audit')) {
      downloadReport(saved)
    } else if (button.classList.contains('delete-audit')) {
      audits = removeFromHistory(audits, saved.date)
      remember('audits', audits)
      if (audit?.date === saved.date) audit = fromReport(audits[0], snippets)
      showHome()
    }
  })
  main.querySelector('.categories').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-category]')
    if (!button) return
    setSidebar(true)
    search.value = ''
    showList()
    const heading = [...list.querySelectorAll('h2')].find((h) => h.firstChild.textContent.trim() === button.dataset.category)
    heading?.scrollIntoView({ block: 'start' })
    heading?.nextElementSibling?.focus()
  })
}

// A long view has a button back to its top, once it is half a screen down
main.addEventListener('scroll', () => (toTop.hidden = main.scrollTop < main.clientHeight / 2), { passive: true })
toTop.addEventListener('click', () => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  main.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
})

// The audits the panel keeps (lib/audit.js), newest first, and the one it shows. An audit keeps running
// when another view is shown, and its rows stay, so a result can be opened and the audit found again
let audits = []
let audit = null
let reloadBeforeAudit = saved.reloadBeforeAudit
// The rows the audit table shows, to keep the errors and warnings in focus; the panel remembers it
const FILTERS = { errors: 'Errors', issues: 'Errors and warnings', all: 'All' }
const HIDDEN_BY = { errors: 'without errors', issues: 'with info only or nothing to fix' }
const EMPTY_FOR = { errors: 'No snippet has errors.', issues: 'No snippet has errors or warnings.' }
let auditFilter = FILTERS[saved.auditFilter] ? saved.auditFilter : 'issues'
// Where the audit was when a result of it opened, to come back to the same row
let auditScroll = 0
// The earlier audit the one shown is compared with, when it is not the one just before
let compareWith = {}

function auditList() {
  if (audits.length === 0) return ''
  const items = audits
    .map((saved) => {
      const a = fromReport(saved, snippets)
      const when = new Date(saved.date).toLocaleString()
      return `<li>
        <button type="button" class="open-audit row-link" data-date="${escape(saved.date)}">${escape(saved.url ?? 'unknown page')}</button>
        <span class="when">${escape(when)}</span>
        <span class="summary-line">${escape(a ? overview(a.rows) : '')}</span>
        <span class="audit-actions">
          <button type="button" class="download-audit tool-text" data-date="${escape(saved.date)}" title="Save this audit as a JSON file">Download</button>
          <button type="button" class="delete-audit tool-text" data-date="${escape(saved.date)}" title="Delete this audit">Delete</button>
        </span>
      </li>`
    })
    .join('')
  return `<h3 class="audits-title">Saved audits <span class="count">${audits.length}</span></h3><ol class="audits">${items}</ol>`
}

function downloadReport(saved) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }))
  link.download = reportFileName(saved.url, saved.date)
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
async function runAudit() {
  const steps = snippets.filter((s) => typeof s.audit === 'number').sort((a, b) => a.audit - b.audit)
  audit = { steps, rows: [], done: false, reloading: reloadBeforeAudit, url: undefined, date: new Date().toISOString() }
  const mine = audit
  showAudit()
  if (mine.reloading) {
    const loaded = await reloadPage(evaluate, () => chrome.devtools.inspectedWindow.reload())
    if (audit !== mine) return
    mine.reloading = false
    if (!loaded) {
      mine.done = true
      mine.error = 'The page did not finish loading in 30 s, so the audit did not run. Try again, or turn off the reload'
      renderAudit()
      return
    }
  }
  mine.url = await evaluate('location.href').catch(() => undefined)
  for (const snippet of steps) {
    const result = await runSnippet(evaluate, snippet.expression).catch((error) => ({ status: 'error', error: error.message }))
    // A new audit replaced this one
    if (audit !== mine) return
    audit.rows.push({ snippet, result, summary: summarize(result) })
    renderAudit()
  }
  audit.done = true
  // Kept, so the home page lists it after DevTools closes, and before it shows, so it can be compared
  audits = addToHistory(audits, report({ url: audit.url, date: audit.date, rows: audit.rows }))
  remember('audits', audits)
  renderAudit()
}

function showAudit() {
  current = null
  showList()
  main.scrollTop = 0
  main.innerHTML = `<h1>Structural audit</h1>
    <p>The snippets of the audit of the CLI, run on the inspected page. Open a row for its whole result.</p>
    <div class="actions">
      <button type="button" id="rerun-audit">Run again</button>
      <button type="button" id="copy-audit" class="secondary" title="Copy the audit as JSON, in the shape of the CLI">Copy JSON</button>
      <button type="button" id="download-audit" class="secondary" title="Save the audit as a JSON file">Download JSON</button>
    </div>
    <div id="audit" aria-live="polite"></div>`
  document.getElementById('rerun-audit').addEventListener('click', runAudit)
  const json = () => JSON.stringify(report({ url: audit.url, date: audit.date, rows: audit.rows }), null, 2)
  document.getElementById('copy-audit').addEventListener('click', (event) => copyFrom(event.currentTarget, json()))
  document.getElementById('download-audit').addEventListener('click', () =>
    downloadReport(report({ url: audit.url, date: audit.date, rows: audit.rows }))
  )
  document.getElementById('audit').addEventListener('change', (event) => {
    if (event.target.id !== 'compare-with') return
    compareWith = { audit: audit.date, before: event.target.value }
    renderAudit()
    document.getElementById('compare-with')?.focus()
  })
  document.getElementById('audit').addEventListener('click', (event) => {
    const filter = event.target.closest('button[data-filter]')
    if (filter) {
      auditFilter = filter.dataset.filter
      remember('auditFilter', auditFilter)
      renderAudit()
      return
    }
    const button = event.target.closest('button[data-row]')
    if (button) {
      const row = audit.rows.find((r) => r.snippet.id === button.dataset.row)
      auditScroll = main.scrollTop
      showSnippet(row.snippet, { result: row.result, fromAudit: true })
    }
  })
  renderAudit()
}

// What changed since an earlier audit of the same page, the one just before unless another is chosen,
// as a table per kind of change
function comparison() {
  const saved = audits.find((r) => r.date === audit.date)
  const earlier = saved ? earlierOf(audits, saved) : []
  if (earlier.length === 0) return ''
  const before = (compareWith.audit === audit.date && earlier.find((r) => r.date === compareWith.before)) || earlier[0]
  const c = compare(saved, before)
  const title = (id) => snippets.find((s) => s.auditId === id)?.title ?? id
  const sev = (severity) => `<span class="sev sev-${escape(severity)}">${escape(severity)}</span>`
  const table = (kind, head, rows) =>
    `<div class="table"><table class="${kind}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  const issues = (items, kind) =>
    table(
      kind,
      ['Severity', 'Snippet', 'Issue'],
      items.map((i) => `<tr><td>${sev(i.severity)}</td><td>${escape(title(i.id))}</td><td class="long">${escape(i.message)}</td></tr>`)
    )
  // The issue as it is now, and only the numbers that moved; the text before when its words changed
  const changed = table(
    'changed',
    ['Severity', 'Snippet', 'Issue', 'Change'],
    c.changed.map((i) => {
      const severity = i.severityBefore ? `${sev(i.severityBefore)} → ${sev(i.severity)}` : sev(i.severity)
      const moved = i.before === i.after ? '' : (changeOf(i.before, i.after) ?? `Was: ${i.before}`)
      return `<tr><td>${severity}</td><td>${escape(title(i.id))}</td><td class="long">${escape(i.after)}</td><td${moved.length > 40 ? ' class="long"' : ''}>${escape(moved)}</td></tr>`
    })
  )
  const metrics = table(
    'metrics',
    ['Snippet', 'Before', 'Now'],
    c.metrics.map((m) => `<tr><td>${escape(title(m.id))}</td><td>${escape(m.before)}</td><td>${escape(m.after)}</td></tr>`)
  )
  const moved = ({ errors, warnings, infos }) =>
    [['Errors', errors], ['Warnings', warnings], ['Info', infos]].map(([label, [b, a]]) => `${label} ${b} → ${a}`).join(' · ')
  const section = (heading, count, html) => (count ? `<h4>${heading} <span class="count">${count}</span></h4>${html}` : '')
  const body =
    c.added.length || c.resolved.length || c.changed.length || c.metrics.length
      ? section('Metrics', c.metrics.length, metrics) +
        section('New issues', c.added.length, issues(c.added, 'added')) +
        section('Changed', c.changed.length, changed) +
        section('Resolved', c.resolved.length, issues(c.resolved, 'resolved'))
      : '<p class="note">No issue appeared, changed or went away.</p>'
  const options = earlier
    .map((r, i) => `<option value="${escape(r.date)}"${r === before ? ' selected' : ''}>${escape(new Date(r.date).toLocaleString())}${i === 0 ? ' (previous)' : ''}</option>`)
    .join('')
  return `<section class="comparison"><h3><label>Compared with <select id="compare-with">${options}</select></label> <span class="count">${escape(moved(c.counts))}</span></h3><div class="comparison-body">${body}</div></section>`
}

function renderAudit() {
  const view = document.getElementById('audit')
  if (!view || !audit) return
  view.dataset.done = String(audit.done)
  document.getElementById('rerun-audit').disabled = !audit.done
  for (const id of ['copy-audit', 'download-audit']) document.getElementById(id).disabled = !audit.done || Boolean(audit.error)
  const rows = audit.done ? [...audit.rows].sort(bySeverity) : audit.rows
  // The step that runs now; none once the last row is in, before the audit is marked done
  const next = audit.done || audit.reloading ? undefined : audit.steps[audit.rows.length]
  const status = audit.error
    ? `<p class="status status-error">${escape(audit.error)}</p>`
    : audit.reloading
      ? '<p class="note">Reloading the page, then waiting 3 s after it loads, as the CLI does…</p><progress></progress>'
      : next
    ? `<p class="note">Running ${audit.rows.length + 1} of ${audit.steps.length}: ${escape(next.title)}…</p><progress max="${audit.steps.length}" value="${audit.rows.length}"></progress>`
    : audit.done
      ? `<p class="overview">${escape(overview(audit.rows))}</p>`
      : ''
  // Once the audit is done the filter applies; while it runs, every row shows as it arrives
  const shown = audit.done ? filterRows(rows, auditFilter) : rows
  const hidden = rows.length - shown.length
  const counts = filterCounts(rows)
  const filters = audit.done
    ? `<div class="filter" role="group" aria-label="Show">${Object.entries(FILTERS)
        .map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${key === auditFilter}">${label} <span class="count">${counts[key]}</span></button>`)
        .join('')}</div>`
    : ''
  const more = hidden
    ? `<p class="note hidden-rows">${hidden} more snippet${hidden === 1 ? '' : 's'} ${HIDDEN_BY[auditFilter]} · <button type="button" class="row-link" data-filter="all">Show all</button></p>`
    : ''
  const cell = (n, kind) => `<td class="num">${n ? `<span class="tally tally-${kind}">${n}</span>` : ''}</td>`
  const body = shown
    .map(
      ({ snippet, summary }) => `<tr>
        <td><button type="button" class="row-link" data-row="${escape(snippet.id)}">${escape(snippet.title)}</button></td>
        <td>${escape(summary.metric ?? '')}</td>
        ${cell(summary.errors, 'error')}${cell(summary.warnings, 'warning')}${cell(summary.infos, 'info')}
        <td class="long">${summary.top ? escape(summary.top) : '<span class="clean">No issues found</span>'}</td>
      </tr>`
    )
    .join('')
  view.innerHTML = `${status}${audit.done ? comparison() : ''}${filters}${
    shown.length
      ? `<section><div class="table"><table class="audit-rows"><thead><tr><th>Snippet</th><th>Result</th><th>Errors</th><th>Warnings</th><th>Info</th><th>Main issue</th></tr></thead><tbody>${body}</tbody></table></div></section>`
      : rows.length
        ? `<p class="clean empty-filter">${EMPTY_FOR[auditFilter]}</p>`
        : ''
  }${more}`
}

function showSnippet(snippet, { result: given, fromAudit = false } = {}) {
  current = snippet
  remember('snippet', snippet.id)
  showList()
  const tracking = snippet.tracking
    ? '<p class="note">This snippet records what happens after it runs: run it, use the page, then read the result.</p>'
    : ''
  main.innerHTML = `<h1>${escape(snippet.title)}</h1>
    <p>${escape(snippet.description)}</p>${tracking}
    <div class="actions">${fromAudit ? '<button type="button" id="back-to-audit" class="secondary">← Audit</button>' : ''}
      <button type="button" id="run">Run</button>
      <button type="button" id="read" hidden>Read result</button>
      <button type="button" id="clear" class="secondary" hidden>Clear</button>${snippet.prompt ? '<button type="button" id="copy-prompt" class="secondary" title="Copy a prompt that runs this snippet on the inspected page with the CLI, for an AI agent">Copy prompt</button>' : ''}
      <a href="${escape(snippet.url)}" target="_blank" rel="noopener">Documentation</a>
    </div>
    <div id="result" aria-live="polite"></div>`
  // A result opens at its top, wherever the view before it was
  main.scrollTop = 0
  document.getElementById('run').addEventListener('click', () => run(snippet))
  document.getElementById('back-to-audit')?.addEventListener('click', () => {
    showAudit()
    main.scrollTop = auditScroll
  })
  if (given !== undefined) {
    lastResult = given
    document.getElementById('result').innerHTML = renderResult(given)
    document.getElementById('clear').hidden = false
  }
  document.getElementById('clear').addEventListener('click', () => {
    document.getElementById('result').innerHTML = ''
    document.getElementById('read').hidden = true
    document.getElementById('clear').hidden = true
    lastResult = undefined
  })
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
    const issue = event.target.closest('.to-row')
    if (issue) showRow(issue.dataset.row)
    const source = event.target.closest('.open-source')
    if (source) chrome.devtools.panels.openResource?.(source.dataset.url)
    const url = event.target.closest('.copy-url')
    if (url) copyUrl(url)
  })
}

// Copies the URL of a resource, to paste it in the filter of Network; the button says so for a moment
async function copyUrl(button) {
  const title = button.title
  await copyText(button.dataset.url)
  button.title = 'Copied'
  button.classList.add('copied')
  setTimeout(() => {
    button.title = title
    button.classList.remove('copied')
  }, 2000)
}

// Brings the row of an issue into view, marked and focused, so the keyboard stays with it
function showRow(index) {
  const result = document.getElementById('result')
  const row = result.querySelector(`tr[data-row="${CSS.escape(index)}"]`)
  if (!row) return
  result.querySelector('tr.highlight')?.classList.remove('highlight')
  row.classList.add('highlight')
  row.tabIndex = -1
  row.focus({ preventScroll: true })
  row.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
  document.getElementById('clear').hidden = false
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
document.getElementById('go-home').addEventListener('click', () => snippets.length && showHome())

// Keyboard: / goes to the search box, the arrows move through the list, Enter opens a snippet,
// Ctrl+Enter or Cmd+Enter runs it, and Escape clears the search
const typing = (el) => el?.matches?.('input, textarea, select, [contenteditable="true"]')
const listButtons = () => [...list.querySelectorAll('button[data-id]')]
document.addEventListener('keydown', (event) => {
  // A dialog takes the keyboard while it is open
  if (document.querySelector('dialog[open]')) return
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
    audits = Array.isArray(saved.audits) ? saved.audits : []
    audit = fromReport(audits[0], snippets)
    const last = snippets.find((s) => s.id === saved.snippet)
    if (last) showSnippet(last)
    else showHome()
  })
  .catch(() => {
    list.innerHTML = '<p class="empty">snippets.json is missing: run npm run extension:build.</p>'
  })
