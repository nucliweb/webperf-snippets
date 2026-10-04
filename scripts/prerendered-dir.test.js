const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { findPrerenderedDir } = require('./prerendered-dir')

function withNextDir(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerendered-'))
  try {
    for (const file of files) {
      const full = path.join(dir, file)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '<html></html>')
    }
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('finds the prerendered pages in server/app', () => {
  withNextDir(['server/app/index.html', 'server/app/Loading/TTFB.html'], (dir) => {
    assert.equal(findPrerenderedDir(dir), path.join(dir, 'server', 'app'))
  })
})

test('finds the pages in the route cache that a build adapter leaves, ignoring the folder of the error page', () => {
  withNextDir(
    [
      'server/app/index.rsc',
      'server/route-cache/APP_PAGE/aaaa/$/_global-error.html',
      'server/route-cache/APP_PAGE/bbbb/$/index.html',
      'server/route-cache/APP_PAGE/bbbb/$/Loading/TTFB.html',
      'server/route-cache/APP_PAGE/bbbb/$/CLI.html',
    ],
    (dir) => {
      assert.equal(findPrerenderedDir(dir), path.join(dir, 'server', 'route-cache', 'APP_PAGE', 'bbbb', '$'))
    }
  )
})

test('prefers server/app when it holds pages', () => {
  withNextDir(['server/app/index.html', 'server/route-cache/APP_PAGE/bbbb/$/index.html'], (dir) => {
    assert.equal(findPrerenderedDir(dir), path.join(dir, 'server', 'app'))
  })
})

test('explains where it looked when there are no pages', () => {
  withNextDir(['server/app/index.rsc'], (dir) => {
    assert.throws(() => findPrerenderedDir(dir), /server[\\/]app.*route-cache/s)
  })
})
