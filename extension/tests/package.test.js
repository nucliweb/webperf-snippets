import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { chromium } from 'playwright'
import { packageExtension } from '../../scripts/package-extension.mjs'

// The zip that the beta page links to: what someone who downloads it loads in chrome://extensions

const out = mkdtempSync(join(tmpdir(), 'extension-zip-'))
const zip = packageExtension(out)
const files = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n')
const { version } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

test('the zip is named after the version of the manifest', () => {
  assert.equal(basename(zip), `webperf-snippets-extension-${version}.zip`)
})

test('the zip has the manifest at its root, the built snippets, the view of the results and the icons', () => {
  for (const file of ['manifest.json', 'devtools.html', 'panel.html', 'panel.js', 'snippets.json', 'icons/icon-128.png', 'lib/run.js', 'lib/view/index.js', 'lib/view/locales/en.js']) {
    assert.ok(files.includes(file), `${file} is not in the zip`)
  }
})

test('the zip leaves out the tests and the development files', () => {
  const extra = files.filter((f) => f.startsWith('tests/') || f.endsWith('.test.js') || f === 'package.json' || f === 'README.md')
  assert.deepEqual(extra, [])
})

// What the panel runs, and nothing else: a file that is not on this list, such as a source map, a key or
// a stray folder, fails the test until it is added here on purpose
const SHIPPED = [
  /^(manifest\.json|devtools\.(html|js)|panel\.(html|js|css)|snippets\.json|logo\.svg)$/,
  /^icons\/icon(-\d+\.png|\.svg)$/,
  /^lib\/[a-z-]+\.js$/,
  // The copy of snippets/_view/
  /^lib\/view\/([a-z-]+\/)*[a-z-]+\.(js|json)$/,
]

test('the zip has only the files the panel runs', () => {
  const unexpected = files.filter((f) => !f.endsWith('/') && !SHIPPED.some((pattern) => pattern.test(f)))
  assert.deepEqual(unexpected, [])
})

// The extension can run code in any page DevTools inspects; what it asks Chrome for stays as small as it
// is: storage for the settings and the audits, no access to sites, no scripts injected into pages and
// the default Content Security Policy of Manifest V3 (no inline script, no eval in the panel). A new key
// fails the test until it is added here on purpose.
test('the manifest asks only for storage, with no host access, content scripts or own CSP', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(manifest).sort(), [
    'description', 'devtools_page', 'homepage_url', 'icons', 'manifest_version', 'minimum_chrome_version', 'name', 'permissions', 'version',
  ])
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['storage'])
})

test('Chrome loads the unzipped extension, and the panel loads all its files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'extension-unzipped-'))
  execFileSync('unzip', ['-q', zip, '-d', dir])
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'extension-profile-')), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  })
  try {
    const page = await context.newPage()
    await page.goto('chrome://extensions')
    const extensions = await page.evaluate(() => new Promise((resolve) => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve)))
    const extension = extensions.find((e) => e.name === 'WebPerf Snippets')
    assert.ok(extension, 'the extension was not loaded')
    assert.equal(extension.state, 'ENABLED')
    assert.deepEqual(extension.manifestErrors, [])
    assert.deepEqual(extension.installWarnings, [])

    const failed = []
    page.on('requestfailed', (request) => failed.push(request.url()))
    page.on('response', (response) => response.status() >= 400 && failed.push(response.url()))
    await page.goto(`chrome-extension://${extension.id}/panel.html`, { waitUntil: 'load' })
    await page.evaluate(() => fetch('snippets.json').then((r) => r.json()))
    assert.deepEqual(failed, [])
  } finally {
    await context.close()
  }
})
