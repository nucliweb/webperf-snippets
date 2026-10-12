import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The logo of the home page of the panel is a copy of the one of the site, which the panel cannot load
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const shape = (svg) => svg.match(/\sd="([^"]+)"/)[1]

test('the logo of the panel draws the same shape as the logo of the site', () => {
  assert.equal(shape(read('../logo.svg')), shape(read('../../components/Logo.jsx')))
})
