// The summary of a run of the MCP evals: per case and setup, how many runs got the diagnosis right, the
// medians of tokens, turns and time, and how the agent measured.

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summarize(runs) {
  const groups = new Map()
  for (const run of runs) {
    const key = `${run.case}\u0000${run.arm}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(run)
  }
  return [...groups.values()].map((group) => {
    const measured = (run) => run.checks.find((c) => c.id === 'measured')
    return {
      case: group[0].case,
      arm: group[0].arm,
      runs: group.length,
      diagnosis: group.filter((run) => run.checks.filter((c) => c.id !== 'measured').every((c) => c.pass)).length,
      medianInput: median(group.map((run) => run.tokens.input)),
      medianOutput: median(group.map((run) => run.tokens.output)),
      medianTurns: median(group.map((run) => run.turns)),
      medianSeconds: Math.round(median(group.map((run) => run.durationMs)) / 1000),
      published: group.filter((run) => run.snippetRuns.length > 0).length,
      ownCode: group.reduce((sum, run) => sum + (measured(run)?.detail.ownCode ?? 0), 0),
      sentCodeBytes: group.reduce((sum, run) => sum + run.snippetRuns.reduce((s, r) => s + (r.bytes ?? 0), 0), 0),
    }
  })
}

const k = (n) => `${(n / 1000).toFixed(1)}k`

export function markdownSummary(rows, { model, repeat, devtools }) {
  const lines = [
    `Model: ${model}, ${repeat} runs per case and setup, ${devtools}.`,
    '',
    '| Case | Setup | Diagnosis | Input tokens | Output tokens | Turns | Time | Runs with published snippets | Own code calls | Script bytes sent |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.case} | ${r.arm} | ${r.diagnosis}/${r.runs} | ${k(r.medianInput)} | ${k(r.medianOutput)} | ${r.medianTurns} | ${r.medianSeconds} s | ${r.published}/${r.runs} | ${r.ownCode} | ${r.sentCodeBytes} |`),
    '',
    'Tokens, turns and time are medians. Input tokens include the cache reads and writes.',
  ]
  return `${lines.join('\n')}\n`
}
