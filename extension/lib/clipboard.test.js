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

test('promptForPage adds the page to measure to the prompt', () => {
  assert.equal(promptForPage('# Run the LCP snippet\n', 'https://www.fedex.com/en-us/home.html'), '# Run the LCP snippet\n\nPage to measure: https://www.fedex.com/en-us/home.html\n')
})

test('promptForPage leaves the prompt as it is for a page the CLI cannot load', () => {
  assert.equal(promptForPage('# Run\n', 'chrome://extensions/'), '# Run\n')
  assert.equal(promptForPage('# Run\n', undefined), '# Run\n')
})
