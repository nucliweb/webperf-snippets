const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const DEMOS_DIR = path.join(__dirname, '..', 'public', 'demos')
const README = path.join(DEMOS_DIR, 'README.md')
const HEIGHTS = path.join(__dirname, '..', 'components', 'demo-heights.json')
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

// Theme: the site (next-themes) stores "light", "dark" or "system" in localStorage.theme.
// Anything other than "light" or "dark" follows the OS, on load, when the site changes
// the theme (storage event) and when the OS changes it (media change).

// The theme block runs from `function applyTheme` to the listener of the media change.
const THEME_BLOCK = /^([ \t]*)function applyTheme[\s\S]*?addEventListener\(["']change["'](?:, applyTheme\);|[\s\S]*?\n[ \t]*\}\);)/gm

function themeBlocks(source) {
  return [...source.matchAll(THEME_BLOCK)].map(([block, indent]) =>
    block
      .split('\n')
      .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join('\n'),
  )
}

// Runs a theme block against a fake browser and returns what it can do.
function runTheme(block, { stored = null, osDark = false } = {}) {
  const store = new Map(stored === null ? [] : [['theme', stored]])
  const listeners = { storage: [], change: [] }
  const env = { osDark, theme: undefined }
  const mediaQuery = {
    get matches() {
      return env.osDark
    },
    addEventListener: (type, fn) => listeners[type]?.push(fn),
  }
  const context = {
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          if (name === 'data-theme') env.theme = value
        },
      },
    },
    localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null) },
    matchMedia: () => mediaQuery,
    addEventListener: (type, fn) => listeners[type]?.push(fn),
  }
  context.window = context
  vm.runInNewContext(block, context)
  return {
    get theme() {
      return env.theme
    },
    siteSets(value) {
      if (value === null) store.delete('theme')
      else store.set('theme', value)
      for (const fn of listeners.storage) fn({ key: 'theme', newValue: value })
    },
    osSets(dark) {
      env.osDark = dark
      for (const fn of listeners.change) fn({ matches: dark })
    },
  }
}

function assertFollowsTheme(block, where) {
  for (const osDark of [false, true]) {
    const os = osDark ? 'dark' : 'light'
    assert.equal(runTheme(block, { stored: 'system', osDark }).theme, os, `${where}: "system" on a ${os} OS`)
    assert.equal(runTheme(block, { stored: null, osDark }).theme, os, `${where}: no stored theme on a ${os} OS`)
    assert.equal(runTheme(block, { stored: 'unknown', osDark }).theme, os, `${where}: an unknown value on a ${os} OS`)
  }
  assert.equal(runTheme(block, { stored: 'light', osDark: true }).theme, 'light', `${where}: "light" on a dark OS`)
  assert.equal(runTheme(block, { stored: 'dark', osDark: false }).theme, 'dark', `${where}: "dark" on a light OS`)

  const fromSite = runTheme(block, { stored: 'light', osDark: true })
  fromSite.siteSets('system')
  assert.equal(fromSite.theme, 'dark', `${where}: the site switches to "system" on a dark OS`)
  fromSite.siteSets('light')
  assert.equal(fromSite.theme, 'light', `${where}: the site switches to "light"`)

  const followsOs = runTheme(block, { stored: 'system', osDark: false })
  followsOs.osSets(true)
  assert.equal(followsOs.theme, 'dark', `${where}: the OS turns dark while the site is on "system"`)

  const pinned = runTheme(block, { stored: 'light', osDark: false })
  pinned.osSets(true)
  assert.equal(pinned.theme, 'light', `${where}: the OS turns dark while the site is on "light"`)
}

for (const demo of demos) {
  test(`${demo} follows the theme of the site, "system" included`, () => {
    const blocks = themeBlocks(fs.readFileSync(path.join(DEMOS_DIR, demo), 'utf8'))
    assert.equal(blocks.length, 1, `${demo} has one theme block`)
    assertFollowsTheme(blocks[0], demo)
  })
}

test('the README shows the same theme block every demo uses', () => {
  const readmeBlocks = themeBlocks(fs.readFileSync(README, 'utf8'))
  assert.ok(readmeBlocks.length >= 1, 'the README has a theme block')
  readmeBlocks.forEach((block, i) => assertFollowsTheme(block, `README block ${i + 1}`))
  const [reference] = readmeBlocks
  for (const block of readmeBlocks) assert.equal(block, reference, 'every theme block of the README is the same')
  for (const demo of demos) {
    const [block] = themeBlocks(fs.readFileSync(path.join(DEMOS_DIR, demo), 'utf8'))
    assert.equal(block, reference, `${demo} copies the theme block of the README`)
  }
})

// Height: the embed reserves the height of each demo before it loads, so the page
// does not shift when the demo reports its height. Run `npm run generate-demo-heights`
// after adding a demo or changing its layout.

test('every demo has a reserved height', () => {
  const heights = JSON.parse(fs.readFileSync(HEIGHTS, 'utf8'))
  for (const demo of demos) {
    const entry = heights[demo]
    assert.ok(entry, `${demo} has no entry in components/demo-heights.json; run npm run generate-demo-heights`)
    for (const key of ['mobile', 'desktop']) {
      assert.ok(Number.isInteger(entry[key]) && entry[key] > 0, `${demo} has a positive ${key} height`)
    }
  }
})

test('the reserved heights list only demos that exist', () => {
  const heights = JSON.parse(fs.readFileSync(HEIGHTS, 'utf8'))
  for (const demo of Object.keys(heights)) {
    assert.ok(demos.includes(demo), `${demo} is in components/demo-heights.json but not in public/demos`)
  }
})
