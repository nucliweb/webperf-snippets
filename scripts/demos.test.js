const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DEMOS_DIR = path.join(__dirname, '..', 'public', 'demos')
const demos = fs.readdirSync(DEMOS_DIR).filter((file) => file.endsWith('.html'))

// The timestamp requestAnimationFrame hands to its callback comes from the frame's
// own clock, which can lag performance.now(), most of all inside an iframe. A demo
// that starts its animation with performance.now() and then measures elapsed time
// with the frame timestamp mixes the two clocks: the progress comes out negative or
// stays at zero. The clock has to start on the first frame instead.
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

for (const demo of demos) {
  const source = withoutComments(fs.readFileSync(path.join(DEMOS_DIR, demo), 'utf8'))
  if (!source.includes('requestAnimationFrame')) continue

  test(`${demo} starts its animation clock on the first frame`, () => {
    assert.ok(
      !source.includes('performance.now()'),
      `${demo} reads performance.now() next to requestAnimationFrame; take t0 from the first frame timestamp`,
    )
  })
}

test('at least one demo animates with requestAnimationFrame', () => {
  const animated = demos.filter((d) => fs.readFileSync(path.join(DEMOS_DIR, d), 'utf8').includes('requestAnimationFrame'))
  assert.ok(animated.length > 0)
})
