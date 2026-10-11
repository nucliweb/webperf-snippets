// Summary of a set of runs: how often each check of each case passed, and which ones fall below the
// rate a run of the evals needs to succeed.

const thousands = (n) => `${(n / 1000).toFixed(1)}k`
const average = (runs, value) => runs.reduce((s, r) => s + value(r), 0) / runs.length

export function summarize(runs) {
  const cases = [...new Set(runs.map((r) => r.case))]
  return cases.map((id) => {
    const own = runs.filter((r) => r.case === id)
    const checks = own[0].checks.map(({ id: check }) => {
      const results = own.map((r) => r.checks.find((c) => c.id === check))
      return {
        id: check,
        passed: results.filter((c) => c?.pass).length,
        total: own.length,
        details: results.filter((c) => c && !c.pass && c.detail).map((c) => c.detail),
      }
    })
    return {
      case: id,
      checks,
      tokens: { input: average(own, (r) => r.tokens.input), output: average(own, (r) => r.tokens.output) },
      seconds: Math.round(average(own, (r) => r.durationMs) / 1000),
    }
  })
}

export function belowRate(summary, minRate) {
  return summary.flatMap((c) =>
    c.checks.filter((check) => check.passed / check.total < minRate).map(({ id, passed, total }) => ({ case: c.case, id, passed, total }))
  )
}

const caseTitle = (c) => `${c.case} (${thousands(c.tokens.input)} tokens in, ${thousands(c.tokens.output)} out, ${c.seconds} s)`

export function textSummary(summary) {
  return summary
    .map((c) =>
      [
        caseTitle(c),
        ...c.checks.map(
          ({ id, passed, total, details }) =>
            `  ${id.padEnd(22)} ${String(passed).padStart(2)}/${total} ${`${Math.round((100 * passed) / total)}%`.padStart(4)}${details.length ? `  ${details.join(' | ')}` : ''}`
        ),
      ].join('\n')
    )
    .join('\n')
}

export function markdownSummary(summary, minRate, { pkg, model }) {
  const percent = `${Math.round(minRate * 100)} %`
  const below = belowRate(summary, minRate)
  const cell = (text) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')
  const tables = summary.map((c) =>
    [
      `### ${caseTitle(c)}`,
      '',
      '| Check | Passed | Failures |',
      '|---|---|---|',
      ...c.checks.map(({ id, passed, total, details }) => `| \`${id}\` | ${passed}/${total} | ${cell(details.join('; '))} |`),
    ].join('\n')
  )
  const verdict = below.length
    ? `Below ${percent}: ${below.map((b) => `\`${b.case}\` \`${b.id}\` (${b.passed}/${b.total})`).join(', ')}`
    : `Every check passes at least ${percent} of the runs.`
  return [`## Copy prompt evals`, '', `CLI \`${pkg}\`, model \`${model}\`.`, '', verdict, '', ...tables.flatMap((t) => [t, ''])].join('\n')
}
