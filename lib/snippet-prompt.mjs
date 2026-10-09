import { existsSync, readFileSync } from 'node:fs'
import { isTrackingSnippet } from '../cli/src/tracking.js'

// Builds the prompt that the "Copy prompt" button of a snippet page copies: the instructions for an
// agent to run that snippet with the CLI and report the result, instead of rewriting it or guessing.

const DOCS = 'https://webperf-snippets.nucliweb.net'
const REPO = 'https://github.com/nucliweb/webperf-snippets/blob/main'

// The Playwright the CLI is tested with, the same in the install and in the run, so the browser the
// first command installs is the one the second expects
export const PLAYWRIGHT = '1.63'

// Snippets an agent cannot run in a meaningful way through the CLI
const EXCLUDED = new Set([
  // Pasted by hand into DevTools Local Overrides
  'DevTools-Overrides/Fetch-XHR-Timeline-inject',
  'DevTools-Overrides/Fetch-XHR-Timeline-read',
  // Helper functions for the console, not a measurement
  'Interaction/Long-Animation-Frames-Helpers',
  // Headless Chromium reports the connection of the machine it runs on, not the one of the users
  'Resources/Network-Bandwidth-Connection-Quality',
])

// Tracking snippets that only record something after a click or a key press
const NEEDS_INPUT = new Set(['CoreWebVitals/INP', 'Interaction/Interactions', 'Interaction/Input-Latency-Breakdown'])

// The CLI cannot navigate back in a way that exposes the real NotRestoredReasons of a site, so the
// result only covers the checks the snippet makes on load
const PARTIAL = new Set(['Loading/Back-Forward-Cache'])

export function promptKind(path, source) {
  if (EXCLUDED.has(path)) return 'excluded'
  if (PARTIAL.has(path)) return 'partial'
  if (isTrackingSnippet(path, source)) return NEEDS_INPUT.has(path) ? 'tracking-input' : 'tracking'
  return 'one-shot'
}

export function cliVersion() {
  return JSON.parse(readFileSync(new URL('../cli/package.json', import.meta.url), 'utf8')).version
}

// The interactions the prompt of a tracking snippet gives; the evals use it for their reference run
export const SCROLL_SCRIPT = {
  interactions: [
    { action: 'scroll', y: 600 },
    { action: 'wait', ms: 500 },
    { action: 'scroll', y: 600 },
    { action: 'wait', ms: 500 },
    { action: 'scroll', y: 600 },
    { action: 'wait', ms: 1000 },
  ],
}

const INPUT_SCRIPT = {
  interactions: [
    { action: 'click', selector: 'button.menu-toggle' },
    { action: 'wait', ms: 500 },
    { action: 'type', selector: 'input[type=search]', text: 'shoes' },
    { action: 'wait', ms: 1000 },
  ],
}

// One step per line, which reads better than one property per line
const json = ({ interactions }) =>
  '```json\n{\n  "interactions": [\n' +
  interactions
    .map((step) => `    { ${Object.entries(step).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`)
    .join(',\n') +
  '\n  ]\n}\n```'

function interactionSection(kind) {
  if (kind === 'tracking') {
    return `
This snippet records what happens after the page loads, so the CLI runs a few interactions first. Save this script as \`interactions.json\`:

${json(SCROLL_SCRIPT)}
`
  }
  if (kind === 'tracking-input') {
    return `
This snippet only records clicks and key presses, so the CLI runs them first. Open the page, choose the interactions people do most (a menu, a filter, a search box) and write \`interactions.json\` with selectors that exist on that page. The selectors below are an example only; if the page has no text field, use only clicks. Keep the \`wait\` at the end, so the CLI reads the snippet after the last interaction has been handled:

${json(INPUT_SCRIPT)}
`
  }
  return ''
}

function partialSection(kind) {
  if (kind !== 'partial') return ''
  return `
## Partial result

The CLI loads the page once and does not navigate back, so the browser cannot report the \`NotRestoredReasons\` of a back navigation. The result covers what the snippet checks on load: a \`window.onunload\` handler and a \`Cache-Control: no-store\` response. Say so in your report: \`no-blockers-detected\` is not a guarantee that the page is eligible. For the full test, point to Chrome DevTools, Application, Back/forward cache, and run the test there.
`
}

const SNIPPETS = new URL('../snippets/', import.meta.url)

// The snippet pages a documentation page links, in the order of the page, with the text after " | "
// of a list item as their description. The prompt lists them, so the agent does not have to tell them
// from the links of the navigation of the published page, which reaches every snippet.
export function relatedSnippets(mdx, docsPath) {
  const related = new Map()
  for (const [, title, path, description = ''] of mdx.matchAll(/\[([^\]]+)\]\(\/([A-Za-z-]+\/[A-Za-z0-9-]+)\)(?:[ \t]*\|[ \t]*([^\n]+))?/g)) {
    if (`/${path}` === docsPath || !existsSync(new URL(`${path}.js`, SNIPPETS))) continue
    const known = related.get(path)
    if (!known || (!known.description && description)) related.set(path, { path, title, description: description.trim() })
  }
  return [...related.values()]
}

function relatedSection(related) {
  if (related.length === 0) return ''
  const items = related.map(({ path, title, description }) => `- ${title} (\`${path}\`)${description ? `: ${description}` : ''}`)
  return `
## Related snippets

The documentation page links these snippets:

${items.join('\n')}
`
}

export function buildPrompt({ path, source, docsPath, cliVersion: version, related = [] }) {
  const kind = promptKind(path, source)
  if (kind === 'excluded') return null

  const name = path.split('/')[1]
  const interactive = kind === 'tracking' || kind === 'tracking-input'
  const command = `npx -y -p webperf-snippets@${version} -p playwright@${PLAYWRIGHT} webperf-snippets <url> --snippet ${name}${interactive ? ' --interact-script interactions.json' : ''} --json`

  return `# Run the ${name} snippet with webperf-snippets

Run this measurement with the webperf-snippets CLI, which loads the page in headless Chromium and runs the published snippet. Do not rewrite the snippet, paste it from memory or estimate the result. If the CLI cannot run, stop and report the error instead of measuring another way.

Snippet: \`${path}\`
CLI version: \`${version}\`
Documentation: ${DOCS}${docsPath}
Source: ${REPO}/snippets/${path}.js
Result contract: ${REPO}/snippets/SCHEMA.md

## Run

Ask for the URL if you do not have it. Install Chromium the first time:

\`\`\`bash
npx -y playwright@${PLAYWRIGHT} install chromium
\`\`\`

It can print a warning about installing the dependencies of the project first. The warning is expected, and Chromium is installed anyway.
${interactionSection(kind)}
Then run the snippet:

\`\`\`bash
${command}
\`\`\`

Options: \`--viewport desktop\` (mobile by default), \`--storage-state <file>\` for a page behind a login, and the \`CRUX_API_KEY\` environment variable to compare with field data.
${partialSection(kind)}
## Read the result

- \`status\`: \`ok\`, \`tracking\`, \`error\` or \`unsupported\`. Report an \`error\` or \`unsupported\` as it is.
- \`issues\`, when present: report them by severity, with the element or URL each one names.
- \`corsLimitedAnalysis: true\`, when present: sizes and timings of cross-origin resources are lower bounds.
- For the thresholds and what each field means, read the documentation page.
${relatedSection(related)}
## Report

The value and its rating, the cause the result points to and the issues.${related.length > 0 ? ' If one of the related snippets looks into that cause, name it as the next one to run, and do not name other snippets.' : ''} After a change, run the same command again and compare.
`
}
