import { PLAYWRIGHT } from '../../lib/snippet-prompt.mjs'

// Grades what an agent did with a Copy prompt, from the transcript of `claude -p --output-format
// stream-json`. Every check is deterministic: it reads the commands the agent ran, the JSON the CLI
// returned and the report, never asks a model for an opinion.

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

// "36 ms", "2,448 ms" or "2.45 s", allowing for the rounding of the unit the report uses
export function mentionsValue(text, value) {
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

// ctx: { pkg }, the package the prompt names: the version on npm, or a local tarball
export function gradeRun(evalCase, transcript, ctx) {
  const { snippet, expect } = evalCase
  const runs = cliRuns(transcript, snippet)
  const last = runs.at(-1)?.result
  const checks = []
  const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail })

  const pinned = runs.filter(
    (r) =>
      r.command.includes(ctx.pkg) &&
      r.command.includes(`playwright@${PLAYWRIGHT}`) &&
      r.command.includes('--json')
  )
  check('runs-cli', pinned.length > 0, runs.at(-1)?.command ?? 'no CLI run')

  const own = transcript.calls.find((c) => OWN_MEASUREMENT.test(writtenCode(c)))
  check('no-own-measurement', !own, own ? writtenCode(own).slice(0, 120) : '')

  check('cli-result', last && expect.status.includes(last.status), last ? `status ${last.status}` : 'no result')

  if (expect.reference) {
    const { value, tolerance } = expect.reference
    check('matches-reference', last && Math.abs(last.value - value) <= tolerance, `${last?.value} vs ${value} ±${tolerance}`)
  }

  if (last && typeof last.value === 'number') check('reports-value', mentionsValue(transcript.report, last.value), `${last.value} ms`)
  if (last?.rating) check('reports-rating', mentionsRating(transcript.report, last.rating), last.rating)

  return checks
}
