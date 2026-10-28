import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

// The inspected page decides its own URL, and the agent runs the command of the prompt in a shell. A
// real sh reads the argument the prompt gives the CLI: it must be one argument, the URL as it is, and
// nothing in it may run, such as a file created by a command substitution
test('promptForPage gives the shell the URL as one argument, whatever it holds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-quote-'))
  const urls = [
    "https://a.test/it's",
    "https://a.test/''",
    'https://a.test/$(touch pwned)',
    'https://a.test/`touch pwned`',
    'https://a.test/${HOME}',
    'https://a.test/a;touch pwned',
    'https://a.test/a&&touch pwned|cat',
    'https://a.test/a%0atouch%20pwned',
    'https://a.test/a\\nb',
    'https://a.test/?q="x" > out',
    "https://a.test/'; touch pwned; echo '",
  ]
  for (const url of urls) {
    const prompt = promptForPage('npx webperf-snippets <url> --json', url)
    const argument = prompt.match(/^npx webperf-snippets (.*) --json$/m)[1]
    const args = execFileSync('sh', ['-c', `printf '%s\\0' ${argument}`], { cwd: dir, encoding: 'utf8' }).split('\0').slice(0, -1)
    assert.deepEqual(args, [url], url)
  }
  assert.equal(existsSync(join(dir, 'pwned')), false, 'a command in a URL ran')
  assert.equal(existsSync(join(dir, 'out')), false, 'a redirection in a URL ran')
})

test('promptForPage leaves the prompt as it is for a page the CLI cannot load', () => {
  assert.equal(promptForPage('# Run\n', 'chrome://extensions/'), '# Run\n')
  assert.equal(promptForPage('# Run\n', undefined), '# Run\n')
})
