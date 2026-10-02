// Decides whether CI may skip its slow steps (build, Chromium, e2e tests).
//
// A person opts in by putting the `skip-e2e` label on a pull request. The label
// is honored only when every changed file is documentation; any other file,
// including one the rules do not know, counts as code and the label is ignored,
// so a label that is forgotten on a pull request that later changes code cannot
// skip the tests. A push to main always runs everything, and so does any case
// where the changed files cannot be listed.

const fs = require('node:fs')

const LABEL = 'skip-e2e'
const PAGE_SIZE = 100

const DOCUMENTATION = [/\.md$/, /^docs\//, /^LICENSE$/]
const isDocumentation = (file) => DOCUMENTATION.some((pattern) => pattern.test(file))

function decide({ eventName, labels, changedFiles }) {
  if (eventName !== 'pull_request') return { skip: false, reason: 'not a pull request, so everything runs' }
  if (!labels.includes(LABEL)) return { skip: false, reason: `no ${LABEL} label, so everything runs` }
  if (changedFiles.length === 0) {
    return { skip: false, reason: `${LABEL} label ignored: could not list the changed files` }
  }

  const code = changedFiles.filter((file) => !isDocumentation(file))
  if (code.length > 0) {
    const shown = code.slice(0, 3).join(', ')
    const more = code.length > 3 ? ` and ${code.length - 3} more` : ''
    return { skip: false, reason: `${LABEL} label ignored: the pull request changes ${shown}${more}` }
  }
  return { skip: true, reason: `${LABEL} label: only documentation changed, so the build and the e2e tests are skipped` }
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
  const labels = JSON.parse(env.LABELS || '[]')

  let changedFiles = []
  // The API is only needed when the label is there to be checked.
  if (eventName === 'pull_request' && labels.includes(LABEL)) {
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

  const { skip, reason } = decide({ eventName, labels, changedFiles })
  console.log(reason)
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `skip=${skip}\n`)
  // The label is a person's decision: always leave a trace of what it did.
  if (env.GITHUB_STEP_SUMMARY && labels.includes(LABEL)) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${reason}\n`)
  }
}

module.exports = { LABEL, decide, listChangedFiles, main }

if (require.main === module) {
  main().catch((error) => {
    // Failing to decide must not skip the tests.
    console.log(`Could not decide (${error.message}), so everything runs`)
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'skip=false\n')
  })
}
