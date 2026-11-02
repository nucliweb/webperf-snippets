// A stand-in for the CrUX API, for the cases about field data: the MCP server points get_crux at it
// (WEBPERF_CRUX_ENDPOINT), so a case knows what real users "had" and the run calls no Google API. It
// answers every URL and origin with the same weekly p75s, given oldest first, as the two APIs do:
// queryRecord with the last week, queryHistoryRecord with the last `collectionPeriodCount` weeks.

// The last day of the most recent period; each period covers the 28 days up to its last day
const LAST_DAY = Date.UTC(2026, 9, 25)
const DAY_MS = 24 * 60 * 60 * 1000

const dateOf = (ms) => {
  const d = new Date(ms)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

// p75s: { largest_contentful_paint: [...], ... } by the metric names of the API, one value per week
export function cruxAnswer({ history, body }, p75s) {
  if (!history) {
    const metrics = Object.fromEntries(Object.entries(p75s).map(([key, values]) => [key, { percentiles: { p75: values.at(-1) } }]))
    return { record: { key: body, metrics } }
  }
  const weeks = Math.min(body.collectionPeriodCount ?? 25, ...Object.values(p75s).map((v) => v.length))
  const collectionPeriods = Array.from({ length: weeks }, (_, i) => {
    const last = LAST_DAY - (weeks - 1 - i) * 7 * DAY_MS
    return { firstDate: dateOf(last - 27 * DAY_MS), lastDate: dateOf(last) }
  })
  const metrics = Object.fromEntries(Object.entries(p75s).map(([key, values]) => [key, { percentilesTimeseries: { p75s: values.slice(-weeks) } }]))
  return { record: { key: body, collectionPeriods, metrics } }
}

// An HTTP handler for createServer that answers both APIs
export function cruxHandler(p75s) {
  return (req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(raw || '{}')
      } catch {
        return res.writeHead(400).end()
      }
      const history = req.url.includes('records:queryHistoryRecord')
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cruxAnswer({ history, body }, p75s)))
    })
  }
}
