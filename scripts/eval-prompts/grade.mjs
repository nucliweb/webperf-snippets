import { resolve } from 'node:path'
import { PLAYWRIGHT } from '../../lib/snippet-prompt.mjs'

// Grades what an agent did with a Copy prompt, from the transcript of `claude -p --output-format
// stream-json`. The checks read the commands the agent ran, the JSON the CLI returned and the report.
// They are deterministic, except the `judge` checks of a case: a model answers a yes or no question
// about the report that no pattern can answer, and the runner passes its verdicts in.

export function parseTranscript(text) {
  const calls = []
  const byId = new Map()
  const transcript = { calls, report: '', tokens: { input: 0, output: 0 }, apiCostUsd: 0, durationMs: 0, turns: 0 }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const message = JSON.parse(line)
    if (message.type === 'result') {
      const usage = message.usage ?? {}
      Object.assign(transcript, {
        report: message.result ?? '',
        // The input includes what the cache wrote and read, which is most of it in a run with tools
        tokens: {
          input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          output: usage.output_tokens ?? 0,
        },
        // What the run would cost at API prices; with a subscription it is not billed
        apiCostUsd: message.total_cost_usd ?? 0,
        durationMs: message.duration_ms ?? 0,
        turns: message.num_turns ?? 0,
      })
      continue
    }
    for (const block of message.message?.content ?? []) {
      if (block.type === 'tool_use') {
        const call = { name: block.name, input: block.input, output: '' }
        byId.set(block.id, call)
        calls.push(call)
      } else if (block.type === 'tool_result' && byId.has(block.tool_use_id)) {
        const content = block.content
        byId.get(block.tool_use_id).output = Array.isArray(content)
          ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
          : String(content ?? '')
      }
    }
  }
  return transcript
}

const isCliRun = (command, snippet) =>
  /\bwebperf-snippets\b/.test(command) && new RegExp(`--snippet\\s+${snippet}\\b`).test(command)

// The JSON the CLI printed, which can follow npm warnings
function parseCliOutput(output) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end < start) return null
  try {
    return JSON.parse(output.slice(start, end + 1))
  } catch {
    return null
  }
}

// Every run of the snippet through the CLI, with the result of that snippet when the output had one
export function cliRuns(transcript, snippet) {
  return transcript.calls
    .filter((c) => c.name === 'Bash' && isCliRun(c.input.command ?? '', snippet))
    .map((c) => ({ command: c.input.command, result: parseCliOutput(c.output)?.results?.find((r) => r.id === snippet) ?? null }))
}

const argument = (match) => match && (match[1] ?? match[2] ?? match[3])

// The interactions file of the last run of the snippet, wherever the agent saved it. A relative path
// is taken from a `cd` earlier in the same command, or else from the directory the agent started in.
export function interactScript(transcript, snippet, workdir) {
  const command = cliRuns(transcript, snippet).at(-1)?.command ?? ''
  const file = argument(command.match(/--interact-script\s+(?:"([^"]+)"|'([^']+)'|(\S+))/))
  if (!file) return null
  const cd = argument([...command.matchAll(/(?:^|&&|;)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&]+))/g)].at(-1))
  return resolve(workdir, cd ?? '.', file)
}

// "36 ms", "2,448 ms" or "2.45 s", allowing for the rounding of the unit the report uses. A score
// (CLS) has no unit and needs two decimals at least, so "0.8" does not stand for 0.7606.
export function mentionsValue(text, value, unit = 'ms') {
  if (unit === 'score') {
    return [...text.matchAll(/\b\d+\.(\d{2,})\b/g)].some(([raw, decimals]) => Math.abs(Number(raw) - value) <= 0.5 / 10 ** decimals.length)
  }
  for (const [, raw, unit] of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(ms|s)\b/gi)) {
    const n = Number(raw.replaceAll(',', ''))
    if (unit.toLowerCase() === 'ms' && Math.abs(n - value) <= 1) return true
    if (unit.toLowerCase() === 's') {
      const decimals = raw.split('.')[1]?.length ?? 0
      if (Math.abs(n * 1000 - value) <= 500 / 10 ** decimals) return true
    }
  }
  return false
}

const mentionsRating = (text, rating) => new RegExp(`\\b${rating.replace('-', '[\\s-]')}\\b`, 'i').test(text)

// Signs of measuring another way: an own observer, a script driving the browser, Lighthouse
const OWN_MEASUREMENT = /PerformanceObserver|getEntriesByType|largest-contentful-paint|web-vitals|lighthouse|page\.evaluate/i

function writtenCode(call) {
  if (call.name === 'Bash') return call.input.command ?? ''
  if (call.name === 'Write') return call.input.content ?? ''
  if (call.name === 'Edit') return call.input.new_string ?? ''
  return ''
}

