import test from 'node:test'
import assert from 'node:assert/strict'
import { copyText, promptForPage } from './clipboard.js'

test('copyText uses the Clipboard API when it works', async () => {
  const written = []
  await copyText('hello', { navigator: { clipboard: { writeText: async (t) => written.push(t) } } })
  assert.deepEqual(written, ['hello'])
})

test('copyText falls back to a selected textarea and execCommand when the Clipboard API is blocked', async () => {
  const calls = []
  const textarea = { style: {}, select: () => calls.push('select') }
  const document = {
    createElement: () => textarea,
    body: { appendChild: () => calls.push('append'), removeChild: () => calls.push('remove') },
    execCommand: (command) => calls.push(command),
  }
  await copyText('hello', { navigator: { clipboard: { writeText: async () => { throw new Error('blocked') } } }, document })
  assert.equal(textarea.value, 'hello')
  assert.deepEqual(calls, ['append', 'select', 'copy', 'remove'])
})

const PROMPT = 'Run:\n\n```bash\nnpx -y -p webperf-snippets@0.4.1 webperf-snippets <url> --snippet LCP --json\n```\n'

test('promptForPage puts the inspected page in the command, and says it is the page to measure', () => {
  assert.equal(
    promptForPage(PROMPT, 'https://shop.example.com/products'),
    "Run:\n\n```bash\nnpx -y -p webperf-snippets@0.4.1 webperf-snippets 'https://shop.example.com/products' --snippet LCP --json\n```\n\nPage to measure: https://shop.example.com/products\n"
  )
})

test('promptForPage quotes the URL for the shell, also with a query string or a quote', () => {
  assert.match(promptForPage(PROMPT, 'https://a.com/?q=1&b=2'), /webperf-snippets 'https:\/\/a\.com\/\?q=1&b=2' --snippet/)
  assert.match(promptForPage(PROMPT, "https://a.com/it's"), /webperf-snippets 'https:\/\/a\.com\/it'\\''s' --snippet/)
})

test('promptForPage leaves the prompt as it is for a page the CLI cannot load', () => {
  assert.equal(promptForPage('# Run\n', 'chrome://extensions/'), '# Run\n')
  assert.equal(promptForPage('# Run\n', undefined), '# Run\n')
})
