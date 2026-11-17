const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { decide, listChangedFiles, main } = require('./ci-skip-slow-steps')

const pr = (changedFiles) => decide({ eventName: 'pull_request', changedFiles })

const runsAll = (result) => result.skipBuild === false && result.skipE2e === false

test('a push never skips anything, even when only documentation changed', () => {
  assert.ok(runsAll(decide({ eventName: 'push', changedFiles: ['CONTRIBUTING.md'] })))
})

test('a pull request that only changes documentation skips the build and the e2e tests, with no label', () => {
  const files = ['CONTRIBUTING.md', 'public/demos/README.md', 'docs/RELEASING.md', 'LICENSE', 'cli/CHANGELOG.md']
  const result = pr(files)
  assert.equal(result.skipBuild, true)
  assert.equal(result.skipE2e, true)
  assert.match(result.reason, /only documentation changed/)
})

// The e2e tests run the CLI and the extension on snippets: a page, a component or a style of the site
// reaches neither, and the build checks them
test('a pull request that only changes the site builds it and skips the e2e tests', () => {
  const files = [
    'content/Loading/TTFB.mdx',
    'content/Loading/_meta.js',
    'components/Catalog.jsx',
    'components/PageSchema.test.jsx',
    'app/sitemap.js',
    'styles/globals.css',
    'public/demos/lcp.html',
    'lib/catalog.js',
    'lib/sitemap-routes.test.js',
    'mdx-components.js',
    'next.config.mjs',
    'CHANGELOG.md',
  ]
  const result = pr(files)
  assert.equal(result.skipBuild, false)
  assert.equal(result.skipE2e, true)
  assert.match(result.reason, /only the site changed, so the e2e tests are skipped/)
})

test('a pull request that changes a snippet runs everything', () => {
  const result = pr(['CONTRIBUTING.md', 'snippets/CoreWebVitals/LCP.js'])
  assert.ok(runsAll(result))
  assert.match(result.reason, /snippets\/CoreWebVitals\/LCP\.js/)
})

// The CLI, the extension and what builds the extension: the libraries of the site it imports, the
// scripts, the manifests and the workflows
test('what the CLI and the extension run or are built from runs everything', () => {
  for (const file of [
    'cli/src/bin.js',
    'cli/tests/e2e/crux.test.js',
    'extension/panel.js',
    'snippets/_view/index.js',
    'lib/snippet-prompt.mjs',
    'lib/snippet-expression.mjs',
    'lib/webmcp-registry.mjs',
    'lib/markdown-path.mjs',
    'lib/page-info.js',
    'scripts/build-extension.mjs',
    'scripts/check-consistency.js',
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
    'package.json',
    'package-lock.json',
  ]) {
    assert.ok(runsAll(pr([file])), file)
    assert.ok(runsAll(pr(['content/CLI.mdx', file])), `${file} with a page`)
  }
})

test('a file the rules do not know runs everything', () => {
  assert.ok(runsAll(pr(['some-new-dir/thing.txt'])))
  assert.ok(runsAll(pr(['.nvmrc'])))
})

test('without a list of changed files nothing is skipped', () => {
  const result = pr([])
  assert.ok(runsAll(result))
  assert.match(result.reason, /could not/)
})

test('the reason names at most three files that run the e2e tests', () => {
  const result = pr(['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'content/CLI.mdx'])
  assert.ok(runsAll(result))
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

test('main writes both skips and a summary line for a docs-only pull request', async () => {
  const fetchJson = async () => [{ filename: 'CONTRIBUTING.md' }]
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip_build=true$/m)
  assert.match(output, /^skip_e2e=true$/m)
  assert.match(summary, /only documentation changed/)
})

test('main skips only the e2e tests of a pull request that changes the site', async () => {
  const fetchJson = async () => [{ filename: 'content/Loading/TTFB.mdx' }]
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip_build=false$/m)
  assert.match(output, /^skip_e2e=true$/m)
  assert.match(summary, /only the site changed/)
})

test('main skips nothing and says why for a pull request that changes code', async () => {
  const fetchJson = async () => [{ filename: 'CONTRIBUTING.md' }, { filename: 'cli/src/bin.js' }]
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip_build=false$/m)
  assert.match(output, /^skip_e2e=false$/m)
  assert.match(summary, /cli\/src\/bin\.js/)
})

test('main runs everything when the API call fails', async () => {
  const fetchJson = async () => {
    throw new Error('rate limited')
  }
  const { output, summary } = await runMain({ env: prEnv, fetchJson })
  assert.match(output, /^skip_build=false$/m)
  assert.match(output, /^skip_e2e=false$/m)
  assert.match(summary, /could not/)
})

test('main runs everything on a push without calling the API', async () => {
  let calls = 0
  const fetchJson = async () => {
    calls++
    return [{ filename: 'CONTRIBUTING.md' }]
  }
  const { output } = await runMain({ env: { EVENT_NAME: 'push' }, fetchJson })
  assert.match(output, /^skip_build=false$/m)
  assert.match(output, /^skip_e2e=false$/m)
  assert.equal(calls, 0)
})