// ctx: { pkg, url, interactions, missingSelectors, verdicts }. `pkg` is the package the prompt names
// (the version on npm, or a local tarball) and `url` the page it gives; `interactions` is the file the
// agent left, `missingSelectors` the selectors of it that the fixture does not have, and `verdicts`
// the answers of the judge.
export function gradeRun(evalCase, transcript, ctx) {
  const { snippet, interactive, expect } = evalCase
  const runs = cliRuns(transcript, snippet)
  const last = runs.at(-1)?.result
  const checks = []
  const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail })

  const pinned = runs.filter(
    (r) =>
      r.command.includes(ctx.pkg) &&
      r.command.includes(`playwright@${PLAYWRIGHT}`) &&
      r.command.includes('--json') &&
      (!interactive || r.command.includes('--interact-script'))
  )
  // Without a URL the prompt asks the agent to ask for one, so any run measured a page it chose
  if (expect.noRun) check('no-cli-run', runs.length === 0, runs.at(-1)?.command ?? '')
  else check('runs-cli', pinned.length > 0, runs.at(-1)?.command ?? 'no CLI run')

  const own = transcript.calls.find((c) => OWN_MEASUREMENT.test(writtenCode(c)))
  check('no-own-measurement', !own, own ? writtenCode(own).slice(0, 120) : '')

  // A URL the CLI cannot load: the prompt asks the agent to stop and report the error, so every run
  // must be on that URL, not on another page that loads
  if (expect.cliFails) {
    const other = runs.find((r) => !r.command.includes(ctx.url))
    check('same-url', !other, other?.command ?? '')
  } else if (!expect.noRun) {
    check('cli-result', last && expect.status.includes(last.status), last ? `status ${last.status}` : 'no result')
  }

  if (expect.details) {
    const differs = Object.entries(expect.details).filter(([key, value]) => last?.details?.[key] !== value)
    check('matches-details', last && differs.length === 0, differs.map(([key]) => `${key}: ${last?.details?.[key]}`).join(', '))
  }

  if (expect.reference) {
    const { value, tolerance } = expect.reference
    check('matches-reference', last && Math.abs(last.value - value) <= tolerance, `${last?.value} vs ${value} ±${tolerance}`)
  }

  if (interactive) {
    const steps = ctx.interactions?.interactions ?? []
    const missing = ctx.missingSelectors ?? []
    check('selectors-exist', steps.length > 0 && missing.length === 0, ctx.interactions ? missing.join(', ') : 'no interactions.json')
    if (expect.noTyping) check('no-typing', !steps.some((s) => s.action === 'type'))
    if (expect.minInteractions) {
      const count = last?.details?.totalInteractions ?? 0
      check('records-interactions', count >= expect.minInteractions, `${count} interactions`)
    }
  }

  if (last && typeof last.value === 'number') {
    const unit = last.unit ?? 'ms'
    check('reports-value', mentionsValue(transcript.report, last.value, unit), `${last.value} ${unit}`)
  }
  if (last?.rating) check('reports-rating', mentionsRating(transcript.report, last.rating), last.rating)

  // The prompt asks the agent to name, as the next one to run, a snippet the documentation links
  if (expect.nextSnippet) {
    const named = namedSnippets(transcript.report, ctx.catalog).filter((path) => path !== evalCase.path)
    const unlinked = named.filter((path) => !ctx.linked.includes(path))
    check('names-next-snippet', named.some((path) => ctx.linked.includes(path)), named.join(', ') || 'none named')
    check('next-snippet-linked', unlinked.length === 0, unlinked.join(', '))
  }

  for (const { id, pattern } of expect.mentions ?? []) check(id, pattern.test(transcript.report))
  for (const { id } of expect.judge ?? []) {
    const verdict = ctx.verdicts?.[id]
    check(id, verdict?.pass, verdict?.reason ?? 'no verdict')
  }

  return checks
}

// The question a judge answers about a report, with the CLI result the report should follow
export function judgePrompt(question, result, report) {
  return `You check a report that an agent wrote after running a web performance snippet. Judge only what the report says, against the CLI result below.

Question: ${question}

CLI result:
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

Report:
<report>
${report}
</report>

Answer PASS or FAIL on the first line, then the reason in one sentence.`
}

export function parseVerdict(text) {
  const [, verdict, reason = ''] = text.trim().match(/^(PASS|FAIL)\b[:.\s-]*([\s\S]*)/i) ?? []
  return { pass: verdict?.toUpperCase() === 'PASS', reason: reason.trim() || text.trim() }
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NOT_NAME = '[A-Za-z0-9-]'

// The snippets ("Category/Name") a documentation page links to, in the order of the page
export function linkedSnippets(mdx, catalog) {
  const paths = [...mdx.matchAll(/\]\(\/([A-Za-z]+\/[A-Za-z0-9-]+)\)/g)].map(([, path]) => path)
  return [...new Set(paths)].filter((path) => catalog.includes(path))
}

// The snippets a report names: by path ("/Loading/TTFB"), or by a compound name with hyphens or spaces
// ("LCP-Subparts", "LCP Subparts"). A one-word name counts only as a path, since "TTFB" or "FCP" in a
// report is most often the metric.
export function namedSnippets(text, catalog) {
  return catalog.filter((path) => {
    const name = path.split('/')[1]
    const forms = [escape(path)]
    if (name.includes('-')) forms.push(name.split('-').map(escape).join('[-\\s]'))
    return new RegExp(`(?<!${NOT_NAME})(?:${forms.join('|')})(?!${NOT_NAME})`, 'i').test(text)
  })
}

