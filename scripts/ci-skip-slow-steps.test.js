const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { decide, listChangedFiles, main } = require('./ci-skip-slow-steps')

const pr = (changedFiles) => decide({ eventName: 'pull_request', changedFiles })

test('a push never skips anything, even when only documentation changed', () => {
  assert.equal(decide({ eventName: 'push', changedFiles: ['CONTRIBUTING.md'] }).skip, false)
})

test('a pull request that only changes documentation skips the slow steps, with no label', () => {
  const files = ['CONTRIBUTING.md', 'public/demos/README.md', 'docs/RELEASING.md', 'LICENSE', 'cli/CHANGELOG.md']
  const result = pr(files)
  assert.equal(result.skip, true)
  assert.match(result.reason, /only documentation changed/)
})

test('a pull request that changes a snippet runs everything', () => {
  const result = pr(['CONTRIBUTING.md', 'snippets/CoreWebVitals/LCP.js'])
  assert.equal(result.skip, false)
  assert.match(result.reason, /snippets\/CoreWebVitals\/LCP\.js/)
})

test('code, tests, scripts, workflows and manifests run everything', () => {
  for (const file of [
    'cli/src/bin.js',
    'cli/tests/e2e/crux.test.js',
    'scripts/check-consistency.js',
    'lib/browser-support.js',
    'components/Snippet.jsx',
    'styles/globals.css',
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
    'next.config.mjs',
  ]) {
    assert.equal(pr([file]).skip, false, file)
  }
})

test('a page is content, so an .mdx file runs everything', () => {
  assert.equal(pr(['content/CLI.mdx']).skip, false)
})

test('a file the rules do not know is treated as code', () => {
  assert.equal(pr(['some-new-dir/thing.txt']).skip, false)
  assert.equal(pr(['.nvmrc']).skip, false)
})

test('without a list of changed files nothing is skipped', () => {
  const result = pr([])
  assert.equal(result.skip, false)
  assert.match(result.reason, /could not/)
})

test('the reason names at most three files that are not documentation', () => {
  const result = pr(['a.js', 'b.js', 'c.js', 'd.js', 'e.js'])
  assert.equal(result.skip, false)
  assert.match(result.reason, /a\.js, b\.js, c\.js and 2 more/)
})

test('listChangedFiles reads every page and includes the previous name of a renamed file', async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => ({ filename: `docs/page-${i}.md` })),
    [{ filename: 'notes.md', previous_filename: 'cli/src/old.js' }],
  ]
  const requested = []
  const fetchJson = async (url) => {
    requested.push(url)
    return pages[requested.length - 1]
  }
  const files = await listChangedFiles({ repository: 'owner/repo', number: '7', token: 't', fetchJson })
  assert.equal(requested.length, 2)
  assert.match(requested[0], /repos\/owner\/repo\/pulls\/7\/files\?per_page=100&page=1/)
  assert.equal(files.length, 102)
  assert.ok(files.includes('cli/src/old.js'))
})

function runMain({ env, fetchJson }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-skip-'))
  const output = path.join(dir, 'output')
  const summary = path.join(dir, 'summary')
  fs.writeFileSync(output, '')
  fs.writeFileSync(summary, '')
  return main({ env: { ...env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary }, fetchJson }).then(() => ({
    output: fs.readFileSync(output, 'utf8'),
    summary: fs.readFileSync(summary, 'utf8'),
  }))
}

const prEnv = {
  EVENT_NAME: 'pull_request',
  PR_NUMBER: '7',
  REPOSITORY: 'owner/repo',
  GH_TOKEN: 'token',
}

test('main writes skip=true and a summary line for a docs-only pull request', async () => {
  const fetchJson = async () => [{ filename: 'CONTRIBUTING.md' }]
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip=true$/m)
  assert.match(summary, /only documentation changed/)
})

test('main writes skip=false and says why for a pull request that changes code', async () => {
  const fetchJson = async () => [{ filename: 'CONTRIBUTING.md' }, { filename: 'cli/src/bin.js' }]
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip=false$/m)
  assert.match(summary, /cli\/src\/bin\.js/)
})

test('main runs everything when the API call fails', async () => {
  const fetchJson = async () => {
    throw new Error('rate limited')
  }
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip=false$/m)
  assert.match(summary, /could not/)
})

test('main runs everything on a push without calling the API', async () => {
  let calls = 0
  const fetchJson = async () => {
    calls++
    return [{ filename: 'CONTRIBUTING.md' }]
  }
  const { output } = await runMain({ env: { EVENT_NAME: 'push' }, fetchJson })
  assert.match(output, /^skip=false$/m)
  assert.equal(calls, 0)
})
