// The prompt to fix what a result or an audit found: for an agent that works in the repository of the
// site, with what the panel measured (the issues, and for a result its details and the rows the issues
// point to, read through the view of the result) and how to check the fix with the CLI, before and after
// the change. The prompt to measure, which only runs the snippet, is the one of the site
// (lib/snippet-prompt.mjs).

import { describeResult } from './view/index.js'

const TO_FIX = ['error', 'warning']
// What fits in a prompt without burying the issues: the rest is counted, and the run of the CLI lists it
const MAX_ISSUES = 30
const MAX_ROWS = 20
const MAX_LENGTH = 16 * 1024

const issuesToFix = (result) =>
  (Array.isArray(result?.issues) ? result.issues : []).filter((i) => TO_FIX.includes(i.severity))
const bySeverity = (a, b) => TO_FIX.indexOf(a.severity) - TO_FIX.indexOf(b.severity)

// An error or a warning is something to fix; an info alone, a good metric or a snippet that failed is not
export const hasIssuesToFix = (result) => result?.status !== 'error' && issuesToFix(result).length > 0

// A value in a cell of a Markdown table: its pipes escaped and on one line
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')

// The whole URL, which an agent can open, rather than the file the panel shows
const textOf = (field) => (field.format === 'url' && field.href ? field.href : field.text)

const issueLine = (i) => `- ${i.severity}${i.code ? ` \`${i.code}\`` : ''}${i.target ? ` (${i.target})` : ''}: ${i.message}`
const moreIssues = (n) => (n > 0 ? `\n- And ${n} more issues, which the run of step 1 lists.` : '')

function detailLines(view) {
  return view.details
    .map((f) => (f.phrase ? `- ${f.phrase.before}${textOf(f)}${f.phrase.after}` : `- ${f.label}: ${textOf(f)}`))
    .join('\n')
}

// The rows of the table of the result that an issue points to, as a Markdown table
function rowsTable(view, limit) {
  const rows = view.rows.filter((row) => row.issues.length > 0)
  if (rows.length === 0 || view.columns.length === 0) return ''
  const head = `| ${view.columns.map((c) => cell(c.label)).join(' | ')} |\n|${view.columns.map(() => ' --- |').join('')}`
  const body = rows.slice(0, limit).map((row) => `| ${row.cells.map((c) => cell(textOf(c))).join(' | ')} |`)
  const constants = view.constants.length ? `In every row: ${view.constants.map((c) => `${c.label} ${c.text}`).join(' · ')}\n\n` : ''
  const more = rows.length > limit ? `\n\nAnd ${rows.length - limit} more rows, which the run of step 1 lists.` : ''
  return `## The rows the issues point to\n\n${constants}${head}\n${body.join('\n')}${more}\n\n`
}

const intro = (url, measured) => `# Fix the issues WebPerf Snippets found on ${url}

You are working in the repository of this site. The WebPerf Snippets DevTools extension ${measured} and found these issues. Find their cause in the code, propose a change, and check it with the CLI. Do not change anything these issues do not point to.`

const measuredOn = (date, extensionVersion) => `Measured: ${date} with the WebPerf Snippets extension${extensionVersion ? ` ${extensionVersion}` : ''}`

// How to check the fix: a run of the CLI before the change and one after it, compared with the first.
// --baseline compares the errors; the warnings are compared by hand, by what names each issue
function checkSection(command, { interactive = false, sameIssue }) {
  return `## Check the fix

The page above may be in production. Ask for the URL where you can test the change, such as a local or staging server, and use it as \`<url>\` below.${
    interactive
      ? ' This snippet records interactions: write `interactions.json` with the clicks or key presses that reproduce the issues, as its prompt to measure explains.'
      : ''
  } The CLI exits with \`1\` while the page has errors, and still writes the JSON: that is not a failure of the command.

1. Measure before the change:

   \`\`\`bash
   ${command} --json > before.json
   \`\`\`

2. Make the change.
3. Measure again, compared with the first run:

   \`\`\`bash
   ${command} --baseline before.json --json > after.json
   \`\`\`

   The comparison lists the errors that are fixed or new. For the warnings, compare the \`issues\` of both files by ${sameIssue}. The issues above must be gone, and no new one must appear.

## Report

What caused each issue, the change, and what step 3 found.
`
}

// The longest prompt that fits, with fewer of what can be counted instead of listed
function fitting(build, limit) {
  let prompt = build(limit)
  while (prompt.length > MAX_LENGTH && limit > 0) prompt = build(--limit)
  return prompt
}

export function fixPrompt({ snippet, result, url: measured, date, extensionVersion }) {
  if (!snippet?.command || !hasIssuesToFix(result)) return null
  // A page the panel could not read the address of
  const url = measured ?? 'the inspected page'
  const view = describeResult(result)
  const issues = issuesToFix(result).sort(bySeverity)
  const details = detailLines(view)
  const check = checkSection(snippet.command, { interactive: snippet.command.includes('--interact-script'), sameIssue: '`code` and `target`' })

  return fitting(
    (rowLimit) => `${intro(url, 'measured the page below')}

Page: ${url}
Snippet: \`${snippet.path}\` (${snippet.title}), ${snippet.url}
${measuredOn(date, extensionVersion)}

## Issues

${issues.slice(0, MAX_ISSUES).map(issueLine).join('\n')}${moreIssues(issues.length - MAX_ISSUES)}

${details ? `## What the snippet measured\n\n${details}\n\n` : ''}${rowsTable(view, rowLimit)}${check}`,
    MAX_ROWS
  )
}

// The prompt to fix an audit: the errors and warnings of every snippet, the errors of all of them first,
// under the title of each snippet and the id of its step, which the JSON of the CLI names in
// results[].id. A snippet that failed is not something to fix in the site
export function auditFixPrompt({ rows, url: measured, date, extensionVersion }) {
  const found = rows
    .filter(({ snippet, result }) => snippet?.command && hasIssuesToFix(result))
    .flatMap(({ snippet, result }) => issuesToFix(result).map((issue) => ({ snippet, issue })))
    .sort((a, b) => bySeverity(a.issue, b.issue))
  if (found.length === 0) return null
  const url = measured ?? 'the inspected page'
  // The CLI and its version, from the command of a snippet, with the audit workflow instead of the snippet
  const command = `${found[0].snippet.command.split(' <url> ')[0]} <url> --workflow audit`

  const issuesBySnippet = (limit) => {
    const groups = new Map()
    for (const { snippet, issue } of found.slice(0, limit)) groups.set(snippet, [...(groups.get(snippet) ?? []), issue])
    return [...groups]
      .map(([snippet, issues]) => `### ${snippet.title} (step \`${snippet.auditId}\`), ${snippet.url}\n\n${issues.map(issueLine).join('\n')}`)
      .join('\n\n')
  }

  return fitting(
    (limit) => `${intro(url, 'ran the structural audit of the page below, the audit workflow of the CLI,')}

Page: ${url}
${measuredOn(date, extensionVersion)}

## Issues

${issuesBySnippet(limit)}${moreIssues(found.length - limit)}

${checkSection(command, { sameIssue: 'the `id` of their step, `code` and `target`' })}`,
    Math.min(MAX_ISSUES, found.length)
  )
}
