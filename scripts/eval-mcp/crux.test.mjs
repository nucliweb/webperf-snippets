import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fetchCrux, fetchCruxHistory } from '../../cli/src/crux.js'
import { cruxHandler } from './crux.mjs'

const P75S = {
  largest_contentful_paint: [2100, 2100, 2100, 2100],
  cumulative_layout_shift: ['0.05', '0.05', '0.05', '0.05'],
  interaction_to_next_paint: [180, 200, 240, 290],
}

// The stand-in read by the client of the CLI, as get_crux reads it
async function withServer(run) {
  const server = createServer(cruxHandler(P75S))
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  try {
    await run(`http://127.0.0.1:${server.address().port}/v1/records:queryRecord`)
  } finally {
    server.close()
  }
}

test('the CrUX stand-in answers the p75 of the last week to any URL', async () => {
  await withServer(async (endpoint) => {
    const crux = await fetchCrux({ url: 'https://shop.example/products/trail-shoes', apiKey: 'eval', endpoint })
    assert.equal(crux.scope, 'url')
    assert.deepEqual(
      Object.fromEntries(Object.entries(crux.metrics).map(([name, m]) => [name, m.p75])),
      { LCP: 2100, CLS: 0.05, INP: 290 }
    )
  })
})

test('the CrUX stand-in answers the trend of the weeks asked for, oldest first', async () => {
  await withServer(async (endpoint) => {
    const history = await fetchCruxHistory({ url: 'https://shop.example/products/trail-shoes', apiKey: 'eval', weeks: 3, endpoint })
    assert.equal(history.periods.length, 3)
    assert.deepEqual(history.periods.at(-1), { start: '2026-09-28', end: '2026-10-25' })
    assert.deepEqual(history.metrics.INP.p75s, [200, 240, 290])
    assert.equal(history.metrics.INP.trend, 'worsening')
    assert.equal(history.metrics.LCP.trend, 'stable')
  })
})
