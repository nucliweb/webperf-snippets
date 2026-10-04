const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { LABEL, decide, listChangedFiles, main } = require('./ci-skip-slow-steps')

const pr = (labels, changedFiles) => decide({ eventName: 'pull_request', labels, changedFiles })

test('a push never skips anything, with or without the label', () => {
  assert.equal(decide({ eventName: 'push', labels: [LABEL], changedFiles: ['CONTRIBUTING.md'] }).skip, false)
})

test('a pull request without the label runs everything', () => {
  assert.equal(pr([], ['CONTRIBUTING.md']).skip, false)
  assert.equal(pr(['bug'], ['CONTRIBUTING.md']).skip, false)
})

test('only the exact label counts', () => {
  assert.equal(pr([`${LABEL}-maybe`], ['CONTRIBUTING.md']).skip, false)
})

test('the label skips the slow steps when every changed file is documentation', () => {
  const files = ['CONTRIBUTING.md', 'public/demos/README.md', 'docs/RELEASING.md', 'LICENSE', 'cli/CHANGELOG.md']
  const result = pr([LABEL], files)
  assert.equal(result.skip, true)
  assert.match(result.reason, /skip-e2e/)
})

test('the label is ignored when a snippet changes', () => {
  const result = pr([LABEL], ['CONTRIBUTING.md', 'snippets/CoreWebVitals/LCP.js'])
  assert.equal(result.skip, false)
  assert.match(result.reason, /snippets\/CoreWebVitals\/LCP\.js/)
})

test('the label is ignored for code, tests, scripts, workflows and manifests', () => {
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
    assert.equal(pr([LABEL], [file]).skip, false, file)
  }
})

test('a page is content, so the label is ignored for .mdx files', () => {
  assert.equal(pr([LABEL], ['content/CLI.mdx']).skip, false)
})

test('a file the rules do not know is treated as code', () => {
  assert.equal(pr([LABEL], ['some-new-dir/thing.txt']).skip, false)
  assert.equal(pr([LABEL], ['.nvmrc']).skip, false)
})

test('without a list of changed files the label cannot be checked, so nothing is skipped', () => {
  const result = pr([LABEL], [])
  assert.equal(result.skip, false)
  assert.match(result.reason, /could not/)
})

test('the reason names at most three files that block the label', () => {
  const result = pr([LABEL], ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'])
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

const prEnv = (labels) => ({
  EVENT_NAME: 'pull_request',
  PR_NUMBER: '7',
  REPOSITORY: 'owner/repo',
  GH_TOKEN: 'token',
  LABELS: JSON.stringify(labels),
})

test('main writes skip=true and a summary line for a docs-only pull request with the label', async () => {
  const fetchJson = async () => [{ filename: 'CONTRIBUTING.md' }]
  const { output, summary } = await runMain({ env: prEnv([LABEL]), fetchJson })
  assert.match(output, /^skip=true$/m)
  assert.match(summary, /skip-e2e/)
})

test('main does not call the API when the label is absent', async () => {
  let calls = 0
  const fetchJson = async () => {
    calls++
    return []
  }
  const { output } = await runMain({ env: prEnv(['bug']), fetchJson })
  assert.match(output, /^skip=false$/m)
  assert.equal(calls, 0)
})

test('main runs everything when the API call fails', async () => {
  const fetchJson = async () => {
    throw new Error('rate limited')
  }
  const { output, summary } = await runMain({ env: prEnv([LABEL]), fetchJson })
  assert.match(output, /^skip=false$/m)
  assert.match(summary, /could not/)
})

test('main runs everything on a push', async () => {
  const { output } = await runMain({ env: { EVENT_NAME: 'push', LABELS: '[]' }, fetchJson: async () => [] })
  assert.match(output, /^skip=false$/m)
})
