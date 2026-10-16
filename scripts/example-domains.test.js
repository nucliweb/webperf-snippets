const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// Examples, commands and test data use the domains reserved for documentation (example.com,
// example.net, example.org) or localhost, never a real site. Links to the articles of a site are
// references, not examples, and stay.

const ROOT = path.join(__dirname, '..')
const SOURCES = ['snippets', 'content', 'cli/src', 'cli/tests', 'cli/README.md', 'README.md', 'CONTRIBUTING.md', 'SKILLS.md', 'docs', 'lib', 'scripts']

const EXAMPLES_OF_REAL_SITES = [
  { pattern: /\bbbci?\.co\.uk\b|\bbbc\.com\b/, why: 'a real site as an example domain' },
  { pattern: /\b[a-z0-9-]+\.web\.dev\b/, why: 'a subdomain of web.dev as an example host' },
  // A host of one label (http://x) is a placeholder, not a site
  { pattern: /webperf-snippets https?:\/\/(?![a-z0-9-]+(?:[:/\s]|$))(?!(?:[a-z0-9-]+\.)*example\.(?:com|net|org)\b|127\.0\.0\.1\b)/, why: 'a real site as the target of a CLI command' },
  { pattern: /["'`]https?:\/\/web\.dev\b|https?:\/\/web\.dev\/?(?=\s|$)/m, why: 'web.dev as a sample URL' },
]

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '--', ...SOURCES], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter((f) => f && f !== 'scripts/example-domains.test.js' && /\.(js|mjs|jsx|mdx|md|html|json)$/.test(f))
}

test('examples, commands and test data use reserved domains, not real sites', () => {
  const found = []
  for (const file of trackedFiles()) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const { pattern, why } of EXAMPLES_OF_REAL_SITES) {
        if (pattern.test(line)) found.push(`${file}:${i + 1}: ${why}: ${line.trim().slice(0, 100)}`)
      }
    })
  }
  assert.deepEqual(found, [])
})

test('the patterns tell an example from a reference', () => {
  const matches = (line) => EXAMPLES_OF_REAL_SITES.some(({ pattern }) => pattern.test(line))
  assert.equal(matches('npx webperf-snippets https://web.dev --json'), true)
  assert.equal(matches('<link rel="preconnect" href="https://cdn.web.dev" />'), true)
  assert.equal(matches('const OWN_DOMAINS = ["bbci.co.uk", "bbc.co.uk"];'), true)
  assert.equal(matches('  url: "https://web.dev",'), true)
  assert.equal(matches('User navigates to: https://web.dev/'), true)
  assert.equal(matches('- [Optimize LCP](https://web.dev/articles/optimize-lcp) | web.dev'), false)
  assert.equal(matches('npx webperf-snippets https://example.com --json'), false)
  assert.equal(matches('npx webperf-snippets https://staging.example.com --budget-lcp 2500'), false)
  assert.equal(matches('npx webperf-snippets http://localhost:3000'), false)
  assert.equal(matches("npx -y -p p webperf-snippets http://x --snippet INP"), false)
  assert.equal(matches('npx webperf-snippets https://shop.example.co.uk'), true)
  assert.equal(matches('### Thresholds (according to web.dev)'), false)
})
