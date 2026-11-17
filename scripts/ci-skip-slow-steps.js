// Decides which slow steps of CI a pull request may skip: the build, and the e2e tests that launch
// Chromium to run the CLI and the extension.
//
// A pull request that only changes documentation skips both. One that only changes the site, its
// pages, components, styles and static files, builds it and skips the e2e tests, which run neither.
// Any other file, including one the rules do not know, runs everything, so a later push that touches
// code runs the tests again. No .md file feeds the build or the e2e tests; SCHEMA.md and the
// WORKFLOWS.md files feed the skills, which `generate-skills:check` checks on every run. A push to
// main always runs everything, and so does any case where the changed files cannot be listed.

const fs = require('node:fs')

const PAGE_SIZE = 100

const DOCUMENTATION = [/\.md$/, /^docs\//, /^LICENSE$/]
const isDocumentation = (file) => DOCUMENTATION.some((pattern) => pattern.test(file))

// The site: what the build checks and the e2e tests do not run
const SITE = [/^content\//, /^components\//, /^app\//, /^styles\//, /^public\//, /^lib\//, /^mdx-components\.js$/, /^next\.config\.mjs$/]
// The libraries of lib/ that the extension is built from (scripts/build-extension.mjs), which its e2e tests load
const EXTENSION_LIBS = [/^lib\/snippet-/, /^lib\/webmcp-registry\.mjs$/, /^lib\/markdown-path\.mjs$/, /^lib\/page-info\.js$/]
const isSite = (file) => SITE.some((pattern) => pattern.test(file)) && !EXTENSION_LIBS.some((pattern) => pattern.test(file))

const runEverything = (reason) => ({ skipBuild: false, skipE2e: false, reason })

function decide({ eventName, changedFiles }) {
  if (eventName !== 'pull_request') return runEverything('not a pull request, so everything runs')
  if (changedFiles.length === 0) return runEverything('could not list the changed files, so everything runs')

  const code = changedFiles.filter((file) => !isDocumentation(file) && !isSite(file))
  if (code.length > 0) {
    const shown = code.slice(0, 3).join(', ')
    const more = code.length > 3 ? ` and ${code.length - 3} more` : ''
    return runEverything(`the pull request changes ${shown}${more}, so everything runs`)
  }
  // A .md file under public/ or lib/ is still documentation
  if (changedFiles.some((file) => !isDocumentation(file) && isSite(file))) {
    return { skipBuild: false, skipE2e: true, reason: 'only the site changed, so the e2e tests are skipped and the build runs' }
  }
  return { skipBuild: true, skipE2e: true, reason: 'only documentation changed, so the build and the e2e tests are skipped' }
}

async function listChangedFiles({ repository, number, token, fetchJson }) {
  const files = []
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${repository}/pulls/${number}/files?per_page=${PAGE_SIZE}&page=${page}`
    const entries = await fetchJson(url, token)
    for (const entry of entries) {
      files.push(entry.filename)
      // A rename leaves the old path behind: a code file renamed to .md still counts as code.
      if (entry.previous_filename) files.push(entry.previous_filename)
    }
    if (entries.length < PAGE_SIZE) return files
  }
}

async function fetchJsonFromGitHub(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`)
  return response.json()
}

async function main({ env = process.env, fetchJson = fetchJsonFromGitHub } = {}) {
  const eventName = env.EVENT_NAME

  let changedFiles = []
  if (eventName === 'pull_request') {
    try {
      changedFiles = await listChangedFiles({
        repository: env.REPOSITORY,
        number: env.PR_NUMBER,
        token: env.GH_TOKEN,
        fetchJson,
      })
    } catch {
      changedFiles = []
    }
  }

  const { skipBuild, skipE2e, reason } = decide({ eventName, changedFiles })
  console.log(reason)
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `skip_build=${skipBuild}\nskip_e2e=${skipE2e}\n`)
  // Say in the job summary of every pull request whether the slow steps ran, and why.
  if (env.GITHUB_STEP_SUMMARY && eventName === 'pull_request') {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${reason}\n`)
  }
}

module.exports = { decide, listChangedFiles, main }

if (require.main === module) {
  main().catch((error) => {
    // Failing to decide must not skip the tests.
    console.log(`Could not decide (${error.message}), so everything runs`)
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'skip_build=false\nskip_e2e=false\n')
  })
}
